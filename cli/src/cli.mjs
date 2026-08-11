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
const VERSION = "0.0.0";

function usage(owner, subject) {
  const runtimeNames = Object.keys(runtimeDefinitions).join(", ");
  const common = `Common runtime commands:
  launch                         Start this runtime
  status [--output text|json]    Check reachability
  capabilities [--output text|json]
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

  if (owner === "ranch" && subject === "node") return `Manage Execution Node connections through Ranch.

Usage:
  aw ranch node <COMMAND> [arguments]

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
  if (new Set(["ranch", "router"]).has(owner) && subject === "link") return `Manage ${owner}'s link to the Durable Data Server.

Usage:
  aw ${owner} link durable-data <show|set|clear|test> [--output text|json]

Examples:
  aw ${owner} link durable-data set
  aw ${owner} link durable-data test
`;
  if (owner === "router" && subject === "prompt") return `Send a prompt through Router.

Usage:
  aw router prompt send --connection <ID> [PROMPT] [--output text|json]

PROMPT may instead be supplied through stdin.
`;

  if (runtimeDefinitions[owner]) {
    const owned = owner === "ranch"
      ? "\n\nRanch capabilities:\n  node <COMMAND>                 Manage and observe Execution Node connections\n  link durable-data <ACTION>    Manage Ranch's Durable Data link"
      : owner === "router"
        ? "\n\nRouter capabilities:\n  prompt send [options]         Route a prompt\n  link durable-data <ACTION>    Manage Router's Durable Data link"
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

async function status(names, output = "text") {
  const { targets } = await loadTargets();
  const records = [];
  for (const name of names) {
    const target = targets[name];
    if (!target) throw new Error(`Unknown runtime '${name}'.`);
    try {
      const [identity, health] = await Promise.all([
        call(target.url, runtimeDiagnosticsHttp.paths.identity),
        call(target.url, runtimeDiagnosticsHttp.paths.health),
      ]);
      const matches = identity.runtime?.id === target.id;
      records.push({ runtime: name, status: matches && health.status === "ok" ? "reachable" : "unexpected", url: target.url });
    } catch (error) {
      records.push({ runtime: name, status: "unavailable", url: target.url, error: error.message });
    }
  }
  if (output === "json") return printJson(records);
  for (const record of records) {
    process.stdout.write(`${record.runtime.padEnd(15)} ${record.status.padEnd(11)} ${record.url}${record.error ? `  ${record.error}` : ""}\n`);
  }
}

async function capabilities(names, output = "text") {
  const { targets } = await loadTargets();
  const records = [];
  for (const name of names) {
    const target = targets[name];
    if (!target) throw new Error(`Unknown runtime '${name}'.`);
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
  if (!new Set(["ranch", "router"]).has(source) || target !== "durable-data") {
    throw new Error("Current links are ranch durable-data and router durable-data.");
  }
}

async function link(action, source, target, output = "text") {
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
  const body = await call(targets[source].url, path, options);
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

async function nodes(action, args, output = "text") {
  const { targets } = await loadTargets();
  const ranchUrl = targets.ranch.url;
  if (action === "list") {
    const body = await call(ranchUrl, ranchConnectionsHttp.paths.collection);
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
    const result = await call(ranchUrl, ranchConnectionsHttp.paths.collection, { method: "POST", body });
    if (output === "json") return printJson(result);
    process.stdout.write(`${result.connection.id} added at ${result.connection.baseUrl}\n`);
    return;
  }
  const id = args[0];
  if (!id) throw new Error("Connection id is required.");
  if (action === "show") {
    const result = await call(ranchUrl, ranchConnectionsHttp.paths.connection(id));
    if (output === "json") return printJson(result);
    const connection = result.connection;
    process.stdout.write(`${connection.id}\n  name: ${connection.name}\n  url: ${connection.baseUrl}\n  enabled: ${connection.enabled}\n`);
    return;
  }
  if (action === "enable" || action === "disable") {
    const result = await call(ranchUrl, ranchConnectionsHttp.paths.connection(id), {
      method: "PUT",
      body: { enabled: action === "enable" },
    });
    if (output === "json") return printJson(result);
    process.stdout.write(`${id} ${action}d\n`);
    return;
  }
  if (action === "remove") {
    const result = await call(ranchUrl, ranchConnectionsHttp.paths.connection(id), { method: "DELETE" });
    if (output === "json") return printJson(result);
    process.stdout.write(`${id} removed\n`);
    return;
  }
  if (action === "observe") {
    const result = await call(ranchUrl, ranchConnectionsHttp.paths.test(id), { method: "POST", body: {} });
    if (output === "json") return printJson(result);
    process.stdout.write(`${id} ${result.test?.reachable ? "reachable" : "unreachable"}\n`);
    return;
  }
  throw new Error(`Unknown nodes action '${action}'.`);
}

async function prompt(args, output = "text") {
  if (args[0] !== "send") throw new Error("Use 'aw router prompt send'.");
  const connectionId = option(args, "--connection", true);
  const literal = withoutOptions(args.slice(1), ["--connection"]).join(" ").trim();
  const promptText = literal || (await readFile(0, "utf8")).trim();
  if (!promptText) throw new Error("Prompt text is required as an argument or stdin.");
  const { targets } = await loadTargets();
  const result = await call(targets.router.url, routerPromptsHttp.paths.execute, {
    method: "POST",
    body: { connectionId, prompt: promptText },
    timeoutMs: 130_000,
  });
  if (output === "json") return printJson(result);
  process.stdout.write(`${result.output?.text ?? "Prompt completed without text output."}\n`);
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
  const parsed = parseOutput(rawArguments);

  if (subject === "launch") return await launch(owner);
  if (subject === "status") return await status([owner], parsed.output);
  if (subject === "capabilities") return await capabilities([owner], parsed.output);
  if (subject === "target") {
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

  if (subject === "link" && new Set(["ranch", "router"]).has(owner)) {
    const [target, action] = parsed.args;
    if (!action) throw new Error(`Use 'aw ${owner} link durable-data <show|set|clear|test>'.`);
    if (!new Set(["show", "set", "clear", "test"]).has(action)) {
      throw new Error(`Unknown link action '${action}'. Use show, set, clear, or test.`);
    }
    return await link(action, owner, target, parsed.output);
  }

  if (owner === "ranch" && subject === "node") {
    const [action, ...nodeArguments] = parsed.args;
    if (!action) throw new Error("Node action is required. Run 'aw ranch node --help'.");
    return await nodes(action, nodeArguments, parsed.output);
  }

  if (owner === "router" && subject === "prompt") {
    return await prompt(parsed.args, parsed.output);
  }

  throw new Error(`'${subject}' is not owned by ${owner}. Run 'aw ${owner} --help' to see its commands.`);
}

main().catch((error) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
