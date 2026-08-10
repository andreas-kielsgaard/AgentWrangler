#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { authorityConnectionsHttp } from "@agent-wrangler/contracts/authority-connections";
import { ranchConnectionsHttp } from "@agent-wrangler/contracts/ranch-connections";
import { routerPromptsHttp } from "@agent-wrangler/contracts/router-prompts";
import { runtimeCapabilitiesHttp } from "@agent-wrangler/contracts/runtime-capabilities";
import { runtimeDiagnosticsHttp } from "@agent-wrangler/contracts/runtime-diagnostics";
import { runtimeLinksHttp } from "@agent-wrangler/contracts/runtime-links";
import { requestJson } from "@agent-wrangler/http-transport";
import {
  loadTargets,
  requireRuntime,
  resetTarget,
  runtimeDefinitions,
  setTarget,
  workspaceRoot,
} from "./configuration.mjs";

const argv = process.argv.slice(2);

function usage() {
  return `Agent Wrangler CLI (working name: aw)

  aw launch <all|runtime>
  aw status [runtime]
  aw targets
  aw target <set runtime url|reset runtime>
  aw capabilities <runtime|all>
  aw links
  aw link <set|clear|test> <ranch|router> durable-data
  aw nodes <list|show|add|enable|disable|remove|observe> [...]
  aw prompt send --connection <id> [prompt]
`;
}

function option(args, name, required = false) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] !== undefined) return args[index + 1];
  if (required) throw new Error(`${name} is required.`);
  return undefined;
}

function withoutOptions(args, names) {
  const skipped = new Set();
  for (const name of names) {
    const index = args.indexOf(name);
    if (index >= 0) {
      skipped.add(index);
      skipped.add(index + 1);
    }
  }
  return args.filter((_value, index) => !skipped.has(index));
}

async function call(url, path, options = {}) {
  let result;
  try {
    result = await requestJson(`${url}${path}`, options);
  } catch (error) {
    throw new Error(`Unable to reach ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(result.body?.error?.message ?? `HTTP ${result.statusCode} from ${url}${path}`);
  }
  return result.body;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function launch(name) {
  if (name === "all") {
    if (process.platform !== "win32") throw new Error("The all-runtime launcher currently requires Windows.");
    await run("cmd.exe", ["/c", fileURLToPath(new URL("../../launch-all.bat", import.meta.url))]);
    return;
  }
  const runtime = requireRuntime(name);
  await run(process.platform === "win32" ? "npm.cmd" : "npm", ["start", "--workspace", runtime.workspace]);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: workspaceRoot, stdio: "inherit", windowsHide: false });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}.`)));
  });
}

async function status(names) {
  const { targets } = await loadTargets();
  for (const name of names) {
    const target = targets[name];
    if (!target) throw new Error(`Unknown runtime '${name}'.`);
    try {
      const [identity, health] = await Promise.all([
        call(target.url, runtimeDiagnosticsHttp.paths.identity),
        call(target.url, runtimeDiagnosticsHttp.paths.health),
      ]);
      const matches = identity.runtime?.id === target.id;
      process.stdout.write(`${name.padEnd(15)} ${matches && health.status === "ok" ? "reachable" : "unexpected"}  ${target.url}\n`);
    } catch (error) {
      process.stdout.write(`${name.padEnd(15)} unavailable ${target.url}  ${error.message}\n`);
    }
  }
}

async function capabilities(names) {
  const { targets } = await loadTargets();
  for (const name of names) {
    const target = targets[name];
    if (!target) throw new Error(`Unknown runtime '${name}'.`);
    const body = await call(target.url, runtimeCapabilitiesHttp.paths.capabilities);
    process.stdout.write(`${target.name} — ${target.url}\n`);
    const advertised = body.capabilities;
    const operations = Array.isArray(advertised) ? advertised : advertised?.operations ?? [];
    for (const operation of operations) process.stdout.write(`  ${operation}\n`);
    for (const dependency of advertised?.dependencies ?? []) {
      process.stdout.write(`  dependency:${dependency.id} ${dependency.configured ? "configured" : "not configured"}\n`);
    }
    process.stdout.write("\n");
  }
}

function requireLink(source, target) {
  if (!new Set(["ranch", "router"]).has(source) || target !== "durable-data") {
    throw new Error("Current links are ranch durable-data and router durable-data.");
  }
}

