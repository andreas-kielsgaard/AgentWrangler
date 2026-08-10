import { executionNodeHttp } from "@agent-wrangler/contracts/execution-node";
import {
  authorityRouterConfigurationHttp,
  validateAuthorityRouterConfiguration,
} from "@agent-wrangler/contracts/authority-router-configuration";
import { routerPromptsHttp } from "@agent-wrangler/contracts/router-prompts";
import { readJsonBody, readPort, requestJson, routeError, sendJson } from "@agent-wrangler/http-transport";
import { startRuntime } from "@agent-wrangler/runtime-diagnostics";

const SLICE = "temporary-direct-execution-node-routing/v2";
const port = readPort("ROUTER_PORT", 4103);
const durableServerPort = readPort("AUTHORITY_PORT", 4106);
const serverId = process.env.AUTHORITY_ID ?? "local-durable-data-server";
const durableServerUrl = (process.env.AUTHORITY_URL ?? `http://127.0.0.1:${durableServerPort}`).replace(/\/$/, "");
const serverTimeoutMs = positiveInteger("ROUTER_AUTHORITY_TIMEOUT_MS", 2_000);
const nodeTimeoutMs = positiveInteger("ROUTER_NODE_TIMEOUT_MS", 125_000);

function positiveInteger(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function envelope(fields) {
  return { slice: SLICE, productContract: false, temporaryImplementation: true, serverId, ...fields };
}

async function resolveConnection(id) {
  let result;
  try {
    result = await requestJson(`${durableServerUrl}${authorityRouterConfigurationHttp.paths.connection(id)}`, {
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
  const validationError = validateAuthorityRouterConfiguration(result.body, serverId);
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
  async handleRoute({ path, request, response }) {
    if (request.method !== "POST" || path !== routerPromptsHttp.paths.execute) return false;
    try {
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
      if (!connection) {
        sendJson(response, 404, envelope({ error: { message: "Connection not found." } }));
        return true;
      }
      if (!connection.enabled) {
        sendJson(response, 409, envelope({ error: { message: "Connection is disabled." } }));
        return true;
      }
      try {
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
