const collection = "/configuration/execution-node-connections";

export const authorityConnectionsHttp = Object.freeze({
  schemaVersion: "temporary-authority-execution-node-connections-http/v1",
  producer: "authority-server",
  paths: Object.freeze({
    collection,
    connection: (id) => `${collection}/${encodeURIComponent(id)}`,
  }),
});
