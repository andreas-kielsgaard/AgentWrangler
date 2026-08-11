import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ranchConnectionsHttp } from "@agent-wrangler/contracts/ranch-connections";
import { routerPromptsHttp } from "@agent-wrangler/contracts/router-prompts";
import { authorityIdentityHttp } from "@agent-wrangler/contracts/authority-identity";
import { runtimeDirectoryHttp } from "@agent-wrangler/contracts/runtime-directory";
import { runtimeLinksHttp } from "@agent-wrangler/contracts/runtime-links";
import { readJsonBody, readPort, requestJson, sendJson } from "@agent-wrangler/http-transport";
import { diagnosticEnvelope, logRuntimeActivity, probeRuntime, startRuntime } from "@agent-wrangler/runtime-diagnostics";

const port = readPort("FARM_PORT", 4105);
const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));
const targetTimeout = Number.parseInt(process.env.FARM_TARGET_TIMEOUT_MS ?? "1500", 10);
let durableServer = process.env.AUTHORITY_URL
  ? { baseUrl: normalizeRuntimeUrl(process.env.AUTHORITY_URL), serverId: process.env.AUTHORITY_ID ?? "local-durable-data-server" }
  : null;

const targets = [
  target("ranch", "Wrangle Ranch", "RANCH", 4101),
  target("gallery", "Wrangle Gallery", "GALLERY", 4102),
  target("router", "Wrangle Router", "ROUTER", 4103),
  target("engine", "Wrangle Engine", "ENGINE", 4104),
  target("authority-server", "Durable Data Server (working name)", "AUTHORITY", 4106),
  target("execution-node", "Codex CLI Execution Node", "CODEX_NODE", 4110),
];

function target(id, name, prefix, defaultPort) {
  const targetPort = readPort(`${prefix}_PORT`, defaultPort);
  return {
    id,
    name,
    url: process.env[`${prefix}_URL`] ?? `http://127.0.0.1:${targetPort}`,
  };
}

function normalizeRuntimeUrl(raw) {
  try {
    const url = new URL(raw);
    if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) throw new Error();
    return url.origin;
  } catch {
    const error = new Error("baseUrl must be an HTTP or HTTPS origin without credentials, path, query, or fragment.");
    error.statusCode = 400;
    throw error;
  }
}

function farmEnvelope(fields) {
  return { productContract: false, temporaryImplementation: true, serverId: durableServer?.serverId ?? null, ...fields };
}

function requireDurableServer() {
  if (durableServer) return durableServer;
  const error = new Error("Durable Data Server is not configured.");
  error.statusCode = 409;
  throw error;
}

async function observeDurableServer(baseUrl) {
  const result = await requestJson(`${baseUrl}${authorityIdentityHttp.paths.identity}`, { timeoutMs: targetTimeout });
  const serverId = result.body?.server?.id;
  if (result.statusCode < 200 || result.statusCode >= 300 || typeof serverId !== "string") {
    const error = new Error("Target did not expose a usable Durable Data Server identity.");
    error.statusCode = 503;
    throw error;
  }
  return { target: "durable-data", baseUrl, serverId };
}

async function durableRequest(path, options = {}) {
  const configured = requireDurableServer();
  const result = await requestJson(`${configured.baseUrl}${path}`, { ...options, timeoutMs: targetTimeout });
  if (result.statusCode < 200 || result.statusCode >= 300) {
    const error = new Error(result.body?.error?.message ?? `Durable Data Server returned HTTP ${result.statusCode}.`);
    error.statusCode = result.statusCode;
    throw error;
  }
  if (result.body?.serverId !== configured.serverId) {
    const error = new Error("Durable Data Server identity does not match Farm's configured server identifier.");
    error.statusCode = 503;
    throw error;
  }
  return result;
}

async function resolveRuntime(id) {
  const result = await durableRequest(runtimeDirectoryHttp.paths.runtime(id));
  if (typeof result.body?.runtime?.baseUrl !== "string") {
    const error = new Error(`Durable Data Server did not provide a usable ${id} endpoint.`);
    error.statusCode = 503;
    throw error;
  }
  logRuntimeActivity("resolved runtime through Durable Data", `${id} ${result.body.runtime.baseUrl}`);
  return result.body.runtime;
}

async function inspectTarget(runtimeTarget) {
  return await probeRuntime(runtimeTarget, targetTimeout);
}

