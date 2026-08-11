import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { createProcessManager } from "../src/process-manager.mjs";

function fakeChild() {
  const child = new EventEmitter();
  child.pid = 1234;
  child.exitCode = null;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

test("process manager captures output and stops only its owned child", async () => {
  const child = fakeChild();
  let terminated = null;
  const manager = createProcessManager({
    launch: () => child,
    terminate: async (candidate) => {
      terminated = candidate;
      candidate.exitCode = 0;
      candidate.emit("exit", 0);
    },
  });
  assert.equal((await manager.start("ranch")).status, "running");
  child.stdout.write("Ranch listening\n");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(manager.get("ranch").output, ["[stdout] Ranch listening"]);
  await manager.stop("ranch");
  assert.equal(terminated, child);
  assert.equal(manager.get("ranch").status, "exited");
});

