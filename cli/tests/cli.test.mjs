import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runtimeCapabilitiesHttp } from "@agent-wrangler/contracts/runtime-capabilities";
import { runtimeLinksHttp } from "@agent-wrangler/contracts/runtime-links";
import {
  makeTemporaryDirectory,
  freePort,
  removeTemporaryDirectory,
  startTestServer,
  waitForJson,
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
    await runCli(["ranch", "target", "set", ranch.baseUrl], configurationPath);
    assert.match((await runCli(["ranch", "status"], configurationPath)).stdout, /ranch\s+reachable/);
    assert.match((await runCli(["ranch", "capabilities"], configurationPath)).stdout, /example\.operation/);
    const structured = JSON.parse((await runCli(["ranch", "status", "--output", "json"], configurationPath)).stdout);
    assert.deepEqual(structured, [{
      runtime: "ranch",
      status: "reachable",
      url: ranch.baseUrl,
      identity: { runtime: { id: "ranch", name: "Wrangle Ranch" } },
      health: { status: "ok" },
    }]);
    await runCli(["ranch", "target", "reset"], configurationPath);
    const inspected = JSON.parse((await runCli([
      "ranch", "status", "--endpoint", ranch.baseUrl, "--output", "json",
    ], configurationPath)).stdout);
    assert.equal(inspected[0].url, ranch.baseUrl);
    assert.equal(inspected[0].status, "reachable");
    assert.match((await runCli([
      "ranch", "capabilities", "--endpoint", ranch.baseUrl,
    ], configurationPath)).stdout, /example\.operation/);
  } finally {
    await ranch.close();
    await removeTemporaryDirectory(directory);
  }
});

test("CLI launches a runtime package on Windows", { skip: process.platform !== "win32" }, async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [cliPath, "ranch", "launch"], {
    env: { ...process.env, RANCH_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  try {
    const identity = await waitForJson(`http://127.0.0.1:${port}/identity`);
    assert.equal(identity.runtime.id, "ranch");
  } finally {
    if (child.exitCode === null) {
      await execute("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"]).catch(() => {});
    }
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
  const data = await startTestServer(({ method, path, body }) => {
    if (method === "PUT" && path === "/durable/runtime-directory/gallery") {
      return { body: { runtime: { id: "gallery", baseUrl: body.baseUrl } } };
    }
    return { body: { runtimes: [] } };
  });
  try {
    await runCli(["ranch", "target", "set", source.baseUrl], configurationPath);
    assert.match((await runCli([
      "durable-data", "runtime", "set", "gallery", "--url", "http://127.0.0.1:4102", "--endpoint", data.baseUrl,
    ], configurationPath)).stdout, /gallery registered/);
    assert.match((await runCli([
      "ranch", "link", "durable-data", "set", "--url", data.baseUrl, "--endpoint", source.baseUrl, "--output", "json",
    ], configurationPath)).stdout, /fixture/);
    assert.equal(source.requests[0].body.baseUrl, data.baseUrl);
    assert.match((await runCli(["ranch", "link", "durable-data", "test", "--output", "json"], configurationPath)).stdout, /reachable/);
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
    await runCli(["ranch", "target", "set", ranch.baseUrl], configurationPath);
    await runCli(["router", "target", "set", router.baseUrl], configurationPath);
    assert.match((await runCli([
      "ranch", "node", "add", "--id", "node", "--name", "Local", "--url", "http://127.0.0.1:4110", "--output", "json",
    ], configurationPath)).stdout, /"id": "node"/);
    assert.deepEqual(ranch.requests[0].body, {
      name: "Local",
      baseUrl: "http://127.0.0.1:4110",
      id: "node",
    });

    assert.match((await runCli([
      "router", "prompt", "send", "--connection", "node", "hello from cli",
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
    assert.match((await runCli(["--help"], configurationPath)).stdout, /aw <RUNTIME> <COMMAND>/);
    assert.match((await runCli(["ranch", "--help"], configurationPath)).stdout, /node <COMMAND>\s+Manage and observe/);
    assert.match((await runCli(["ranch", "node", "--help"], configurationPath)).stdout, /add --name <NAME>/);
    const runtimeHelp = (await runCli(["runtimes", "--help"], configurationPath)).stdout;
    assert.match(runtimeHelp, /launch\s+Start all seven runtimes/);
    assert.match(runtimeHelp, /ranch, gallery, router, engine, farm, durable-data, execution-node/);
    assert.doesNotMatch(runtimeHelp, /<all\|runtime>/);
    const ranchHelp = (await runCli(["ranch", "--help"], configurationPath)).stdout;
    assert.match(ranchHelp, /aw ranch <COMMAND>/);
    assert.doesNotMatch(ranchHelp, /prompt send/);
    assert.equal((await runCli(["--version"], configurationPath)).stdout.trim(), "0.0.0");
    await assert.rejects(runCli(["node", "list"], configurationPath), (error) => {
      assert.notEqual(error.code, 0);
      assert.match(error.stderr, /Unknown runtime 'node'/);
      return true;
    });
    await assert.rejects(runCli(["ranch", "prompt", "send"], configurationPath), (error) => {
      assert.match(error.stderr, /'prompt' is not owned by ranch/);
      return true;
    });
  } finally {
    await removeTemporaryDirectory(directory);
  }
});

test("CLI controls the routed happy flow through Farm", async () => {
  const directory = await makeTemporaryDirectory("agent-wrangler-cli-farm-");
  const configurationPath = join(directory, "targets.json");
  const farm = await startTestServer(({ method, path, body }) => {
    if (path === runtimeLinksHttp.paths.link("durable-data") && method === "PUT") {
      return { body: { link: { baseUrl: body.baseUrl, serverId: "data" } } };
    }
    if (path === "/development/runtime-directory/ranch" && method === "PUT") {
      return { body: { runtime: { id: "ranch", baseUrl: body.baseUrl } } };
    }
    if (path === "/development/runtime-directory/ranch/connect" && method === "POST") {
      return { body: { link: { target: "durable-data" } } };
    }
    if (path === "/development/connections" && method === "POST") {
      return { statusCode: 201, body: { connection: { id: body.id, ...body, enabled: true } } };
    }
    if (path === "/development/prompts" && method === "POST") {
      return { body: { output: { text: `farm: ${body.prompt}` } } };
    }
    return { statusCode: 404, body: { error: { message: "not found" } } };
  });
  const data = await startTestServer(() => ({ body: {} }));
  try {
    await runCli(["farm", "target", "set", farm.baseUrl], configurationPath);
    await runCli(["durable-data", "target", "set", data.baseUrl], configurationPath);
    assert.match((await runCli(["farm", "link", "durable-data", "set"], configurationPath)).stdout, /configured/);
    assert.match((await runCli(["farm", "runtime", "set", "ranch", "--url", "http://127.0.0.1:4101"], configurationPath)).stdout, /registered/);
    assert.match((await runCli(["farm", "runtime", "connect", "ranch"], configurationPath)).stdout, /connected/);
    assert.match((await runCli([
      "farm", "node", "add", "--id", "node", "--name", "Local", "--url", "http://127.0.0.1:4110",
    ], configurationPath)).stdout, /node added/);
    assert.match((await runCli(["farm", "prompt", "send", "--connection", "node", "hello"], configurationPath)).stdout, /farm: hello/);
  } finally {
    await Promise.all([farm.close(), data.close()]);
    await removeTemporaryDirectory(directory);
  }
});
