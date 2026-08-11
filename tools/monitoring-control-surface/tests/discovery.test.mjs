import assert from "node:assert/strict";
import { test } from "node:test";
import { startTestServer } from "@agent-wrangler/test-support";
import { scanRuntimeEndpoints } from "../src/discovery.mjs";

test("scanner identifies an Agent Wrangler runtime on a configured local port", async () => {
  const ranch = await startTestServer(({ path }) => path === "/identity"
    ? { body: { runtime: { id: "ranch", name: "Wrangle Ranch" }, processId: 42, startedAt: "now" } }
    : { statusCode: 404, body: {} });
  try {
    const discovered = await scanRuntimeEndpoints({ hosts: ["127.0.0.1"], ports: [ranch.port] });
    assert.deepEqual(discovered, [{
      key: `ranch@${ranch.baseUrl}`,
      owner: "ranch",
      runtimeId: "ranch",
      name: "Wrangle Ranch",
      baseUrl: ranch.baseUrl,
      processId: 42,
      host: "127.0.0.1",
      port: ranch.port,
      startedAt: "now",
    }]);
  } finally {
    await ranch.close();
  }
});

