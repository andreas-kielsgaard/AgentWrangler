import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import { readJsonBody, requestJson, setHttpActivitySource } from "../src/index.mjs";
import { startTestServer } from "@agent-wrangler/test-support";

test("HTTP helpers carry JSON and bound request bodies", async () => {
  assert.deepEqual(await readJsonBody(Readable.from([Buffer.from('{"ok":true}')])), { ok: true });
  await assert.rejects(readJsonBody(Readable.from([Buffer.from("123456")]), 5), (error) => error.statusCode === 413);
  const server = await startTestServer(({ body }) => ({ body: { observed: body } }));
  try {
    assert.deepEqual((await requestJson(server.baseUrl, { method: "POST", body: { value: 1 } })).body, {
      observed: { value: 1 },
    });
  } finally {
    await server.close();
  }
});

test("HTTP client activity shows paired outgoing request and response", async () => {
  const lines = [];
  const originalLog = console.log;
  console.log = (line) => lines.push(line);
  setHttpActivitySource("test-runtime");
  const server = await startTestServer(() => ({ body: { server: { id: "durable-data" } } }));
  try {
    await requestJson(`${server.baseUrl}/identity`);
    assert.deepEqual(lines, [
      `[request]  GET ${server.baseUrl}/identity`,
      "[response] 200 durable-data",
    ]);
  } finally {
    console.log = originalLog;
    await server.close();
  }
});
