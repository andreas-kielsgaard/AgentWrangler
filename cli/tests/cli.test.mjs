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
    await runCli(["target", "set", "ranch", ranch.baseUrl], configurationPath);
    assert.match((await runCli(["status", "ranch"], configurationPath)).stdout, /ranch\s+reachable/);
    assert.match((await runCli(["capabilities", "ranch"], configurationPath)).stdout, /example\.operation/);
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
    await runCli(["target", "set", "ranch", source.baseUrl], configurationPath);
    await runCli(["target", "set", "durable-data", data.baseUrl], configurationPath);
    assert.match((await runCli(["link", "set", "ranch", "durable-data"], configurationPath)).stdout, /fixture/);
    assert.equal(source.requests[0].body.baseUrl, data.baseUrl);
    assert.match((await runCli(["link", "test", "ranch", "durable-data"], configurationPath)).stdout, /reachable/);
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
    await runCli(["target", "set", "ranch", ranch.baseUrl], configurationPath);
    await runCli(["target", "set", "router", router.baseUrl], configurationPath);
    assert.match((await runCli([
      "nodes", "add", "--id", "node", "--name", "Local", "--url", "http://127.0.0.1:4110",
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
