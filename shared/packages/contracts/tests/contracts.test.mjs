import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAuthorityRouterConfiguration,
  validateAuthorityRouterConfiguration,
} from "../src/authority-router-configuration.mjs";
import { runtimeDiagnosticsHttp } from "../src/runtime-diagnostics.mjs";
import { directoryRuntimeIds, runtimeDirectoryHttp } from "../src/runtime-directory.mjs";

test("declared diagnostics and bounded Router configuration match the demonstrated flow", () => {
  assert.deepEqual(runtimeDiagnosticsHttp.paths, { identity: "/identity", health: "/health" });
  const configuration = createAuthorityRouterConfiguration({
    serverId: "server",
    connection: { id: "node", name: "not routed", baseUrl: "http://127.0.0.1:4110", enabled: true },
  });
  assert.equal(validateAuthorityRouterConfiguration(configuration, "server"), null);
  assert.deepEqual(Object.keys(configuration.connection).sort(), ["baseUrl", "enabled", "id"]);
  assert.match(validateAuthorityRouterConfiguration(configuration, "other"), /serverId/);
  assert.deepEqual(directoryRuntimeIds, ["ranch", "router", "gallery"]);
  assert.equal(runtimeDirectoryHttp.paths.runtime("ranch"), "/durable/runtime-directory/ranch");
});
