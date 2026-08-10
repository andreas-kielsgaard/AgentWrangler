import assert from "node:assert/strict";
import { test } from "node:test";
import { authorityConnectionsHttp } from "@agent-wrangler/contracts/authority-connections";
import { ranchConnectionsHttp } from "@agent-wrangler/contracts/ranch-connections";
import { runtimeLinksHttp } from "@agent-wrangler/contracts/runtime-links";
import {
  freePort,
  request,
  startNodeProcess,
  startTestServer,
  stopProcess,
  waitForJson,
} from "@agent-wrangler/test-support";

async function startRanch(overrides = {}) {
  const port = await freePort();
  const child = startNodeProcess(new URL("../server.mjs", import.meta.url), {
    environment: {
      RANCH_PORT: String(port),
      AUTHORITY_ID: "test-server",
      AUTHORITY_URL: `http://127.0.0.1:${await freePort()}`,
      RANCH_AUTHORITY_TIMEOUT_MS: "100",
      RANCH_NODE_TEST_TIMEOUT_MS: "500",
      ...overrides,
    },
    label: "ranch",
  });
  await waitForJson(`http://127.0.0.1:${port}/identity`);
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

test("Ranch forwards management and observes the current Execution Node without invoking it", async () => {
  const node = await startTestServer(({ path }) => {
    if (path === "/identity") return { body: { runtime: { id: "execution-node" } } };
    if (path === "/health") return { body: { status: "ok" } };
    if (path === "/capabilities") return { body: { provider: { name: "fixture" } } };
    return { statusCode: 500, body: { error: "unexpected node request" } };
  });
  const connection = { id: "node", name: "Node", baseUrl: node.baseUrl, enabled: true };
  const server = await startTestServer(({ method, path, body }) => {
    if (path === authorityConnectionsHttp.paths.collection && method === "GET") return { body: { serverId: "test-server", connections: [connection] } };
    if (path === authorityConnectionsHttp.paths.collection && method === "POST") return { statusCode: 201, body: { serverId: "test-server", connection: { ...connection, ...body } } };
    if (path === authorityConnectionsHttp.paths.connection("node") && method === "GET") return { body: { serverId: "test-server", connection } };
    if (path === authorityConnectionsHttp.paths.connection("node") && method === "PUT") return { body: { serverId: "test-server", connection: { ...connection, ...body } } };
    if (path === authorityConnectionsHttp.paths.connection("node") && method === "DELETE") return { body: { serverId: "test-server", removedConnectionId: "node" } };
    return { statusCode: 404, body: { error: { message: "missing" } } };
  });
  const ranch = await startRanch({ AUTHORITY_URL: server.baseUrl });
  try {
    assert.equal((await request(`${ranch.baseUrl}/development/execution-node-connections`)).body.connections[0].id, "node");
    assert.equal((await request(`${ranch.baseUrl}/development/execution-node-connections/node`)).body.connection.id, "node");
    assert.equal((await request(`${ranch.baseUrl}/development/execution-node-connections`, {
      method: "POST",
      body: { id: "node", name: "Node", baseUrl: node.baseUrl },
    })).statusCode, 201);
    assert.equal((await request(`${ranch.baseUrl}/development/execution-node-connections/node`, {
      method: "PUT",
      body: { enabled: false },
    })).statusCode, 200);

    const tested = await request(`${ranch.baseUrl}/development/execution-node-connections/node/test`, { method: "POST", body: {} });
    assert.equal(tested.statusCode, 200);
    assert.equal(tested.body.test.invocationPerformed, false);
    assert.equal(tested.body.test.observed.capabilities.provider.name, "fixture");
    assert.deepEqual(node.requests.map(({ path }) => path).sort(), ["/capabilities", "/health", "/identity"]);

    assert.equal((await request(`${ranch.baseUrl}/development/execution-node-connections/node`, { method: "DELETE" })).statusCode, 200);
  } finally {
    await stopProcess(ranch.child);
    await Promise.all([server.close(), node.close()]);
  }
});

test("Ranch stays healthy and reports an unavailable Durable Data Server for a dependent operation", async () => {
  const ranch = await startRanch();
  try {
    assert.equal((await request(`${ranch.baseUrl}/health`)).body.status, "ok");
    const result = await request(`${ranch.baseUrl}/development/execution-node-connections`);
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.error.code, "durable_data_server_unavailable");
  } finally {
    await stopProcess(ranch.child);
  }
});

test("Ranch rejects a response from an unexpected Durable Data Server identity", async () => {
  const server = await startTestServer(() => ({ body: { serverId: "other-server", connections: [] } }));
  const ranch = await startRanch({ AUTHORITY_URL: server.baseUrl });
  try {
    const result = await request(`${ranch.baseUrl}${ranchConnectionsHttp.paths.collection}`);
    assert.equal(result.statusCode, 503);
    assert.match(result.body.error.message, /identity does not match/);
    assert.equal((await request(`${ranch.baseUrl}/health`)).statusCode, 200);
  } finally {
    await stopProcess(ranch.child);
    await server.close();
  }
});

test("Ranch explicitly configures, tests, and clears its session-local Durable Data link", async () => {
  const server = await startTestServer(({ method, path }) => {
    if (method === "GET" && path === "/authority") return { body: { server: { id: "linked-server" } } };
    if (method === "GET" && path === authorityConnectionsHttp.paths.collection) {
      return { body: { serverId: "linked-server", connections: [] } };
    }
    return { statusCode: 404, body: {} };
  });
  const ranch = await startRanch({ AUTHORITY_URL: "" });
  const linkPath = runtimeLinksHttp.paths.link("durable-data");
  try {
    assert.equal((await request(`${ranch.baseUrl}${linkPath}`)).body.link, null);
    assert.equal((await request(`${ranch.baseUrl}${ranchConnectionsHttp.paths.collection}`)).statusCode, 409);

    const configured = await request(`${ranch.baseUrl}${linkPath}`, {
      method: "PUT",
      body: { baseUrl: server.baseUrl },
    });
    assert.equal(configured.body.link.serverId, "linked-server");
    assert.equal((await request(`${ranch.baseUrl}${ranchConnectionsHttp.paths.collection}`)).statusCode, 200);
    assert.equal((await request(`${ranch.baseUrl}${runtimeLinksHttp.paths.test("durable-data")}`, {
      method: "POST",
      body: {},
    })).body.test.reachable, true);

    assert.equal((await request(`${ranch.baseUrl}${linkPath}`, { method: "DELETE" })).body.link, null);
  } finally {
    await stopProcess(ranch.child);
    await server.close();
  }
});
