import { executionNodeHttp } from "@agent-wrangler/contracts/execution-node";
import { authorityConnectionsHttp } from "@agent-wrangler/contracts/authority-connections";
import { authorityIdentityHttp } from "@agent-wrangler/contracts/authority-identity";
import { ranchConnectionsHttp } from "@agent-wrangler/contracts/ranch-connections";
import { runtimeLinksHttp } from "@agent-wrangler/contracts/runtime-links";
import { readJsonBody, readPort, requestJson, routeError, sendJson } from "@agent-wrangler/http-transport";
import { startRuntime } from "@agent-wrangler/runtime-diagnostics";

const SLICE = "temporary-execution-node-connection-management/v2";
const port = readPort("RANCH_PORT", 4101);
const serverTimeoutMs = positiveInteger("RANCH_AUTHORITY_TIMEOUT_MS", 2_000);
const nodeTestTimeoutMs = positiveInteger("RANCH_NODE_TEST_TIMEOUT_MS", 3_000);
let durableServer = process.env.AUTHORITY_URL
  ? {
      baseUrl: normalizeRuntimeUrl(process.env.AUTHORITY_URL),
      serverId: process.env.AUTHORITY_ID ?? "local-durable-data-server",
    }
  : null;

function positiveInteger(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function envelope(fields) {
  return { slice: SLICE, productContract: false, temporaryImplementation: true, serverId: durableServer?.serverId ?? null, ...fields };
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

function requireDurableServer() {
  if (durableServer) return durableServer;
  const error = new Error("Durable Data Server is not configured.");
  error.statusCode = 409;
  error.code = "durable_data_server_not_configured";
  throw error;
}

async function observeDurableServer(baseUrl) {
  let result;
  try {
    result = await requestJson(`${baseUrl}${authorityIdentityHttp.paths.identity}`, { timeoutMs: serverTimeoutMs });
  } catch (error) {
    const unavailable = new Error(`Durable Data Server is unavailable: ${error instanceof Error ? error.message : String(error)}`);
    unavailable.statusCode = 503;
    unavailable.code = "durable_data_server_unavailable";
    throw unavailable;
  }
  const observedId = result.body?.server?.id;
  if (result.statusCode < 200 || result.statusCode >= 300 || typeof observedId !== "string") {
    const error = new Error("Target did not expose a usable Durable Data Server identity.");
    error.statusCode = 503;
    error.code = "durable_data_server_identity_unavailable";
    throw error;
  }
  return { target: "durable-data", baseUrl, serverId: observedId };
}

async function durableServerRequest(path, options = {}) {
  const configured = requireDurableServer();
  let result;
  try {
    result = await requestJson(`${configured.baseUrl}${path}`, { ...options, timeoutMs: serverTimeoutMs });
  } catch (error) {
    const unavailable = new Error(`Durable Data Server is unavailable: ${error instanceof Error ? error.message : String(error)}`);
    unavailable.statusCode = 503;
    unavailable.code = "durable_data_server_unavailable";
    throw unavailable;
  }
  if (result.statusCode < 200 || result.statusCode >= 300) {
    const rejected = new Error(result.body?.error?.message ?? `Durable Data Server returned HTTP ${result.statusCode}.`);
    rejected.statusCode = result.statusCode;
    throw rejected;
  }
  if (result.body?.serverId !== configured.serverId) {
    const mismatch = new Error("Durable Data Server identity does not match the configured server identifier.");
    mismatch.statusCode = 503;
    mismatch.code = "durable_data_server_identity_mismatch";
    throw mismatch;
  }
  return result;
}

function connectionIdFrom(path, suffix = "") {
  const match = path.match(new RegExp(`^${ranchConnectionsHttp.paths.collection}/([^/]+)${suffix}$`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function getCurrentConnection(id) {
  const result = await durableServerRequest(authorityConnectionsHttp.paths.connection(id));
  const connection = result.body?.connection;
  if (!connection || typeof connection.baseUrl !== "string") {
    const error = new Error("Durable Data Server response did not include a usable connection.");
    error.statusCode = 503;
    throw error;
  }
  return connection;
}

async function testConnection(connection) {
  const baseUrl = connection.baseUrl.replace(/\/$/, "");
  const [identity, health, capabilities] = await Promise.all([
    requestJson(`${baseUrl}/identity`, { timeoutMs: nodeTestTimeoutMs }),
    requestJson(`${baseUrl}/health`, { timeoutMs: nodeTestTimeoutMs }),
    requestJson(`${baseUrl}${executionNodeHttp.paths.capabilities}`, { timeoutMs: nodeTestTimeoutMs }),
  ]);
  const observed = { identity: identity.body, health: health.body, capabilities: capabilities.body };
  const reachable = [identity, health, capabilities].every((result) => result.statusCode >= 200 && result.statusCode < 300)
    && identity.body?.runtime?.id === "execution-node";
  return envelope({
    connection,
    test: { invocationPerformed: false, reachable, observed },
  });
}

startRuntime({
  id: "ranch",
  name: "Wrangle Ranch",
  port,
  capabilities: () => ({
    operations: [
      "runtime.identity",
      "runtime.health",
      "runtime-links.durable-data.manage",
      "execution-node-connections.list",
      "execution-node-connections.create",
      "execution-node-connections.read",
      "execution-node-connections.update",
      "execution-node-connections.delete",
      "execution-node-connections.observe",
    ],
    dependencies: [{ id: "durable-data", configured: durableServer !== null }],
  }),
  async handleRoute({ path, request, response }) {
    try {
      const durableLink = runtimeLinksHttp.paths.link("durable-data");
      if (path === durableLink) {
        if (request.method === "GET") {
          sendJson(response, 200, envelope({ link: durableServer }));
          return true;
        }
        if (request.method === "PUT") {
          const body = await readJsonBody(request);
          durableServer = await observeDurableServer(normalizeRuntimeUrl(body.baseUrl));
          sendJson(response, 200, envelope({ link: durableServer }));
          return true;
        }
        if (request.method === "DELETE") {
          durableServer = null;
          sendJson(response, 200, envelope({ link: null }));
          return true;
        }
      }
      if (path === runtimeLinksHttp.paths.test("durable-data") && request.method === "POST") {
        const configured = requireDurableServer();
        const observed = await observeDurableServer(configured.baseUrl);
        if (observed.serverId !== configured.serverId) {
          const error = new Error("Durable Data Server identity changed after configuration.");
          error.statusCode = 503;
          error.code = "durable_data_server_identity_mismatch";
          throw error;
        }
        sendJson(response, 200, envelope({ link: configured, test: { reachable: true, observed } }));
        return true;
      }

      if (!path.startsWith(ranchConnectionsHttp.paths.collection)) return false;
      if (path === ranchConnectionsHttp.paths.collection && ["GET", "POST"].includes(request.method)) {
        const body = request.method === "POST" ? await readJsonBody(request) : undefined;
        const result = await durableServerRequest(authorityConnectionsHttp.paths.collection, { method: request.method, body });
        sendJson(response, result.statusCode, result.body);
        return true;
      }
      const testId = connectionIdFrom(path, "/test");
      if (request.method === "POST" && testId !== null) {
        const connection = await getCurrentConnection(testId);
        try {
          const result = await testConnection(connection);
          sendJson(response, result.test.reachable ? 200 : 503, result);
        } catch (error) {
          sendJson(response, 503, envelope({
            connection,
            test: { invocationPerformed: false, reachable: false, error: error instanceof Error ? error.message : String(error) },
          }));
        }
        return true;
      }
      const id = connectionIdFrom(path);
      if (id !== null && ["GET", "PUT", "DELETE"].includes(request.method)) {
        const body = request.method === "PUT" ? await readJsonBody(request) : undefined;
        const result = await durableServerRequest(authorityConnectionsHttp.paths.connection(id), { method: request.method, body });
        sendJson(response, result.statusCode, result.body);
        return true;
      }
    } catch (error) {
      routeError(response, error, envelope);
      return true;
    }
    return false;
  },
});
