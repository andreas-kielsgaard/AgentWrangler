import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { test } from "node:test";
import {
  fakeCodexPath,
  makeTemporaryDirectory,
  removeTemporaryDirectory,
  request,
  startTestServer,
} from "../src/index.mjs";

test("declared test support exposes an accessible fake provider and controlled HTTP fixture", async () => {
  await access(fakeCodexPath);
  const directory = await makeTemporaryDirectory("agent-wrangler-test-support-");
  const server = await startTestServer(({ body }) => ({ body: { observed: body } }));
  try {
    assert.deepEqual((await request(server.baseUrl, { method: "POST", body: { value: 1 } })).body, {
      observed: { value: 1 },
    });
  } finally {
    await server.close();
    await removeTemporaryDirectory(directory);
  }
});
