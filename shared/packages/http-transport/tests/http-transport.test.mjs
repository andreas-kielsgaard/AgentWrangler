import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import { readJsonBody, requestJson } from "../src/index.mjs";
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
