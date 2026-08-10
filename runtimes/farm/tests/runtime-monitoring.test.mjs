import assert from "node:assert/strict";
import { test } from "node:test";
import {
  freePort,
  request,
  runtimeDiagnosticHandler,
  startNodeProcess,
  startTestServer,
  stopProcess,
  waitForJson,
} from "@agent-wrangler/test-support";

test("Farm independently aggregates identity and health for the other six runtimes", async () => {
  const ids = ["ranch", "gallery", "router", "engine", "authority-server", "execution-node"];
  const targets = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await startTestServer(runtimeDiagnosticHandler({ id }))])));
  const port = await freePort();
  const farm = startNodeProcess(new URL("../server.mjs", import.meta.url), {
    environment: {
      FARM_PORT: String(port),
      RANCH_URL: targets.ranch.baseUrl,
      GALLERY_URL: targets.gallery.baseUrl,
      ROUTER_URL: targets.router.baseUrl,
      ENGINE_URL: targets.engine.baseUrl,
      AUTHORITY_URL: targets["authority-server"].baseUrl,
      CODEX_NODE_URL: targets["execution-node"].baseUrl,
      FARM_TARGET_TIMEOUT_MS: "500",
    },
    label: "farm",
  });
  try {
    await waitForJson(`http://127.0.0.1:${port}/identity`);
    const status = await request(`http://127.0.0.1:${port}/scaffold/status`);
    assert.equal(status.body.monitor.runtime.id, "farm");
    assert.deepEqual(status.body.runtimes.map((entry) => entry.target.id), ids);
    assert.equal(status.body.runtimes.every((entry) => entry.reachable), true);
  } finally {
    await stopProcess(farm);
    await Promise.all(Object.values(targets).map((target) => target.close()));
  }
});
