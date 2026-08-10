import assert from "node:assert/strict";
import { test } from "node:test";
import { freePort, request, startNodeProcess, stopProcess, waitForJson } from "@agent-wrangler/test-support";

test("Engine starts independently with identity and health", async () => {
  const port = await freePort();
  const engine = startNodeProcess(new URL("../server.mjs", import.meta.url), {
    environment: { ENGINE_PORT: String(port) },
    label: "engine",
  });
  try {
    const identity = await waitForJson(`http://127.0.0.1:${port}/identity`);
    assert.equal(identity.runtime.id, "engine");
    assert.equal((await request(`http://127.0.0.1:${port}/health`)).body.status, "ok");
  } finally {
    await stopProcess(engine);
  }
});
