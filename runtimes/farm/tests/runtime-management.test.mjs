import assert from "node:assert/strict";
import { test } from "node:test";
import {
  freePort,
  freePorts,
  request,
  startNodeProcess,
  stopProcess,
  waitForJson,
} from "@agent-wrangler/test-support";

const startRuntime = (id, environment, output = []) => startNodeProcess(new URL("../server.mjs", import.meta.url), { environment, output, label: id });

test("Farm reports lifecycle and serves labeled static assets with explicit content types", async () => {
  const ports = await freePorts(["farm", "ranch", "gallery", "router", "engine"]);
  const farm = startRuntime("farm", {
    FARM_PORT: String(ports.farm),
    RANCH_URL: `http://127.0.0.1:${ports.ranch}`,
    GALLERY_URL: `http://127.0.0.1:${ports.gallery}`,
    ROUTER_URL: `http://127.0.0.1:${ports.router}`,
    ENGINE_URL: `http://127.0.0.1:${ports.engine}`,
  });
  try {
    const identity = await waitForJson(`http://127.0.0.1:${ports.farm}/identity`);
    assert.equal(identity.runtime.id, "farm");
    assert.equal(identity.host, "127.0.0.1");
    assert.equal((await request(`http://127.0.0.1:${ports.farm}/health`)).body.status, "ok");

    const page = await request(`http://127.0.0.1:${ports.farm}/`);
    assert.match(page.contentType, /^text\/html/);
    assert.match(page.text, /direct prompt through Router/i);
    assert.match(page.text, /no Gallery authorization/i);
    assert.match(page.text, /not product contracts/i);

    const script = await request(`http://127.0.0.1:${ports.farm}/app.js`);
    assert.match(script.contentType, /^text\/javascript/);
    assert.match(script.text, /development\/prompts/);

    const styles = await request(`http://127.0.0.1:${ports.farm}/styles.css`);
    assert.match(styles.contentType, /^text\/css/);
    assert.match(styles.text, /\.connection-form/);
  } finally {
    await stopProcess(farm);
  }
});
