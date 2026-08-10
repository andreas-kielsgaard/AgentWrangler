import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  freePort,
  makeTemporaryDirectory,
  removeTemporaryDirectory,
  request,
  startNodeProcess,
  stopProcess,
  waitForJson,
} from "@agent-wrangler/test-support";

const startRuntime = (id, environment, output = []) => startNodeProcess(new URL("../server.mjs", import.meta.url), { environment, output, label: id });

test("execution node is a loopback process with a node-owned working directory", async () => {
  const directory = await makeTemporaryDirectory("agent-wrangler-node-runtime-");
  const workingDirectory = join(directory, "owned-workspace");
  const port = await freePort();
  const node = startRuntime("execution-node", {
    CODEX_NODE_PORT: String(port),
    CODEX_NODE_WORKING_DIRECTORY: workingDirectory,
    CODEX_EXECUTABLE: join(directory, "missing-provider"),
  });
  try {
    const identity = await waitForJson(`http://127.0.0.1:${port}/identity`);
    assert.equal(identity.runtime.id, "execution-node");
    assert.equal(identity.host, "127.0.0.1");
    assert.equal((await request(`http://127.0.0.1:${port}/health`)).body.status, "ok");
    assert.equal((await stat(workingDirectory)).isDirectory(), true);
  } finally {
    await stopProcess(node);
    await removeTemporaryDirectory(directory);
  }
});
