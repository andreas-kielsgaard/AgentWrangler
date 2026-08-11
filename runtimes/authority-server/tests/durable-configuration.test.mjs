import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { authorityConnectionsHttp } from "@agent-wrangler/contracts/authority-connections";
import { authorityIdentityHttp } from "@agent-wrangler/contracts/authority-identity";
import { authorityRouterConfigurationHttp } from "@agent-wrangler/contracts/authority-router-configuration";
import { runtimeDirectoryHttp } from "@agent-wrangler/contracts/runtime-directory";
import {
  freePort,
  makeTemporaryDirectory,
  readJson,
  removeTemporaryDirectory,
  request,
  startNodeProcess,
  stopProcess,
  waitForJson,
} from "@agent-wrangler/test-support";

const startRuntime = (environment) => startNodeProcess(new URL("../server.mjs", import.meta.url), {
  environment,
  label: "authority-server",
});

async function startServer(directory) {
  const port = await freePort();
  const configurationPath = join(directory, "connections.json");
  const runtimeDirectoryPath = join(directory, "runtime-directory.json");
  const environment = {
    AUTHORITY_PORT: String(port),
    AUTHORITY_ID: "test-server",
    AUTHORITY_CONNECTIONS_PATH: configurationPath,
    AUTHORITY_RUNTIME_DIRECTORY_PATH: runtimeDirectoryPath,
  };
  const child = startRuntime(environment);
  await waitForJson(`http://127.0.0.1:${port}/identity`);
  return { child, baseUrl: `http://127.0.0.1:${port}`, configurationPath, runtimeDirectoryPath, environment };
}

test("Durable Data Server starts, persists one connection, and supports its happy-flow operations", async () => {
  const directory = await makeTemporaryDirectory("agent-wrangler-durable-server-");
  const server = await startServer(directory);
  try {
    assert.equal((await request(`${server.baseUrl}/health`)).body.status, "ok");
    assert.equal((await request(`${server.baseUrl}${authorityIdentityHttp.paths.identity}`)).body.server.id, "test-server");

    const created = await request(`${server.baseUrl}${authorityConnectionsHttp.paths.collection}`, {
      method: "POST",
      body: { id: "local-node", name: "Local node", baseUrl: "http://localhost:4110" },
    });
    assert.equal(created.statusCode, 201);
    assert.deepEqual(created.body.connection, {
      id: "local-node",
      name: "Local node",
      baseUrl: "http://localhost:4110",
      enabled: true,
    });

    await stopProcess(server.child);
    server.child = startRuntime(server.environment);
    await waitForJson(`${server.baseUrl}/identity`);
    assert.deepEqual((await request(`${server.baseUrl}${authorityConnectionsHttp.paths.collection}`)).body.connections, [created.body.connection]);

    const routed = await request(`${server.baseUrl}${authorityRouterConfigurationHttp.paths.connection("local-node")}`);
    assert.deepEqual(routed.body.connection, { id: "local-node", baseUrl: "http://localhost:4110", enabled: true });

    const updated = await request(`${server.baseUrl}${authorityConnectionsHttp.paths.connection("local-node")}`, {
      method: "PUT",
      body: { enabled: false },
    });
    assert.equal(updated.body.connection.enabled, false);
    assert.equal((await request(`${server.baseUrl}${authorityConnectionsHttp.paths.connection("local-node")}`, { method: "DELETE" })).statusCode, 200);
    assert.deepEqual((await request(`${server.baseUrl}${authorityConnectionsHttp.paths.collection}`)).body.connections, []);

    const stored = await readJson(server.configurationPath);
    assert.deepEqual(Object.keys(stored).sort(), ["connections", "schemaVersion", "serverId"]);

    const registered = await request(`${server.baseUrl}${runtimeDirectoryHttp.paths.runtime("ranch")}`, {
      method: "PUT",
      body: { baseUrl: "http://127.0.0.1:4101" },
    });
    assert.deepEqual(registered.body.runtime, { id: "ranch", baseUrl: "http://127.0.0.1:4101" });
    assert.deepEqual((await request(`${server.baseUrl}${runtimeDirectoryHttp.paths.collection}`)).body.runtimes, [registered.body.runtime]);
    await stopProcess(server.child);
    server.child = startRuntime(server.environment);
    await waitForJson(`${server.baseUrl}/identity`);
    assert.deepEqual((await request(`${server.baseUrl}${runtimeDirectoryHttp.paths.runtime("ranch")}`)).body.runtime, registered.body.runtime);
  } finally {
    await stopProcess(server.child);
    await removeTemporaryDirectory(directory);
  }
});

test("Durable Data Server rejects an unsafe stored connection input", async () => {
  const directory = await makeTemporaryDirectory("agent-wrangler-durable-server-validation-");
  const server = await startServer(directory);
  try {
    const result = await request(`${server.baseUrl}${authorityConnectionsHttp.paths.collection}`, {
      method: "POST",
      body: { id: "remote", name: "Remote", baseUrl: "https://example.com" },
    });
    assert.equal(result.statusCode, 400);
    assert.deepEqual((await request(`${server.baseUrl}${authorityConnectionsHttp.paths.collection}`)).body.connections, []);
  } finally {
    await stopProcess(server.child);
    await removeTemporaryDirectory(directory);
  }
});