async function link(action, source, target) {
  requireLink(source, target);
  const { targets } = await loadTargets();
  const path = action === "test" ? runtimeLinksHttp.paths.test(target) : runtimeLinksHttp.paths.link(target);
  const options = action === "set"
    ? { method: "PUT", body: { baseUrl: targets[target].url } }
    : action === "clear"
      ? { method: "DELETE" }
      : action === "test"
        ? { method: "POST", body: {} }
        : {};
  printJson(await call(targets[source].url, path, options));
}

async function listLinks() {
  const { targets } = await loadTargets();
  for (const source of ["ranch", "router"]) {
    try {
      const body = await call(targets[source].url, runtimeLinksHttp.paths.link("durable-data"));
      process.stdout.write(`${source} -> durable-data  ${body.link ? `${body.link.baseUrl} (${body.link.serverId})` : "not configured"}\n`);
    } catch (error) {
      process.stdout.write(`${source} -> durable-data  unavailable: ${error.message}\n`);
    }
  }
}

async function nodes(action, args) {
  const { targets } = await loadTargets();
  const ranchUrl = targets.ranch.url;
  if (action === "list") return printJson(await call(ranchUrl, ranchConnectionsHttp.paths.collection));
  if (action === "add") {
    const body = {
      name: option(args, "--name", true),
      baseUrl: option(args, "--url", true),
    };
    const id = option(args, "--id");
    if (id) body.id = id;
    return printJson(await call(ranchUrl, ranchConnectionsHttp.paths.collection, { method: "POST", body }));
  }
  const id = args[0];
  if (!id) throw new Error("Connection id is required.");
  if (action === "show") return printJson(await call(ranchUrl, ranchConnectionsHttp.paths.connection(id)));
  if (action === "enable" || action === "disable") {
    return printJson(await call(ranchUrl, ranchConnectionsHttp.paths.connection(id), {
      method: "PUT",
      body: { enabled: action === "enable" },
    }));
  }
  if (action === "remove") return printJson(await call(ranchUrl, ranchConnectionsHttp.paths.connection(id), { method: "DELETE" }));
  if (action === "observe") return printJson(await call(ranchUrl, ranchConnectionsHttp.paths.test(id), { method: "POST", body: {} }));
  throw new Error(`Unknown nodes action '${action}'.`);
}

async function prompt(args) {
  if (args[0] !== "send") throw new Error("Use 'aw prompt send'.");
  const connectionId = option(args, "--connection", true);
  const literal = withoutOptions(args.slice(1), ["--connection"]).join(" ").trim();
  const promptText = literal || (await readFile(0, "utf8")).trim();
  if (!promptText) throw new Error("Prompt text is required as an argument or stdin.");
  const { targets } = await loadTargets();
  printJson(await call(targets.router.url, routerPromptsHttp.paths.execute, {
    method: "POST",
    body: { connectionId, prompt: promptText },
    timeoutMs: 130_000,
  }));
}

async function main() {
  const [command, ...args] = argv;
  if (!command || new Set(["help", "--help", "-h"]).has(command)) {
    process.stdout.write(usage());
    return;
  }
  if (command === "launch") return await launch(args[0]);
  if (command === "status") return await status(args.length ? args : Object.keys(runtimeDefinitions));
  if (command === "targets") {
    const { targets } = await loadTargets();
    for (const [name, target] of Object.entries(targets)) process.stdout.write(`${name.padEnd(15)} ${target.url}\n`);
    return;
  }
  if (command === "target" && args[0] === "set") {
    process.stdout.write(`${args[1]} ${await setTarget(args[1], args[2])}\n`);
    return;
  }
  if (command === "target" && args[0] === "reset") {
    process.stdout.write(`${args[1]} ${await resetTarget(args[1])}\n`);
    return;
  }
  if (command === "capabilities") {
    const requested = args[0] ?? "all";
    return await capabilities(requested === "all" ? Object.keys(runtimeDefinitions) : [requested]);
  }
  if (command === "links") return await listLinks();
  if (command === "link") return await link(args[0], args[1], args[2]);
  if (command === "nodes") return await nodes(args[0], args.slice(1));
  if (command === "prompt") return await prompt(args);
  throw new Error(`Unknown command '${command}'.\n\n${usage()}`);
}

main().catch((error) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
