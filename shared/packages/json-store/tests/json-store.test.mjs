import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { readJsonFile, writeJsonAtomic } from "../src/index.mjs";
import { makeTemporaryDirectory, removeTemporaryDirectory } from "@agent-wrangler/test-support";

test("JSON storage initializes and atomically replaces a durable document", async () => {
  const directory = await makeTemporaryDirectory("agent-wrangler-json-store-");
  const path = join(directory, "nested", "document.json");
  try {
    assert.deepEqual(await readJsonFile(path, { connections: [] }), { connections: [] });
    await writeJsonAtomic(path, { connections: [{ id: "node" }] });
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { connections: [{ id: "node" }] });
  } finally {
    await removeTemporaryDirectory(directory);
  }
});
