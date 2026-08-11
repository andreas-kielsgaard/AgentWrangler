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
import { runtimeDirectoryHttp } from "@agent-wrangler/contracts/runtime-directory";
import { requestJson } from "@agent-wrangler/http-transport";
import {
  loadTargets,
  normalizeTargetUrl,
  requireRuntime,
  resetTarget,
  runtimeDefinitions,
  setTarget,
  workspaceRoot,
} from "./configuration.mjs";

const argv = process.argv.slice(2);
const VERSION = "0.0.0";

function usage(owner, subject) {
  const runtimeNames = Object.keys(runtimeDefinitions).join(", ");
  const common = `Common runtime commands:
  launch                         Start this runtime
  status [--endpoint <URL>] [--output text|json]
  capabilities [--endpoint <URL>] [--output text|json]
  target show [--output text|json]
  target set <URL> [--output text|json]
  target reset [--output text|json]`;

  if (owner === "runtimes") return `Operate on the runtime collection.

Usage:
  aw runtimes <COMMAND> [options]

Commands:
  launch                         Start all seven runtimes
  status [--output text|json]    Check every runtime
  capabilities [--output text|json]
  targets [--output text|json]   Show every CLI target address

Runtime names:
  ${runtimeNames}
`;

  if (new Set(["ranch", "farm"]).has(owner) && subject === "node") return `Manage Execution Node connections through ${owner === "farm" ? "Farm's resolved Ranch" : "Ranch"}.

Usage:
  aw ${owner} node <COMMAND> [arguments] [--endpoint <URL>]

Commands:
  list
  show <ID>
  add --name <NAME> --url <URL> [--id <ID>]
  enable <ID>
  disable <ID>
  remove <ID>
  observe <ID>                   Test identity, health, and capabilities

Add --output json to receive structured output.
`;
  if (new Set(["ranch", "router", "farm"]).has(owner) && subject === "link") return `Manage ${owner}'s link to the Durable Data Server.

Usage:
  aw ${owner} link durable-data <show|set|clear|test> [--url <URL>] [--endpoint <URL>] [--output text|json]

Examples:
  aw ${owner} link durable-data set
  aw ${owner} link durable-data set --url http://127.0.0.1:4106
  aw ${owner} link durable-data test
`;
  if (new Set(["router", "farm"]).has(owner) && subject === "prompt") return `Send a prompt through ${owner === "farm" ? "Farm's resolved Router" : "Router"}.

Usage:
  aw ${owner} prompt send --connection <ID> [PROMPT] [--endpoint <URL>] [--output text|json]

PROMPT may instead be supplied through stdin.
`;

  if (new Set(["durable-data", "farm"]).has(owner) && subject === "runtime") return `Manage the runtime directory through ${owner === "farm" ? "Farm" : "Durable Data"}.

Usage:
  aw ${owner} runtime list [--endpoint <URL>] [--output text|json]
  aw ${owner} runtime show <ID> [--endpoint <URL>] [--output text|json]
  aw ${owner} runtime set <ID> --url <URL> [--endpoint <URL>] [--output text|json]
  aw ${owner} runtime remove <ID> [--endpoint <URL>] [--output text|json]
${owner === "farm" ? `  aw farm runtime connect <ranch|router> [--output text|json]\n` : ""}`;

  if (runtimeDefinitions[owner]) {
    const owned = owner === "ranch"
      ? "\n\nRanch capabilities:\n  node <COMMAND>                 Manage and observe Execution Node connections\n  link durable-data <ACTION>    Manage Ranch's Durable Data link"
        : owner === "router"
        ? "\n\nRouter capabilities:\n  prompt send [options]         Route a prompt\n  link durable-data <ACTION>    Manage Router's Durable Data link"
        : owner === "farm"
          ? "\n\nFarm capabilities:\n  link durable-data <ACTION>    Manage Farm's Durable Data link\n  runtime <COMMAND>             Manage the Durable Data runtime directory\n  node <COMMAND>                Relay node management through resolved Ranch\n  prompt send [options]         Relay prompts through resolved Router"
          : owner === "durable-data"
            ? "\n\nDurable Data capabilities:\n  runtime <COMMAND>             Manage registered Ranch, Router, Gallery, and Engine endpoints"
            : "";
    return `${runtimeDefinitions[owner].name}

Usage:
  aw ${owner} <COMMAND> [arguments]

${common}${owned}

Run 'aw ${owner} <COMMAND> --help' for focused help.
`;
  }

  return `Agent Wrangler CLI (working name: aw)

Usage:
  aw runtimes <COMMAND>         Operate on all runtimes
  aw <RUNTIME> <COMMAND>        Operate through one runtime

Runtimes:
  ${runtimeNames}

Examples:
  aw runtimes status
  aw ranch node list
  aw ranch link durable-data set
  aw router prompt send --connection local-codex "Hello"

Options:
  -h, --help                    Show contextual help
  -v, --version                 Show the CLI version
  --endpoint <URL>              Use an endpoint once without changing saved targets
`;
}

