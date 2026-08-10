import assert from "node:assert/strict";
import { test } from "node:test";
import { startRuntime } from "../src/index.mjs";
import { freePort, request } from "@agent-wrangler/test-support";

test("runtime diagnostics expose identity and health", async () => {
  const port = await freePort();
  const server = startRuntime({ id: "primitive", name: "Primitive", port });
  try {
    const identity = await request(`http://127.0.0.1:${port}/identity`);
    assert.deepEqual(identity.body.runtime, { id: "primitive", name: "Primitive" });
    assert.equal(identity.body.productContract, false);
    assert.equal((await request(`http://127.0.0.1:${port}/health`)).body.status, "ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
