import assert from "node:assert/strict";
import { test } from "node:test";
import { freePort, request, startNodeProcess, startTestServer, stopProcess, waitForJson } from "@agent-wrangler/test-support";

test("Farm uses thin presentation relays for Ranch connection actions and Router prompts", async () => {
  const ranch = await startTestServer(({ method, path, body }) => ({
    statusCode: method === "POST" && path === "/development/execution-node-connections" ? 201 : 200,
    body: { owner: "ranch", method, path, body },
  }));
  const router = await startTestServer(({ method, path, body }) => ({ body: { owner: "router", method, path, body } }));
  const port = await freePort();
  const farm = startNodeProcess(new URL("../server.mjs", import.meta.url), {
    environment: { FARM_PORT: String(port), RANCH_URL: ranch.baseUrl, ROUTER_URL: router.baseUrl },
    label: "farm",
  });
  try {
    await waitForJson(`http://127.0.0.1:${port}/identity`);
    const created = await request(`http://127.0.0.1:${port}/development/connections`, {
      method: "POST",
      body: { name: "Node", baseUrl: "http://127.0.0.1:4110" },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.body.owner, "ranch");
    assert.equal(created.body.path, "/development/execution-node-connections");

    const tested = await request(`http://127.0.0.1:${port}/development/connections/node/test`, { method: "POST", body: {} });
    assert.equal(tested.body.owner, "ranch");
    assert.equal(tested.body.path, "/development/execution-node-connections/node/test");

    const prompted = await request(`http://127.0.0.1:${port}/development/prompts`, {
      method: "POST",
      body: { connectionId: "node", prompt: "hello" },
    });
    assert.equal(prompted.body.owner, "router");
    assert.deepEqual(prompted.body.body, { connectionId: "node", prompt: "hello" });
  } finally {
    await stopProcess(farm);
    await Promise.all([ranch.close(), router.close()]);
  }
});