function parseOutput(args) {
  const index = args.indexOf("--output");
  if (index < 0) return { args, output: "text" };
  const output = args[index + 1];
  if (!new Set(["text", "json"]).has(output)) throw new Error("--output must be 'text' or 'json'.");
  return {
    args: args.filter((_value, itemIndex) => itemIndex !== index && itemIndex !== index + 1),
    output,
  };
}

function parseRuntimeOptions(args) {
  const parsed = parseOutput(args);
  const endpoint = option(parsed.args, "--endpoint");
  return {
    args: withoutOptions(parsed.args, ["--endpoint"]),
    output: parsed.output,
    endpoint: endpoint === undefined ? undefined : normalizeTargetUrl(endpoint),
  };
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

async function status(names, output = "text", endpoint) {
  if (endpoint && names.length !== 1) throw new Error("--endpoint can inspect only one runtime at a time.");
  const { targets } = await loadTargets();
  const records = [];
  for (const name of names) {
    if (!targets[name]) throw new Error(`Unknown runtime '${name}'.`);
    const target = { ...targets[name], url: endpoint ?? targets[name].url };
    try {
      const [identity, health] = await Promise.all([
        call(target.url, runtimeDiagnosticsHttp.paths.identity),
        call(target.url, runtimeDiagnosticsHttp.paths.health),
      ]);
      const matches = identity.runtime?.id === target.id;
      records.push({
        runtime: name,
        status: matches && health.status === "ok" ? "reachable" : "unexpected",
        url: target.url,
        identity,
        health,
      });
    } catch (error) {
      records.push({ runtime: name, status: "unavailable", url: target.url, error: error.message });
    }
  }
  if (output === "json") return printJson(records);
  for (const record of records) {
    process.stdout.write(`${record.runtime.padEnd(15)} ${record.status.padEnd(11)} ${record.url}${record.error ? `  ${record.error}` : ""}\n`);
  }
}

async function capabilities(names, output = "text", endpoint) {
  if (endpoint && names.length !== 1) throw new Error("--endpoint can inspect only one runtime at a time.");
  const { targets } = await loadTargets();
  const records = [];
  for (const name of names) {
    if (!targets[name]) throw new Error(`Unknown runtime '${name}'.`);
    const target = { ...targets[name], url: endpoint ?? targets[name].url };
    const body = await call(target.url, runtimeCapabilitiesHttp.paths.capabilities);
    const advertised = body.capabilities;
    const operations = Array.isArray(advertised) ? advertised : advertised?.operations ?? [];
    const dependencies = advertised?.dependencies ?? [];
    records.push({ runtime: name, name: target.name, url: target.url, operations, dependencies });
    if (output === "json") continue;
    process.stdout.write(`${target.name} — ${target.url}\n`);
    for (const operation of operations) process.stdout.write(`  ${operation}\n`);
    for (const dependency of dependencies) {
      process.stdout.write(`  dependency:${dependency.id} ${dependency.configured ? "configured" : "not configured"}\n`);
    }
    process.stdout.write("\n");
  }
  if (output === "json") printJson(records);
}

function requireLink(source, target) {
  if (!new Set(["ranch", "router", "farm"]).has(source) || target !== "durable-data") {
    throw new Error("Ranch, Router, and Farm currently expose a Durable Data link.");
  }
}

async function link(action, source, target, args, output = "text", endpoint) {
  requireLink(source, target);
  const { targets } = await loadTargets();
  const sourceUrl = endpoint ?? targets[source].url;
  const requestedTargetUrl = option(args, "--url");
  const targetUrl = requestedTargetUrl === undefined ? targets[target].url : normalizeTargetUrl(requestedTargetUrl);
  const path = action === "test" ? runtimeLinksHttp.paths.test(target) : runtimeLinksHttp.paths.link(target);
  const options = action === "set"
    ? { method: "PUT", body: { baseUrl: targetUrl } }
    : action === "clear"
      ? { method: "DELETE" }
      : action === "test"
        ? { method: "POST", body: {} }
        : {};
  const body = await call(sourceUrl, path, options);
  if (output === "json") return printJson(body);
  if (action === "show") {
    process.stdout.write(`${source} -> ${target}  ${body.link ? `${body.link.baseUrl} (${body.link.serverId})` : "not configured"}\n`);
    return;
  }
  if (action === "test") {
    process.stdout.write(`${source} -> ${target}  ${body.test?.reachable ? "reachable" : "unreachable"}\n`);
  } else {
    process.stdout.write(`${source} -> ${target}  ${action === "clear" ? "cleared" : "configured"}\n`);
  }
}

async function nodes(owner, action, args, output = "text", endpoint) {
  const { targets } = await loadTargets();
  const baseUrl = endpoint ?? targets[owner].url;
  const collectionPath = owner === "farm" ? "/development/connections" : ranchConnectionsHttp.paths.collection;
  const connectionPath = (id) => owner === "farm" ? `/development/connections/${encodeURIComponent(id)}` : ranchConnectionsHttp.paths.connection(id);
  const observePath = (id) => `${connectionPath(id)}/test`;
  if (action === "list") {
    const body = await call(baseUrl, collectionPath);
    if (output === "json") return printJson(body);
    if (!body.connections?.length) return process.stdout.write("No Execution Node connections configured.\n");
    for (const connection of body.connections) {
      process.stdout.write(`${connection.id.padEnd(20)} ${connection.enabled ? "enabled " : "disabled"} ${connection.baseUrl}\n`);
    }
    return;
  }
  if (action === "add") {
    const body = {
      name: option(args, "--name", true),
      baseUrl: option(args, "--url", true),
    };
    const id = option(args, "--id");
    if (id) body.id = id;
    const result = await call(baseUrl, collectionPath, { method: "POST", body });
    if (output === "json") return printJson(result);
    process.stdout.write(`${result.connection.id} added at ${result.connection.baseUrl}\n`);
    return;
  }
  const id = args[0];
  if (!id) throw new Error("Connection id is required.");
  if (action === "show") {
    const result = await call(baseUrl, connectionPath(id));
    if (output === "json") return printJson(result);
    const connection = result.connection;
    process.stdout.write(`${connection.id}\n  name: ${connection.name}\n  url: ${connection.baseUrl}\n  enabled: ${connection.enabled}\n`);
    return;
  }
  if (action === "enable" || action === "disable") {
    const result = await call(baseUrl, connectionPath(id), {
      method: "PUT",
      body: { enabled: action === "enable" },
    });
    if (output === "json") return printJson(result);
    process.stdout.write(`${id} ${action}d\n`);
    return;
  }
  if (action === "remove") {
    const result = await call(baseUrl, connectionPath(id), { method: "DELETE" });
    if (output === "json") return printJson(result);
    process.stdout.write(`${id} removed\n`);
    return;
  }
  if (action === "observe") {
    const result = await call(baseUrl, observePath(id), { method: "POST", body: {} });
    if (output === "json") return printJson(result);
    process.stdout.write(`${id} ${result.test?.reachable ? "reachable" : "unreachable"}\n`);
    return;
  }
  throw new Error(`Unknown nodes action '${action}'.`);
}

async function prompt(owner, args, output = "text", endpoint) {
  if (args[0] !== "send") throw new Error(`Use 'aw ${owner} prompt send'.`);
  const connectionId = option(args, "--connection", true);
  const literal = withoutOptions(args.slice(1), ["--connection"]).join(" ").trim();
  const promptText = literal || (await readFile(0, "utf8")).trim();
  if (!promptText) throw new Error("Prompt text is required as an argument or stdin.");
  const { targets } = await loadTargets();
  const baseUrl = endpoint ?? targets[owner].url;
  const path = owner === "farm" ? "/development/prompts" : routerPromptsHttp.paths.execute;
  const result = await call(baseUrl, path, {
    method: "POST",
    body: { connectionId, prompt: promptText },
    timeoutMs: 130_000,
  });
  if (output === "json") return printJson(result);
  process.stdout.write(`${result.output?.text ?? "Prompt completed without text output."}\n`);
}

async function runtimeDirectory(owner, action, args, output = "text", endpoint) {
  const { targets } = await loadTargets();
  const baseUrl = endpoint ?? targets[owner].url;
  const prefix = owner === "farm" ? "/development/runtime-directory" : runtimeDirectoryHttp.paths.collection;
  const entryPath = (id) => owner === "farm" ? `${prefix}/${encodeURIComponent(id)}` : runtimeDirectoryHttp.paths.runtime(id);
  if (action === "list") {
    const body = await call(baseUrl, prefix);
    if (output === "json") return printJson(body);
    if (!body.runtimes?.length) return process.stdout.write("No runtime endpoints registered.\n");
    for (const runtime of body.runtimes) process.stdout.write(`${runtime.id.padEnd(10)} ${runtime.baseUrl}\n`);
    return;
  }
  const id = args[0];
  if (!id) throw new Error("Runtime id is required.");
  if (action === "show") {
    const body = await call(baseUrl, entryPath(id));
    if (output === "json") return printJson(body);
    process.stdout.write(`${body.runtime.id} ${body.runtime.baseUrl}\n`);
    return;
  }
  if (action === "set") {
    const url = option(args, "--url", true);
    const body = await call(baseUrl, entryPath(id), { method: "PUT", body: { baseUrl: url } });
    if (output === "json") return printJson(body);
    process.stdout.write(`${body.runtime.id} registered at ${body.runtime.baseUrl}\n`);
    return;
  }
  if (action === "remove") {
    const body = await call(baseUrl, entryPath(id), { method: "DELETE" });
    if (output === "json") return printJson(body);
    process.stdout.write(`${id} removed\n`);
    return;
  }
  if (owner === "farm" && action === "connect") {
    const body = await call(baseUrl, `${entryPath(id)}/connect`, { method: "POST", body: {} });
    if (output === "json") return printJson(body);
    process.stdout.write(`${id} connected to Farm's Durable Data Server\n`);
    return;
  }
  throw new Error(`Unknown runtime-directory action '${action}'.`);
}

async function main() {
  const [owner, ...args] = argv;
  if (!owner || new Set(["help", "--help", "-h"]).has(owner)) {
    process.stdout.write(usage());
    return;
  }
  if (new Set(["--version", "-v"]).has(owner)) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (owner !== "runtimes" && !runtimeDefinitions[owner]) {
    throw new Error(`Unknown runtime '${owner}'. Choose one of: runtimes, ${Object.keys(runtimeDefinitions).join(", ")}.`);
  }
  const helpRequested = args.some((argument) => new Set(["help", "--help", "-h"]).has(argument));
  if (helpRequested) {
    process.stdout.write(usage(owner, args[0]));
    return;
  }

  if (owner === "runtimes") {
    const [action, ...rawArguments] = args;
    if (!action) throw new Error("Collection action is required. Run 'aw runtimes --help'.");
    const parsed = parseOutput(rawArguments);
    if (action === "launch") return await launch("all");
    if (action === "status") return await status(Object.keys(runtimeDefinitions), parsed.output);
    if (action === "capabilities") return await capabilities(Object.keys(runtimeDefinitions), parsed.output);
    if (action === "targets") {
      const { targets } = await loadTargets();
      const records = Object.entries(targets).map(([runtime, target]) => ({ runtime, url: target.url }));
      if (parsed.output === "json") return printJson(records);
      for (const record of records) process.stdout.write(`${record.runtime.padEnd(15)} ${record.url}\n`);
      return;
    }
    throw new Error(`Unknown collection action '${action}'. Run 'aw runtimes --help'.`);
  }

  const [subject, ...rawArguments] = args;
  if (!subject) throw new Error(`Command is required. Run 'aw ${owner} --help'.`);
  const parsed = parseRuntimeOptions(rawArguments);

  if (subject === "launch") {
    if (parsed.endpoint) throw new Error("launch does not accept --endpoint; it starts the local runtime package.");
    return await launch(owner);
  }
  if (subject === "status") return await status([owner], parsed.output, parsed.endpoint);
  if (subject === "capabilities") return await capabilities([owner], parsed.output, parsed.endpoint);
  if (subject === "target") {
    if (parsed.endpoint) throw new Error("target commands do not accept --endpoint.");
    const action = parsed.args[0];
    if (action === "show") {
      const { targets } = await loadTargets();
      const record = { runtime: owner, url: targets[owner].url };
      if (parsed.output === "json") return printJson(record);
      process.stdout.write(`${record.runtime} ${record.url}\n`);
      return;
    }
    if (action === "set") {
      if (!parsed.args[1]) throw new Error(`Use 'aw ${owner} target set <URL>'.`);
      const record = { runtime: owner, url: await setTarget(owner, parsed.args[1]) };
      if (parsed.output === "json") return printJson(record);
      process.stdout.write(`${record.runtime} ${record.url}\n`);
      return;
    }
    if (action === "reset") {
      const record = { runtime: owner, url: await resetTarget(owner) };
      if (parsed.output === "json") return printJson(record);
      process.stdout.write(`${record.runtime} ${record.url}\n`);
      return;
    }
    throw new Error(`Target action is required. Run 'aw ${owner} target --help'.`);
  }

  if (subject === "link" && new Set(["ranch", "router", "farm"]).has(owner)) {
    const [target, action, ...linkArguments] = parsed.args;
    if (!action) throw new Error(`Use 'aw ${owner} link durable-data <show|set|clear|test>'.`);
    if (!new Set(["show", "set", "clear", "test"]).has(action)) {
      throw new Error(`Unknown link action '${action}'. Use show, set, clear, or test.`);
    }
    return await link(action, owner, target, linkArguments, parsed.output, parsed.endpoint);
  }

  if (new Set(["ranch", "farm"]).has(owner) && subject === "node") {
    const [action, ...nodeArguments] = parsed.args;
    if (!action) throw new Error("Node action is required. Run 'aw ranch node --help'.");
    return await nodes(owner, action, nodeArguments, parsed.output, parsed.endpoint);
  }

  if (new Set(["router", "farm"]).has(owner) && subject === "prompt") {
    return await prompt(owner, parsed.args, parsed.output, parsed.endpoint);
  }

  if (new Set(["durable-data", "farm"]).has(owner) && subject === "runtime") {
    const [action, ...directoryArguments] = parsed.args;
    if (!action) throw new Error(`Runtime-directory action is required. Run 'aw ${owner} runtime --help'.`);
    return await runtimeDirectory(owner, action, directoryArguments, parsed.output, parsed.endpoint);
  }

  throw new Error(`'${subject}' is not owned by ${owner}. Run 'aw ${owner} --help' to see its commands.`);
}

main().catch((error) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
