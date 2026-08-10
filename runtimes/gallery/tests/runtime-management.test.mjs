import assert from "node:assert/strict";
import { test } from "node:test";
import { freePort, request, startNodeProcess, stopProcess, waitForJson } from "@agent-wrangler/test-support";

test("Gallery starts independently with identity and health", async () => {
  const port = await freePort();
  const gallery = startNodeProcess(new URL("../server.mjs", import.meta.url), {
    environment: { GALLERY_PORT: String(port) },
    label: "gallery",
  });
  try {
    const identity = await waitForJson(`http://127.0.0.1:${port}/identity`);
    assert.equal(identity.runtime.id, "gallery");
    assert.equal((await request(`http://127.0.0.1:${port}/health`)).body.status, "ok");
  } finally {
    await stopProcess(gallery);
  }
});
