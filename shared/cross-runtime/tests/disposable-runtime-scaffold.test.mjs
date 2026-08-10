import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { runtimeCapabilitiesHttp } from "@agent-wrangler/contracts/runtime-capabilities";
import {
  freePorts,
  makeTemporaryDirectory,
  removeTemporaryDirectory,
  request,
  startNodeProcess,
  stopProcess,
  waitForJson,
} from "@agent-wrangler/test-support";

const require = createRequire(import.meta.url);
const ids = ["authority-server", "ranch", "gallery", "router", "engine", "farm", "execution-node"];
const entries = Object.fromEntries(ids.map((id) => [id, require.resolve(`@agent-wrangler/${id}`)]));

test("all seven runtime packages start independently and Farm observes each one", async () => {
  const directory = await makeTemporaryDirectory("agent-wrangler-topology-");
  const ports = await freePorts(ids);
  const environment = {
    AUTHORITY_PORT: String(ports["authority-server"]),
    RANCH_PORT: String(ports.ranch),
    GALLERY_PORT: String(ports.gallery),
    ROUTER_PORT: String(ports.router),
    ENGINE_PORT: String(ports.engine),
    FARM_PORT: String(ports.farm),
    CODEX_NODE_PORT: String(ports["execution-node"]),
    AUTHORITY_URL: `http://127.0.0.1:${ports["authority-server"]}`,
    RANCH_URL: `http://127.0.0.1:${ports.ranch}`,
    GALLERY_URL: `http://127.0.0.1:${ports.gallery}`,
    ROUTER_URL: `http://127.0.0.1:${ports.router}`,
    ENGINE_URL: `http://127.0.0.1:${ports.engine}`,
    CODEX_NODE_URL: `http://127.0.0.1:${ports["execution-node"]}`,
    AUTHORITY_CONNECTIONS_PATH: join(directory, "connections.json"),
    CODEX_NODE_WORKING_DIRECTORY: join(directory, "node-workspace"),
    CODEX_EXECUTABLE: join(directory, "missing-provider"),
  };
  const children = ids.map((id) => startNodeProcess(entries[id], { environment, label: id }));
  try {
    const identities = await Promise.all(ids.map((id) => waitForJson(`http://127.0.0.1:${ports[id]}/identity`)));
    assert.equal(new Set(identities.map((identity) => identity.processId)).size, 7);
    for (const id of ids) assert.equal((await request(`http://127.0.0.1:${ports[id]}/health`)).body.status, "ok");
    for (const id of ids) {
      assert.equal(
        (await request(`http://127.0.0.1:${ports[id]}${runtimeCapabilitiesHttp.paths.capabilities}`)).statusCode,
        200,
      );
    }

    const status = await request(`http://127.0.0.1:${ports.farm}/scaffold/status`);
    assert.deepEqual(status.body.runtimes.map((entry) => entry.target.id), [
      "ranch", "gallery", "router", "engine", "authority-server", "execution-node",
    ]);
    assert.equal(status.body.runtimes.every((entry) => entry.reachable), true);
  } finally {
    await Promise.all(children.map(stopProcess));
    await removeTemporaryDirectory(directory);
  }
});
