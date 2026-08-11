import assert from "node:assert/strict";
import { test } from "node:test";
import { startRuntime } from "../src/index.mjs";
import { freePort, request } from "@agent-wrangler/test-support";
import { runtimeCapabilitiesHttp } from "@agent-wrangler/contracts/runtime-capabilities";

test("runtime diagnostics expose identity and health", async () => {
  const port = await freePort();
  const advertised = { operations: ["example.operation"], dependencies: [] };
  const server = startRuntime({ id: "primitive", name: "Primitive", port, capabilities: advertised });
  try {
    const identity = await request(`http://127.0.0.1:${port}/identity`);
    assert.deepEqual(identity.body.runtime, { id: "primitive", name: "Primitive" });
    assert.equal(identity.body.productContract, false);
    assert.equal((await request(`http://127.0.0.1:${port}/health`)).body.status, "ok");
    assert.deepEqual(
      (await request(`http://127.0.0.1:${port}${runtimeCapabilitiesHttp.paths.capabilities}`)).body.capabilities,
      advertised,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("runtime activity shows paired incoming request and response", async () => {
  const lines = [];
  const originalLog = console.log;
  console.log = (line) => lines.push(line);
  const port = await freePort();
  const server = startRuntime({ id: "visible", name: "Visible", port });
  try {
    await request(`http://127.0.0.1:${port}/identity`);
    assert.ok(lines.includes("[request]  GET /identity"));
    assert.ok(lines.includes("[response] 200 GET /identity"));
  } finally {
    console.log = originalLog;
    await new Promise((resolve) => server.close(resolve));
  }
});