const staticFiles = new Map([
  ["/", { file: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/app.js", { file: "app.js", contentType: "text/javascript; charset=utf-8" }],
  ["/styles.css", { file: "styles.css", contentType: "text/css; charset=utf-8" }],
]);

async function relayJson(request, response, url, timeoutMs = 5_000, override = {}) {
  try {
    const method = override.method ?? request.method;
    const body = override.body ?? (["POST", "PUT", "PATCH"].includes(method)
      ? await readJsonBody(request)
      : undefined);
    const result = await requestJson(url, { method, body, timeoutMs });
    sendJson(response, result.statusCode, result.body);
  } catch (error) {
    sendJson(response, 502, {
      productContract: false,
      temporaryImplementation: true,
      error: {
        code: "development_backend_unavailable",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

startRuntime({
  id: "farm",
  name: "Wrangler Farm",
  port,
  capabilities: () => ({
    operations: [
      "runtime.identity",
      "runtime.health",
      "runtime-status.present",
      "execution-node-connections.present",
      "prompt-results.present",
      "runtime-links.durable-data.manage",
      "runtime-directory.manage-through-durable-data",
      "runtime-directory.connect-durable-data-link",
    ],
    dependencies: [{ id: "durable-data", configured: durableServer !== null }],
  }),
  async handleRoute({ path, request, response, runtime }) {
    const durableLink = runtimeLinksHttp.paths.link("durable-data");
    if (path === durableLink) {
      if (request.method === "GET") {
        sendJson(response, 200, farmEnvelope({ link: durableServer }));
        return true;
      }
      if (request.method === "PUT") {
        const body = await readJsonBody(request);
        durableServer = await observeDurableServer(normalizeRuntimeUrl(body.baseUrl));
        logRuntimeActivity("configured Durable Data link", durableServer.baseUrl);
        sendJson(response, 200, farmEnvelope({ link: durableServer }));
        return true;
      }
      if (request.method === "DELETE") {
        durableServer = null;
        logRuntimeActivity("cleared Durable Data link");
        sendJson(response, 200, farmEnvelope({ link: null }));
        return true;
      }
    }
    if (path === runtimeLinksHttp.paths.test("durable-data") && request.method === "POST") {
      const configured = requireDurableServer();
      const observed = await observeDurableServer(configured.baseUrl);
      if (observed.serverId !== configured.serverId) throw new Error("Durable Data Server identity changed after configuration.");
      sendJson(response, 200, farmEnvelope({ link: configured, test: { reachable: true, observed } }));
      return true;
    }

    if (path === "/development/runtime-directory" && request.method === "GET") {
      const result = await durableRequest(runtimeDirectoryHttp.paths.collection);
      sendJson(response, result.statusCode, result.body);
      return true;
    }
    const runtimeMatch = path.match(/^\/development\/runtime-directory\/([^/]+)(\/connect)?$/);
    if (runtimeMatch) {
      const id = decodeURIComponent(runtimeMatch[1]);
      if (runtimeMatch[2] === "/connect" && request.method === "POST") {
        if (!new Set(["ranch", "router"]).has(id)) {
          sendJson(response, 409, farmEnvelope({ error: { message: `${id} does not expose a Durable Data link in this slice.` } }));
          return true;
        }
        const targetRuntime = await resolveRuntime(id);
        const configured = requireDurableServer();
        logRuntimeActivity("configuring runtime's Durable Data link", id);
        await relayJson(request, response, `${targetRuntime.baseUrl}${runtimeLinksHttp.paths.link("durable-data")}`, 5_000, {
          method: "PUT",
          body: { baseUrl: configured.baseUrl },
        });
        return true;
      }
      if (["GET", "PUT", "DELETE"].includes(request.method)) {
        const body = request.method === "PUT" ? await readJsonBody(request) : undefined;
        const result = await durableRequest(runtimeDirectoryHttp.paths.runtime(id), { method: request.method, body });
        sendJson(response, result.statusCode, result.body);
        return true;
      }
    }

    if (path === "/scaffold/status") {
      const inspected = await Promise.all(targets.map(inspectTarget));
      sendJson(
        response,
        200,
        diagnosticEnvelope({
          observedAt: new Date().toISOString(),
          monitor: { runtime, reachable: true, url: `http://127.0.0.1:${port}` },
          runtimes: inspected,
        }),
      );
      return true;
    }

    if (path === "/development/connections" && ["GET", "POST"].includes(request.method)) {
      const ranch = await resolveRuntime("ranch");
      await relayJson(request, response, `${ranch.baseUrl}${ranchConnectionsHttp.paths.collection}`);
      return true;
    }

    const connectionMatch = path.match(/^\/development\/connections\/([^/]+)(\/test)?$/);
    if (connectionMatch && ["GET", "PUT", "DELETE", "POST"].includes(request.method)) {
      const ranch = await resolveRuntime("ranch");
      const suffix = connectionMatch[2] ?? "";
      await relayJson(
        request,
        response,
        `${ranch.baseUrl}${ranchConnectionsHttp.paths.connection(decodeURIComponent(connectionMatch[1]))}${suffix}`,
      );
      return true;
    }

    if (path === "/development/prompts" && request.method === "POST") {
      const router = await resolveRuntime("router");
      await relayJson(request, response, `${router.baseUrl}${routerPromptsHttp.paths.execute}`, 130_000);
      return true;
    }

    const staticFile = staticFiles.get(path);
    if (!staticFile) {
      return false;
    }

    const body = await readFile(`${publicDirectory}/${staticFile.file}`);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": staticFile.contentType,
    });
    response.end(body);
    return true;
  },
});
