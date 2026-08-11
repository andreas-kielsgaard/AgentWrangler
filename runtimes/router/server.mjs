import { executionNodeHttp } from "@agent-wrangler/contracts/execution-node";
import {
  authorityRouterConfigurationHttp,
  validateAuthorityRouterConfiguration,
} from "@agent-wrangler/contracts/authority-router-configuration";
import { authorityIdentityHttp } from "@agent-wrangler/contracts/authority-identity";
import { routerPromptsHttp } from "@agent-wrangler/contracts/router-prompts";
import { runtimeLinksHttp } from "@agent-wrangler/contracts/runtime-links";
import { readJsonBody, readPort, requestJson, routeError, sendJson } from "@agent-wrangler/http-transport";
import { logRuntimeActivity, startRuntime } from "@agent-wrangler/runtime-diagnostics";

const SLICE = "temporary-direct-execution-node-routing/v2";
const port = readPort("ROUTER_PORT", 4103);
const serverTimeoutMs = positiveInteger("ROUTER_AUTHORITY_TIMEOUT_MS", 2_000);
const nodeTimeoutMs = positiveInteger("ROUTER_NODE_TIMEOUT_MS", 125_000);
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

async function resolveConnection(id) {
  const configured = requireDurableServer();
  let result;
  try {
    result = await requestJson(`${configured.baseUrl}${authorityRouterConfigurationHttp.paths.connection(id)}`, {
      timeoutMs: serverTimeoutMs,
    });
  } catch (error) {
    const unavailable = new Error(`Durable Data Server is unavailable: ${error instanceof Error ? error.message : String(error)}`);
    unavailable.statusCode = 503;
    unavailable.code = "durable_data_server_unavailable";
    throw unavailable;
  }
  if (result.statusCode === 404) return null;
  if (result.statusCode < 200 || result.statusCode >= 300) {
    const failed = new Error(`Durable Data Server returned HTTP ${result.statusCode}.`);
    failed.statusCode = 503;
    throw failed;
  }
  const validationError = validateAuthorityRouterConfiguration(result.body, configured.serverId);
  if (validationError) {
    const invalid = new Error(`Durable Data Server response is unusable: ${validationError}.`);
    invalid.statusCode = 503;
    throw invalid;
  }
  return result.body.connection;
}

startRuntime({
  id: "router",
  name: "Wrangle Router",
  port,
  capabilities: () => ({
    operations: [
      "runtime.identity",
      "runtime.health",
      "runtime-links.durable-data.manage",
      "execution-node-connections.resolve",
      "execution-node.execute-prompt",
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
          logRuntimeActivity("configured Durable Data link", durableServer.baseUrl);
          sendJson(response, 200, envelope({ link: durableServer }));
          return true;
        }
        if (request.method === "DELETE") {
          durableServer = null;
          logRuntimeActivity("cleared Durable Data link");
          sendJson(response, 200, envelope({ link: null }));
          return true;
        }
      }
      if (path === runtimeLinksHttp.paths.test("durable-data") && request.method === "POST") {
        const configured = requireDurableServer();
        logRuntimeActivity("testing Durable Data link", configured.baseUrl);
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

      if (request.method !== "POST" || path !== routerPromptsHttp.paths.execute) return false;
      const body = await readJsonBody(request);
      if (typeof body.connectionId !== "string" || body.connectionId.length === 0) {
        const error = new Error("connectionId must be a non-empty string.");
        error.statusCode = 400;
        throw error;
      }
      if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
        const error = new Error("prompt must be a non-empty string.");
        error.statusCode = 400;
        throw error;
      }
      const connection = await resolveConnection(body.connectionId);
      logRuntimeActivity("resolved prompt connection", body.connectionId);
      if (!connection) {
        sendJson(response, 404, envelope({ error: { message: "Connection not found." } }));
        return true;
      }
      if (!connection.enabled) {
        sendJson(response, 409, envelope({ error: { message: "Connection is disabled." } }));
        return true;
      }
      try {
        logRuntimeActivity("forwarding prompt to Execution Node", connection.baseUrl);
        const forwarded = await requestJson(`${connection.baseUrl.replace(/\/$/, "")}${executionNodeHttp.paths.execute}`, {
          method: "POST",
          body: { prompt: body.prompt },
          timeoutMs: nodeTimeoutMs,
        });
        sendJson(response, forwarded.statusCode, forwarded.body);
      } catch (error) {
        sendJson(response, 502, envelope({
          error: { message: `Execution Node is unavailable: ${error instanceof Error ? error.message : String(error)}` },
          connection: { id: connection.id, baseUrl: connection.baseUrl },
        }));
      }
      return true;
    } catch (error) {
      routeError(response, error, envelope);
      return true;
    }
  },
});
