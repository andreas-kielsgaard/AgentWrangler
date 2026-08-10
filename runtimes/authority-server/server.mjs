import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { authorityConnectionsHttp } from "@agent-wrangler/contracts/authority-connections";
import { authorityIdentityHttp } from "@agent-wrangler/contracts/authority-identity";
import {
  authorityRouterConfigurationHttp,
  createAuthorityRouterConfiguration,
} from "@agent-wrangler/contracts/authority-router-configuration";
import { readJsonBody, readPort, routeError, sendJson } from "@agent-wrangler/http-transport";
import { readJsonFile, writeJsonAtomic } from "@agent-wrangler/json-store";
import { startRuntime } from "@agent-wrangler/runtime-diagnostics";

const SLICE = "temporary-durable-data-server-connections/v1";
const STORE_SCHEMA = "temporary-durable-data-server-connection-store/v1";
const packageRoot = fileURLToPath(new URL("./", import.meta.url));
const port = readPort("AUTHORITY_PORT", 4106);
const serverId = process.env.AUTHORITY_ID ?? "local-durable-data-server";
const configurationPath = resolve(
  packageRoot,
  process.env.AUTHORITY_CONNECTIONS_PATH ?? "runtime-data/execution-node-connections.json",
);

if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(serverId)) {
  throw new Error("AUTHORITY_ID must contain 1-64 letters, numbers, underscores, or hyphens.");
}

let store = await readJsonFile(configurationPath, {
  schemaVersion: STORE_SCHEMA,
  serverId,
  connections: [],
});
validateStore(store);
await writeJsonAtomic(configurationPath, store);

function envelope(fields) {
  return { slice: SLICE, productContract: false, temporaryImplementation: true, serverId, ...fields };
}

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validateStore(value) {
  if (value?.schemaVersion !== STORE_SCHEMA || value.serverId !== serverId || !Array.isArray(value.connections)) {
    throw new Error(`Invalid Durable Data Server connection store at ${configurationPath}.`);
  }
  for (const connection of value.connections) validateConnection(connection, true);
}

function validateConnection(connection, stored = false) {
  if (!connection || typeof connection !== "object" || Array.isArray(connection)) {
    throw stored ? new Error("Stored connection must be an object.") : invalid("connection must be an object.");
  }
  if (typeof connection.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(connection.id)) {
    throw stored ? new Error("Stored connection id is invalid.") : invalid("connection id must contain 1-64 letters, numbers, underscores, or hyphens.");
  }
  if (typeof connection.name !== "string" || connection.name.trim().length === 0 || connection.name.length > 100) {
    throw stored ? new Error("Stored connection name is invalid.") : invalid("connection name must contain 1-100 characters.");
  }
  normalizeLoopbackUrl(connection.baseUrl, stored);
  if (typeof connection.enabled !== "boolean") {
    throw stored ? new Error("Stored connection enabled value is invalid.") : invalid("connection enabled must be boolean.");
  }
}

function normalizeLoopbackUrl(raw, stored = false) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" || !new Set(["127.0.0.1", "[::1]", "localhost"]).has(url.hostname)
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error();
    }
    return url.origin;
  } catch {
    if (stored) throw new Error("Stored connection baseUrl is invalid.");
    throw invalid("baseUrl must be an HTTP loopback origin without credentials, path, query, or fragment.");
  }
}

function publicConnection(connection) {
  const { id, name, baseUrl, enabled } = connection;
  return { id, name, baseUrl, enabled };
}

function findConnection(id) {
  return store.connections.find((connection) => connection.id === id);
}

function connectionIdFrom(path, collection) {
  const match = path.match(new RegExp(`^${collection}/([^/]+)$`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function commitConnections(connections) {
  const next = { ...store, connections };
  await writeJsonAtomic(configurationPath, next);
  store = next;
}

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

startRuntime({
  id: "authority-server",
  name: "Durable Data Server (authority-server working name)",
  port,
  async handleRoute({ path, request, response }) {
    if (request.method === "GET" && path === authorityIdentityHttp.paths.identity) {
      sendJson(response, 200, envelope({ server: { id: serverId } }));
      return true;
    }

    const managementId = connectionIdFrom(path, authorityConnectionsHttp.paths.collection);
    if (path === authorityConnectionsHttp.paths.collection || managementId !== null) {
      try {
        if (request.method === "GET" && path === authorityConnectionsHttp.paths.collection) {
          sendJson(response, 200, envelope({ connections: store.connections.map(publicConnection) }));
          return true;
        }
        if (request.method === "POST" && path === authorityConnectionsHttp.paths.collection) {
          const body = await readJsonBody(request);
          if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("connection must be an object.");
          const connection = {
            id: typeof body.id === "string" ? body.id : randomUUID(),
            name: body.name,
            baseUrl: normalizeLoopbackUrl(body.baseUrl),
            enabled: body.enabled ?? true,
          };
          validateConnection(connection);
          if (findConnection(connection.id)) throw conflict("connection id already exists.");
          if (store.connections.some((entry) => entry.name.toLowerCase() === connection.name.toLowerCase())) {
            throw conflict("connection name already exists.");
          }
          await commitConnections([...store.connections, connection]);
          sendJson(response, 201, envelope({ connection: publicConnection(connection) }));
          return true;
        }
        const existing = managementId === null ? null : findConnection(managementId);
        if (managementId !== null && !existing) {
          sendJson(response, 404, envelope({ error: { message: "Connection not found." } }));
          return true;
        }
        if (managementId !== null && request.method === "GET") {
          sendJson(response, 200, envelope({ connection: publicConnection(existing) }));
          return true;
        }
        if (managementId !== null && request.method === "PUT") {
          const body = await readJsonBody(request);
          if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("connection must be an object.");
          const updated = {
            ...existing,
            name: body.name ?? existing.name,
            baseUrl: body.baseUrl === undefined ? existing.baseUrl : normalizeLoopbackUrl(body.baseUrl),
            enabled: body.enabled ?? existing.enabled,
          };
          validateConnection(updated);
          if (store.connections.some((entry) => entry.id !== managementId && entry.name.toLowerCase() === updated.name.toLowerCase())) {
            throw conflict("connection name already exists.");
          }
          await commitConnections(store.connections.map((entry) => entry.id === managementId ? updated : entry));
          sendJson(response, 200, envelope({ connection: publicConnection(updated) }));
          return true;
        }
        if (managementId !== null && request.method === "DELETE") {
          await commitConnections(store.connections.filter((entry) => entry.id !== managementId));
          sendJson(response, 200, envelope({ removedConnectionId: managementId }));
          return true;
        }
      } catch (error) {
        routeError(response, error, envelope);
        return true;
      }
    }

    const routerCollection = authorityRouterConfigurationHttp.paths.connection("").replace(/\/$/, "");
    const routerId = connectionIdFrom(path, routerCollection);
    if (request.method === "GET" && routerId !== null) {
      const connection = findConnection(routerId);
      if (!connection) sendJson(response, 404, envelope({ error: { message: "Connection not found." } }));
      else sendJson(response, 200, createAuthorityRouterConfiguration({ serverId, connection }));
      return true;
    }
    return false;
  },
});
