import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import {
  fakeCodexPath,
  freePorts,
  makeTemporaryDirectory,
  removeTemporaryDirectory,
  request,
  startNodeProcess,
  stopProcess,
  waitForJson,
} from "@agent-wrangler/test-support";

const require = createRequire(import.meta.url);
const ids = ["authority-server", "ranch", "router", "farm", "execution-node"];
const entries = Object.fromEntries(ids.map((id) => [id, require.resolve(`@agent-wrangler/${id}`)]));

test("Farm manages a durable connection, Ranch observes the node, and Router executes through the fake provider", async () => {
  const directory = await makeTemporaryDirectory("agent-wrangler-happy-path-");
  const ports = await freePorts(ids);
  const environment = {
    AUTHORITY_PORT: String(ports["authority-server"]),
    RANCH_PORT: String(ports.ranch),
    ROUTER_PORT: String(ports.router),
    FARM_PORT: String(ports.farm),
    CODEX_NODE_PORT: String(ports["execution-node"]),
    AUTHORITY_ID: "test-server",
    CODEX_NODE_URL: `http://127.0.0.1:${ports["execution-node"]}`,
    AUTHORITY_CONNECTIONS_PATH: join(directory, "connections.json"),
    AUTHORITY_RUNTIME_DIRECTORY_PATH: join(directory, "runtime-directory.json"),
    CODEX_EXECUTABLE: process.execPath,
    CODEX_EXECUTABLE_ARGS_JSON: JSON.stringify([fakeCodexPath]),
    CODEX_NODE_WORKING_DIRECTORY: join(directory, "node-workspace"),
    CODEX_TIMEOUT_MS: "2000",
    CODEX_INSPECT_TIMEOUT_MS: "2000",
    RANCH_NODE_TEST_TIMEOUT_MS: "2000",
    ROUTER_NODE_TIMEOUT_MS: "2000",
  };
  const children = Object.fromEntries(ids.map((id) => [id, startNodeProcess(entries[id], { environment, label: id })]));
  try {
    await Promise.all(ids.map((id) => waitForJson(`http://127.0.0.1:${ports[id]}/identity`)));
    const farmUrl = `http://127.0.0.1:${ports.farm}`;
    const authorityUrl = `http://127.0.0.1:${ports["authority-server"]}`;
    const nodeUrl = `http://127.0.0.1:${ports["execution-node"]}`;

    await request(`${farmUrl}/runtime/links/durable-data`, { method: "PUT", body: { baseUrl: authorityUrl } });
    await request(`${farmUrl}/development/runtime-directory/ranch`, {
      method: "PUT",
      body: { baseUrl: `http://127.0.0.1:${ports.ranch}` },
    });
    await request(`${farmUrl}/development/runtime-directory/router`, {
      method: "PUT",
      body: { baseUrl: `http://127.0.0.1:${ports.router}` },
    });
    assert.equal((await request(`${farmUrl}/development/runtime-directory/ranch/connect`, { method: "POST", body: {} })).statusCode, 200);
    assert.equal((await request(`${farmUrl}/development/runtime-directory/router/connect`, { method: "POST", body: {} })).statusCode, 200);

    const created = await request(`${farmUrl}/development/connections`, {
      method: "POST",
      body: { id: "local-node", name: "Local node", baseUrl: nodeUrl },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.body.serverId, "test-server");

    const observed = await request(`${farmUrl}/development/connections/local-node/test`, { method: "POST", body: {} });
    assert.equal(observed.statusCode, 200);
    assert.equal(observed.body.test.invocationPerformed, false);
    assert.equal(observed.body.test.observed.capabilities.provider.version, "fake-codex 1.2.3");

    const executed = await request(`${farmUrl}/development/prompts`, {
      method: "POST",
      body: { connectionId: "local-node", prompt: "one composed prompt" },
    });
    assert.equal(executed.statusCode, 200);
    assert.equal(executed.body.output.text, "fake response: one composed prompt");

    await stopProcess(children["authority-server"]);
    children["authority-server"] = startNodeProcess(entries["authority-server"], { environment, label: "authority-server" });
    await waitForJson(`${authorityUrl}/identity`);
    assert.deepEqual((await request(`${farmUrl}/development/connections`)).body.connections.map((connection) => connection.id), ["local-node"]);
  } finally {
    await Promise.all(Object.values(children).map(stopProcess));
    await removeTemporaryDirectory(directory);
  }
});
