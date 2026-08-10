import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readJsonFile, writeJsonAtomic } from "@agent-wrangler/json-store";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const SCHEMA = "temporary-agent-wrangler-cli-targets/v1";

export const runtimeDefinitions = Object.freeze({
  ranch: { id: "ranch", name: "Wrangle Ranch", url: "http://127.0.0.1:4101", workspace: "@agent-wrangler/ranch" },
  gallery: { id: "gallery", name: "Wrangle Gallery", url: "http://127.0.0.1:4102", workspace: "@agent-wrangler/gallery" },
  router: { id: "router", name: "Wrangle Router", url: "http://127.0.0.1:4103", workspace: "@agent-wrangler/router" },
  engine: { id: "engine", name: "Wrangle Engine", url: "http://127.0.0.1:4104", workspace: "@agent-wrangler/engine" },
  farm: { id: "farm", name: "Wrangler Farm", url: "http://127.0.0.1:4105", workspace: "@agent-wrangler/farm" },
  "durable-data": { id: "authority-server", name: "Durable Data Server", url: "http://127.0.0.1:4106", workspace: "@agent-wrangler/authority-server" },
  "execution-node": { id: "execution-node", name: "Codex CLI Execution Node", url: "http://127.0.0.1:4110", workspace: "@agent-wrangler/execution-node" },
});

export const workspaceRoot = resolve(packageRoot, "..");

function configurationPath() {
  return resolve(packageRoot, process.env.AW_CONFIG_PATH ?? "runtime-data/targets.json");
}

export function normalizeTargetUrl(raw) {
  try {
    const url = new URL(raw);
    if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) throw new Error();
    return url.origin;
  } catch {
    throw new Error("Target URL must be an HTTP or HTTPS origin without credentials, path, query, or fragment.");
  }
}

export function requireRuntime(name) {
  const definition = runtimeDefinitions[name];
  if (!definition) throw new Error(`Unknown runtime '${name}'.`);
  return definition;
}

export async function loadTargets() {
  const path = configurationPath();
  const stored = await readJsonFile(path, { schemaVersion: SCHEMA, overrides: {} });
  if (stored?.schemaVersion !== SCHEMA || !stored.overrides || typeof stored.overrides !== "object" || Array.isArray(stored.overrides)) {
    throw new Error(`Invalid CLI target configuration at ${path}.`);
  }
  return {
    path,
    stored,
    targets: Object.fromEntries(Object.entries(runtimeDefinitions).map(([name, definition]) => [
      name,
      { ...definition, url: stored.overrides[name] ?? definition.url },
    ])),
  };
}

export async function setTarget(name, rawUrl) {
  requireRuntime(name);
  const configuration = await loadTargets();
  configuration.stored.overrides[name] = normalizeTargetUrl(rawUrl);
  await writeJsonAtomic(configuration.path, configuration.stored);
  return configuration.stored.overrides[name];
}

export async function resetTarget(name) {
  const definition = requireRuntime(name);
  const configuration = await loadTargets();
  delete configuration.stored.overrides[name];
  await writeJsonAtomic(configuration.path, configuration.stored);
  return definition.url;
}
