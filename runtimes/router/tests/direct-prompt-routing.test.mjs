import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authorityRouterConfigurationHttp,
  createAuthorityRouterConfiguration,
} from "@agent-wrangler/contracts/authority-router-configuration";
import {
  freePort,
  request,
  startNodeProcess,
  startTestServer,
  stopProcess,
  waitForJson,
} from "@agent-wrangler/test-support";

async function startRouter(overrides = {}) {
  const port = await freePort();
  const child = startNodeProcess(new URL("../server.mjs", import.meta.url), {
    environment: {
      ROUTER_PORT: String(port),
      AUTHORITY_ID: "test-server",
      AUTHORITY_URL: `http://127.0.0.1:${await freePort()}`,
      ROUTER_AUTHORITY_TIMEOUT_MS: "100",
      ROUTER_NODE_TIMEOUT_MS: "500",
      ...overrides,
    },
    label: "router",
  });
  await waitForJson(`http://127.0.0.1:${port}/identity`);
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

test("Router reads the current server connection and forwards only the prompt", async () => {
  const node = await startTestServer(({ path, body }) => path === "/execute"
    ? { body: { output: { text: `fake: ${body.prompt}` } } }
    : { statusCode: 404, body: {} });
  const server = await startTestServer(({ method, path }) => {
    if (method === "GET" && path === authorityRouterConfigurationHttp.paths.connection("node")) {
      return { body: createAuthorityRouterConfiguration({
        serverId: "test-server",
        connection: { id: "node", baseUrl: node.baseUrl, enabled: true },
      }) };
    }
    return { statusCode: 404, body: {} };
  });
  const router = await startRouter({ AUTHORITY_URL: server.baseUrl });
  try {
    const result = await request(`${router.baseUrl}/development/prompts`, {
      method: "POST",
      body: { connectionId: "node", prompt: "literal ; & $(not-run)", ignored: { authority: true } },
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.output.text, "fake: literal ; & $(not-run)");
    assert.deepEqual(node.requests[0].body, { prompt: "literal ; & $(not-run)" });
  } finally {
    await stopProcess(router.child);
    await Promise.all([server.close(), node.close()]);
  }
});

test("Router stays healthy and reports an unavailable Durable Data Server for prompt lookup", async () => {
  const router = await startRouter();
  try {
    assert.equal((await request(`${router.baseUrl}/health`)).body.status, "ok");
    const result = await request(`${router.baseUrl}/development/prompts`, {
      method: "POST",
      body: { connectionId: "node", prompt: "hello" },
    });
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.error.code, "durable_data_server_unavailable");
  } finally {
    await stopProcess(router.child);
  }
});
