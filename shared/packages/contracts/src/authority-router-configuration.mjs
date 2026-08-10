export const AUTHORITY_ROUTER_CONFIGURATION_SCHEMA = "temporary-durable-data-server-router-connection/v1";

const collection = "/router/execution-node-connections";

export const authorityRouterConfigurationHttp = Object.freeze({
  schemaVersion: "temporary-durable-data-server-router-http/v1",
  producer: "authority-server",
  paths: Object.freeze({
    connection: (id) => `${collection}/${encodeURIComponent(id)}`,
  }),
});

export function createAuthorityRouterConfiguration({ serverId, connection }) {
  return {
    schemaVersion: AUTHORITY_ROUTER_CONFIGURATION_SCHEMA,
    serverId,
    connection: {
      id: connection.id,
      baseUrl: connection.baseUrl,
      enabled: connection.enabled,
    },
  };
}

export function validateAuthorityRouterConfiguration(value, expectedServerId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "response must be an object";
  if (value.schemaVersion !== AUTHORITY_ROUTER_CONFIGURATION_SCHEMA) return "schemaVersion is unsupported";
  if (value.serverId !== expectedServerId) return "serverId does not match";
  const connection = value.connection;
  if (!connection || typeof connection !== "object" || Array.isArray(connection)) return "connection is missing";
  if (typeof connection.id !== "string" || connection.id.length === 0) return "connection id is invalid";
  if (typeof connection.enabled !== "boolean") return "connection enabled is invalid";
  try {
    const url = new URL(connection.baseUrl);
    if (url.protocol !== "http:" || !new Set(["127.0.0.1", "[::1]", "localhost"]).has(url.hostname)
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return "connection baseUrl must be a loopback HTTP origin";
    }
  } catch {
    return "connection baseUrl is invalid";
  }
  return null;
}
