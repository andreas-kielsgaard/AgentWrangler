import assert from "node:assert/strict";
import { test } from "node:test";
import { freePort, request, startNodeProcess, stopProcess, waitForJson } from "@agent-wrangler/test-support";

test("Router starts independently with identity and health", async () => {
  const port = await freePort();
  const router = startNodeProcess(new URL("../server.mjs", import.meta.url), {
    environment: { ROUTER_PORT: String(port), AUTHORITY_URL: `http://127.0.0.1:${await freePort()}` },
    label: "router",
  });
  try {
    const identity = await waitForJson(`http://127.0.0.1:${port}/identity`);
    assert.equal(identity.runtime.id, "router");
    assert.equal((await request(`http://127.0.0.1:${port}/health`)).body.status, "ok");
  } finally {
    await stopProcess(router);
  }
});
