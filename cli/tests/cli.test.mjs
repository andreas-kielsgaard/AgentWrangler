import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runtimeCapabilitiesHttp } from "@agent-wrangler/contracts/runtime-capabilities";
import { runtimeLinksHttp } from "@agent-wrangler/contracts/runtime-links";
import {
  makeTemporaryDirectory,
  removeTemporaryDirectory,
  startTestServer,
} from "@agent-wrangler/test-support";

const execute = promisify(execFile);
const cliPath = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));

async function runCli(args, configurationPath) {
  return await execute(process.execPath, [cliPath, ...args], {
    env: { ...process.env, AW_CONFIG_PATH: configurationPath },
    windowsHide: true,
  });
}

test("CLI targets a runtime and reports its status and advertised capabilities", async () => {
  const directory = await makeTemporaryDirectory("agent-wrangler-cli-targets-");
  const configurationPath = join(directory, "targets.json");
  const ranch = await startTestServer(({ path }) => {
    if (path === "/identity") return { body: { runtime: { id: "ranch", name: "Wrangle Ranch" } } };
    if (path === "/health") return { body: { status: "ok" } };
    if (path === runtimeCapabilitiesHttp.paths.capabilities) {
      return { body: { capabilities: { operations: ["example.operation"], dependencies: [] } } };
    }
    return { statusCode: 404, body: {} };
  });
  try {
    await runCli(["runtime", "target", "set", "ranch", ranch.baseUrl], configurationPath);
    assert.match((await runCli(["runtime", "status", "ranch"], configurationPath)).stdout, /ranch\s+reachable/);
    assert.match((await runCli(["runtime", "capabilities", "ranch"], configurationPath)).stdout, /example\.operation/);
    const structured = JSON.parse((await runCli(["runtime", "status", "ranch", "--output", "json"], configurationPath)).stdout);
    assert.deepEqual(structured, [{ runtime: "ranch", status: "reachable", url: ranch.baseUrl }]);
  } finally {
    await ranch.close();
    await removeTemporaryDirectory(directory);
  }
});

test("CLI explicitly configures and tests a runtime link", async () => {
  const directory = await makeTemporaryDirectory("agent-wrangler-cli-link-");
  const configurationPath = join(directory, "targets.json");
  const source = await startTestServer(({ method, path, body }) => {
    if (path === runtimeLinksHttp.paths.link("durable-data") && method === "PUT") {
      return { body: { link: { target: "durable-data", baseUrl: body.baseUrl, serverId: "fixture" } } };
    }
    if (path === runtimeLinksHttp.paths.test("durable-data") && method === "POST") {
      return { body: { test: { reachable: true } } };
    }
    return { statusCode: 404, body: {} };
  });
  const data = await startTestServer(() => ({ body: {} }));
  try {
    await runCli(["runtime", "target", "set", "ranch", source.baseUrl], configurationPath);
    await runCli(["runtime", "target", "set", "durable-data", data.baseUrl], configurationPath);
    assert.match((await runCli(["link", "set", "ranch", "durable-data", "--output", "json"], configurationPath)).stdout, /fixture/);
    assert.equal(source.requests[0].body.baseUrl, data.baseUrl);
    assert.match((await runCli(["link", "test", "ranch", "durable-data", "--output", "json"], configurationPath)).stdout, /reachable/);
  } finally {
    await Promise.all([source.close(), data.close()]);
    await removeTemporaryDirectory(directory);
  }
});

test("CLI manages a node through Ranch and submits a prompt through Router", async () => {
  const directory = await makeTemporaryDirectory("agent-wrangler-cli-actions-");
  const configurationPath = join(directory, "targets.json");
  const ranch = await startTestServer(({ method, path, body }) => method === "POST" && path === "/development/execution-node-connections"
    ? { statusCode: 201, body: { connection: { ...body, enabled: true } } }
    : { statusCode: 404, body: {} });
  const router = await startTestServer(({ method, path, body }) => method === "POST" && path === "/development/prompts"
    ? { body: { output: { text: `fixture: ${body.prompt}` } } }
    : { statusCode: 404, body: {} });
  try {
    await runCli(["runtime", "target", "set", "ranch", ranch.baseUrl], configurationPath);
    await runCli(["runtime", "target", "set", "router", router.baseUrl], configurationPath);
    assert.match((await runCli([
      "node", "add", "--id", "node", "--name", "Local", "--url", "http://127.0.0.1:4110", "--output", "json",
    ], configurationPath)).stdout, /"id": "node"/);
    assert.deepEqual(ranch.requests[0].body, {
      name: "Local",
      baseUrl: "http://127.0.0.1:4110",
      id: "node",
    });

    assert.match((await runCli([
      "prompt", "send", "--connection", "node", "hello from cli",
    ], configurationPath)).stdout, /fixture: hello from cli/);
    assert.deepEqual(router.requests[0].body, { connectionId: "node", prompt: "hello from cli" });
  } finally {
    await Promise.all([ranch.close(), router.close()]);
    await removeTemporaryDirectory(directory);
  }
});

test("CLI grammar is discoverable and rejects removed legacy commands", async () => {
  const directory = await makeTemporaryDirectory("agent-wrangler-cli-language-");
  const configurationPath = join(directory, "targets.json");
  try {
    assert.match((await runCli(["--help"], configurationPath)).stdout, /Usage: aw <noun> <verb>/);
    assert.match((await runCli(["node", "--help"], configurationPath)).stdout, /aw node add --name/);
    assert.match((await runCli(["node", "add", "--help"], configurationPath)).stdout, /aw node add --name/);
    assert.equal((await runCli(["--version"], configurationPath)).stdout.trim(), "0.0.0");
    await assert.rejects(runCli(["nodes", "list"], configurationPath), (error) => {
      assert.notEqual(error.code, 0);
      assert.match(error.stderr, /Unknown noun 'nodes'/);
      return true;
    });
  } finally {
    await removeTemporaryDirectory(directory);
  }
});
