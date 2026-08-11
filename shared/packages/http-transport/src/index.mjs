import http from "node:http";

const DEFAULT_BODY_LIMIT = 256 * 1024;
const ROUTINE_OUTGOING_PATHS = new Set(["/identity", "/health", "/runtime/capabilities"]);
let activitySource = null;
const routineOutgoingSeen = new Set();

export function setHttpActivitySource(runtimeId) {
  activitySource = runtimeId;
}

function outgoingLogDecision(method, url) {
  if (!activitySource) return false;
  const path = new URL(url).pathname;
  const routine = method === "GET" && ROUTINE_OUTGOING_PATHS.has(path);
  const key = `${method} ${url}`;
  if (routine && routineOutgoingSeen.has(key)) return false;
  if (routine) routineOutgoingSeen.add(key);
  return true;
}

function responseLabel(body, method, url) {
  return body?.runtime?.id ?? body?.server?.id ?? body?.serverId ?? `${method} ${url}`;
}

export function readPort(environmentName, fallback) {
  const rawValue = process.env[environmentName];
  if (rawValue === undefined) return fallback;
  const port = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${environmentName} must be an integer from 1 through 65535.`);
  }
  return port;
}

export function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body, null, 2));
}

export async function fetchJson(url, timeoutMs = 1_500) {
  const result = await requestJson(url, { timeoutMs });
  if (result.statusCode < 200 || result.statusCode >= 300) throw new Error(`HTTP ${result.statusCode}`);
  if (result.body?.error?.code === "invalid_json_response") throw new Error("Response was not valid JSON.");
  return result.body;
}

export async function readJsonBody(request, limit = DEFAULT_BODY_LIMIT) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    const text = Buffer.concat(chunks).toString("utf8");
    return text.length === 0 ? {} : JSON.parse(text);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

export async function requestJson(url, options = {}) {
  const method = options.method ?? "GET";
  const logActivity = outgoingLogDecision(method, url);
  if (logActivity) console.log(`[request]  ${method} ${url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 2_000);
  try {
    const response = await fetch(url, {
      method,
      headers: options.body === undefined ? undefined : { "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let body;
    try {
      body = text.length === 0 ? null : JSON.parse(text);
    } catch {
      body = { error: { code: "invalid_json_response", message: text } };
    }
    if (logActivity) console.log(`[response] ${response.status} ${responseLabel(body, method, url)}`);
    return { statusCode: response.status, body };
  } catch (error) {
    if (logActivity) console.log(`[response] FAILED ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function routeError(response, error, envelope = (value) => value) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  sendJson(response, statusCode, envelope({
    error: {
      code: error?.code ?? (statusCode === 500 ? "internal_error" : "invalid_request"),
      message: error instanceof Error ? error.message : String(error),
    },
  }));
}

export function startHttpServer({ host, port, handleRequest, onListening }) {
  const server = http.createServer(async (request, response) => {
    try {
      await handleRequest(request, response);
    } catch (error) {
      if (!response.headersSent) routeError(response, error);
      else response.destroy(error);
    }
  });
  server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
  server.listen(port, host, onListening);
  return server;
}
