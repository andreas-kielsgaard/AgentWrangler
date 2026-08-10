import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const fakeCodexPath = fileURLToPath(new URL("../fixtures/fake-codex.mjs", import.meta.url));

export async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

export async function freePorts(names) {
  const values = await Promise.all(names.map(() => freePort()));
  return Object.fromEntries(names.map((name, index) => [name, values[index]]));
}

export async function makeTemporaryDirectory(prefix = "agent-wrangler-test-") {
  return await mkdtemp(join(os.tmpdir(), prefix));
}

export async function removeTemporaryDirectory(path) {
  await rm(path, { recursive: true, force: true });
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);
  try {
    let body;
    let headers = options.headers;
    if (options.rawBody !== undefined) body = options.rawBody;
    else if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers = { "content-type": "application/json", ...headers };
    }
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    let parsedBody = null;
    try {
      parsedBody = text.length === 0 ? null : JSON.parse(text);
    } catch {
      parsedBody = undefined;
    }
    return {
      statusCode: response.status,
      headers: response.headers,
      contentType: response.headers.get("content-type"),
      text,
      body: parsedBody,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function waitForJson(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await request(url, { timeoutMs: Math.min(1_000, timeoutMs) });
      if (result.statusCode >= 200 && result.statusCode < 300 && result.body !== undefined) return result.body;
      lastError = new Error(`HTTP ${result.statusCode}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? "unknown error"}`);
}

export function startNodeProcess(script, options = {}) {
  const resolvedScript = script instanceof URL ? fileURLToPath(script) : script;
  const output = options.output ?? [];
  const child = spawn(process.execPath, [resolvedScript], {
    cwd: options.cwd ?? dirname(resolvedScript),
    env: { ...process.env, ...options.environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const label = options.label ?? resolvedScript;
  child.stdout.on("data", (chunk) => output.push(`[${label}] ${chunk}`));
  child.stderr.on("data", (chunk) => output.push(`[${label}] ${chunk}`));
  child.testOutput = output;
  return child;
}

export async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2_000);
    timeout.unref();
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill();
  });
}

export async function waitForExit(child, timeoutMs = 5_000) {
  if (child.exitCode !== null) return child.exitCode;
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for process exit.")), timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

export async function startTestServer(handler, requestedPort) {
  const requests = [];
  const port = requestedPort ?? await freePort();
  const server = http.createServer(async (incoming, response) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    let body;
    try {
      body = text.length === 0 ? null : JSON.parse(text);
    } catch {
      body = undefined;
    }
    const observed = {
      method: incoming.method,
      path: new URL(incoming.url ?? "/", `http://127.0.0.1:${port}`).pathname,
      headers: incoming.headers,
      text,
      body,
    };
    requests.push(observed);
    const result = await handler(observed, requests) ?? { statusCode: 404, body: { error: "not found" } };
    if (result.delayMs) await new Promise((resolve) => setTimeout(resolve, result.delayMs));
    const responseBody = result.rawBody !== undefined ? result.rawBody : JSON.stringify(result.body ?? null);
    response.writeHead(result.statusCode ?? 200, {
      "content-type": result.contentType ?? "application/json; charset=utf-8",
      ...result.headers,
    });
    response.end(responseBody);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export function runtimeDiagnosticHandler(identity) {
  return ({ path }) => {
    if (path === "/identity") {
      return { body: { runtime: { id: identity.id, name: identity.name ?? identity.id }, processId: identity.processId ?? 9001 } };
    }
    if (path === "/health") return { body: { status: identity.health ?? "ok" } };
    return { statusCode: 404, body: { error: "not found" } };
  };
}
