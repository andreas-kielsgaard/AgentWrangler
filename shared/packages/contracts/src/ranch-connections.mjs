const collection = "/development/execution-node-connections";

export const ranchConnectionsHttp = Object.freeze({
  schemaVersion: "temporary-ranch-execution-node-connections-http/v1",
  producer: "ranch",
  paths: Object.freeze({
    collection,
    connection: (id) => `${collection}/${encodeURIComponent(id)}`,
    test: (id) => `${collection}/${encodeURIComponent(id)}/test`,
  }),
});
