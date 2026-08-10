import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { runProcess } from "../codex-process.mjs";
import {
  fakeCodexPath,
  freePort,
  makeTemporaryDirectory,
  removeTemporaryDirectory,
  request,
  startNodeProcess,
  stopProcess,
  waitForJson,
} from "@agent-wrangler/test-support";

async function startNode(directory, overrides = {}) {
  const port = await freePort();
  const workingDirectory = join(directory, `workspace-${port}`);
  const logPath = join(directory, `fake-codex-${port}.jsonl`);
  const child = startNodeProcess(new URL("../server.mjs", import.meta.url), {
    environment: {
      CODEX_NODE_PORT: String(port),
      CODEX_EXECUTABLE: process.execPath,
      CODEX_EXECUTABLE_ARGS_JSON: JSON.stringify([fakeCodexPath]),
      CODEX_NODE_WORKING_DIRECTORY: workingDirectory,
      CODEX_TIMEOUT_MS: "1000",
      CODEX_INSPECT_TIMEOUT_MS: "1000",
      FAKE_CODEX_LOG: logPath,
      ...overrides,
    },
    label: "execution-node",
  });
  await waitForJson(`http://127.0.0.1:${port}/identity`);
  return { child, baseUrl: `http://127.0.0.1:${port}`, workingDirectory, logPath };
}

test("Execution Node reports provider availability honestly", async () => {
  const directory = await makeTemporaryDirectory("agent-wrangler-provider-availability-");
  const available = await startNode(directory);
  const missing = await startNode(directory, {
    CODEX_EXECUTABLE: join(directory, "missing-provider"),
    CODEX_EXECUTABLE_ARGS_JSON: "[]",
  });
  try {
    assert.equal((await request(`${available.baseUrl}/capabilities`)).body.provider.promptExecution.available, true);
    assert.equal((await request(`${missing.baseUrl}/capabilities`)).body.provider.promptExecution.available, false);
    const unavailable = await request(`${missing.baseUrl}/execute`, { method: "POST", body: { prompt: "do not run" } });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(unavailable.body.error.code, "provider_unavailable");
  } finally {
    await Promise.all([stopProcess(available.child), stopProcess(missing.child)]);
    await removeTemporaryDirectory(directory);
  }
});

test("Execution Node uses fixed arguments, stdin, shell false, and its controlled working directory", async () => {
  const directory = await makeTemporaryDirectory("agent-wrangler-safe-execution-");
  const node = await startNode(directory);
  const prompt = 'literal "; $(touch nope) & | > file `code` %PATH%';
  try {
    const result = await request(`${node.baseUrl}/execute`, { method: "POST", body: { prompt } });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.output.text, `fake response: ${prompt}`);
    assert.equal(result.body.diagnostics.shellInterpolation, false);
    assert.equal(resolve(result.body.diagnostics.workingDirectory.path), resolve(node.workingDirectory));
    assert.deepEqual(result.body.diagnostics.arguments.slice(-7), ["exec", "--json", "--color", "never", "--skip-git-repo-check", "--ephemeral", "-"]);
    assert.equal(result.body.diagnostics.arguments.includes(prompt), false);

    const records = (await readFile(node.logPath, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    const execution = records.find((entry) => entry.kind === "exec");
    assert.equal(execution.prompt, prompt);
    assert.equal(resolve(execution.cwd), resolve(node.workingDirectory));
  } finally {
    await stopProcess(node.child);
    await removeTemporaryDirectory(directory);
  }
});

function controlledChild(onStart) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.kill = () => queueMicrotask(() => child.emit("close", null, "SIGTERM"));
  queueMicrotask(() => onStart(child));
  return child;
}

test("process execution sets shell false and enforces its timeout", async () => {
  let spawnOptions;
  const completed = await runProcess({
    command: "fixed",
    arguments: ["argument"],
    cwd: process.cwd(),
    input: "prompt",
    timeoutMs: 100,
    spawnImpl(_command, _arguments, options) {
      spawnOptions = options;
      return controlledChild((child) => child.emit("close", 0, null));
    },
  });
  assert.equal(completed.kind, "terminated");
  assert.equal(spawnOptions.shell, false);
  assert.equal(spawnOptions.cwd, process.cwd());

  const timedOut = await runProcess({
    command: "fixed",
    arguments: [],
    cwd: process.cwd(),
    timeoutMs: 10,
    spawnImpl: () => controlledChild(() => {}),
  });
  assert.equal(timedOut.kind, "timed-out");
});

test("Execution Node reports a bounded provider timeout", async () => {
  const directory = await makeTemporaryDirectory("agent-wrangler-provider-timeout-");
  const node = await startNode(directory, { CODEX_TIMEOUT_MS: "30" });
  try {
    const result = await request(`${node.baseUrl}/execute`, {
      method: "POST",
      body: { prompt: "[fake:timeout]" },
      timeoutMs: 3_000,
    });
    assert.equal(result.statusCode, 504);
    assert.equal(result.body.error.code, "provider_timed_out");
  } finally {
    await stopProcess(node.child);
    await removeTemporaryDirectory(directory);
  }
});
