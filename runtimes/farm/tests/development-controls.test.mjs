import assert from "node:assert/strict";
import { test } from "node:test";
import { freePort, request, startNodeProcess, startTestServer, stopProcess, waitForJson } from "@agent-wrangler/test-support";
import { runtimeLinksHttp } from "@agent-wrangler/contracts/runtime-links";
import { runtimeDirectoryHttp } from "@agent-wrangler/contracts/runtime-directory";

test("Farm uses thin presentation relays for Ranch connection actions and Router prompts", async () => {
  const ranch = await startTestServer(({ method, path, body }) => ({
    statusCode: method === "POST" && path === "/development/execution-node-connections" ? 201 : 200,
    body: { owner: "ranch", method, path, body },
  }));
  const router = await startTestServer(({ method, path, body }) => ({ body: { owner: "router", method, path, body } }));
  const durableData = await startTestServer(({ method, path, body }) => {
    if (path === "/authority") return { body: { server: { id: "fixture-data" } } };
    if (path === runtimeDirectoryHttp.paths.collection) {
      return { body: { serverId: "fixture-data", runtimes: [
        { id: "ranch", baseUrl: ranch.baseUrl },
        { id: "router", baseUrl: router.baseUrl },
      ] } };
    }
    const id = path.split("/").at(-1);
    if (path.startsWith(`${runtimeDirectoryHttp.paths.collection}/`)) {
      const baseUrl = id === "ranch" ? ranch.baseUrl : id === "router" ? router.baseUrl : body?.baseUrl;
      return { body: { serverId: "fixture-data", runtime: { id, baseUrl } } };
    }
    return { statusCode: 404, body: {} };
  });
  const port = await freePort();
  const farm = startNodeProcess(new URL("../server.mjs", import.meta.url), {
    environment: { FARM_PORT: String(port) },
    label: "farm",
  });
  try {
    await waitForJson(`http://127.0.0.1:${port}/identity`);
    const linked = await request(`http://127.0.0.1:${port}${runtimeLinksHttp.paths.link("durable-data")}`, {
      method: "PUT",
      body: { baseUrl: durableData.baseUrl },
    });
    assert.equal(linked.body.link.serverId, "fixture-data");

    const listed = await request(`http://127.0.0.1:${port}/development/runtime-directory`);
    assert.equal(listed.body.runtimes[0].id, "ranch");

    const connected = await request(`http://127.0.0.1:${port}/development/runtime-directory/ranch/connect`, { method: "POST", body: {} });
    assert.equal(connected.body.owner, "ranch");
    assert.equal(ranch.requests.at(-1).path, runtimeLinksHttp.paths.link("durable-data"));
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
    await Promise.all([ranch.close(), router.close(), durableData.close()]);
  }
});
