import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { freePort, request } from "@agent-wrangler/test-support";
import { createSurfaceApplication } from "../src/application.mjs";

const farmUrl = "http://127.0.0.1:5105";
const durableUrl = "http://127.0.0.1:5106";
const engineUrl = "http://127.0.0.1:5104";
const discovered = [
  { owner: "farm", runtimeId: "farm", name: "Farm", baseUrl: farmUrl },
  { owner: "durable-data", runtimeId: "authority-server", name: "Durable Data", baseUrl: durableUrl },
  { owner: "engine", runtimeId: "engine", name: "Engine", baseUrl: engineUrl },
];

async function startApplication() {
  const cliCalls = [];
  const processCalls = [];
  const application = createSurfaceApplication({
    scanner: { scan: async () => discovered },
    cliClient: {
      async inspect(owner, baseUrl) { return { commands: [], status: { runtime: owner, url: baseUrl }, capabilities: {} }; },
      async run(args) {
        cliCalls.push(args);
        return { command: `aw ${args.join(" ")}`, value: { accepted: true } };
      },
    },
    processManager: {
      start: async (owner) => (processCalls.push(["start", owner]), { owner, status: "running", output: [] }),
      stop: async (owner) => ({ owner, status: "exited", output: [] }),
      restart: async (owner) => ({ owner, status: "running", output: [] }),
      get: (owner) => ({ owner, status: "not-started", output: [] }),
      list: (owners) => owners.map((owner) => ({ owner, status: "not-started", output: [] })),
    },
    publicDirectory: "unused",
  });
  const port = await freePort();
  const server = http.createServer(application.handle);
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    cliCalls,
    processCalls,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("scenario controls require explicit ownership and knowledge then route administrator work through Farm", async () => {
  const surface = await startApplication();
  try {
    await request(`${surface.baseUrl}/api/discovery/scan`, { method: "POST", body: {} });

    const deniedOperator = await request(`${surface.baseUrl}/api/operator/processes/ranch/start`, { method: "POST", body: {} });
    assert.equal(deniedOperator.statusCode, 403);
    await request(`${surface.baseUrl}/api/scenarios/runtime-operator/context`, {
      method: "PUT",
      body: { ownedRuntimeTypes: ["ranch"] },
    });
    assert.equal((await request(`${surface.baseUrl}/api/operator/processes/ranch/start`, { method: "POST", body: {} })).statusCode, 200);
    assert.deepEqual(surface.processCalls, [["start", "ranch"]]);

    const deniedAdmin = await request(`${surface.baseUrl}/api/scenarios/collection-administrator/register-runtime`, {
      method: "POST",
      body: { farmUrl, runtimeId: "engine", runtimeUrl: engineUrl },
    });
    assert.equal(deniedAdmin.statusCode, 403);

    await request(`${surface.baseUrl}/api/scenarios/collection-administrator/context`, {
      method: "PUT",
      body: { ownedEndpoints: [farmUrl], knownEndpoints: [durableUrl, engineUrl], operatingFarm: farmUrl },
    });
    const linked = await request(`${surface.baseUrl}/api/scenarios/collection-administrator/connect-durable-data`, {
      method: "POST",
      body: { farmUrl, durableDataUrl: durableUrl },
    });
    assert.equal(linked.statusCode, 200);
    assert.deepEqual(linked.body.route, ["Monitoring / Control Surface", `Farm ${farmUrl}`, `Durable Data ${durableUrl}`]);

    const registered = await request(`${surface.baseUrl}/api/scenarios/collection-administrator/register-runtime`, {
      method: "POST",
      body: { farmUrl, runtimeId: "engine", runtimeUrl: engineUrl },
    });
    assert.equal(registered.statusCode, 200);
    assert.deepEqual(surface.cliCalls, [
      ["farm", "link", "durable-data", "set", "--url", durableUrl, "--endpoint", farmUrl, "--output", "json"],
      ["farm", "runtime", "set", "engine", "--url", engineUrl, "--endpoint", farmUrl, "--output", "json"],
    ]);
  } finally {
    await surface.close();
  }
});

