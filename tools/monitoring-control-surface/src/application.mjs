import { readFile } from "node:fs/promises";
import { readJsonBody, routeError, sendJson } from "@agent-wrangler/http-transport";
import { requestError, requireRuntimeOwner, runtimeCatalog } from "./runtime-catalog.mjs";

const administratorRuntimeIds = new Set(["ranch", "router", "gallery", "engine"]);

function uniqueStrings(value) {
  return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string"))] : [];
}

export function createSurfaceApplication({ scanner, cliClient, processManager, publicDirectory }) {
  let discovered = [];
  const contexts = {
    "runtime-operator": { ownedRuntimeTypes: [] },
    "collection-administrator": { ownedEndpoints: [], knownEndpoints: [], operatingFarm: null },
  };

  const staticFiles = new Map([
    ["/", { file: "index.html", contentType: "text/html; charset=utf-8" }],
    ["/app.js", { file: "app.js", contentType: "text/javascript; charset=utf-8" }],
    ["/styles.css", { file: "styles.css", contentType: "text/css; charset=utf-8" }],
  ]);

  function findEndpoint(baseUrl, owner) {
    const entry = discovered.find((candidate) => candidate.baseUrl === baseUrl);
    if (!entry) throw requestError(409, `${baseUrl} has not been discovered by this surface.`);
    if (owner && entry.owner !== owner) throw requestError(409, `${baseUrl} is ${entry.owner}, not ${owner}.`);
    return entry;
  }

  function requireOwnedRuntime(owner) {
    requireRuntimeOwner(owner);
    if (!contexts["runtime-operator"].ownedRuntimeTypes.includes(owner)) {
      throw requestError(403, `Claim ownership of ${owner} before using local process controls.`);
    }
  }

  function requireAdministratorFarm(baseUrl) {
    findEndpoint(baseUrl, "farm");
    const context = contexts["collection-administrator"];
    if (context.operatingFarm !== baseUrl || !context.ownedEndpoints.includes(baseUrl)) {
      throw requestError(403, "Select this discovered Farm as the administrator's owned operating runtime first.");
    }
  }

  function requireKnownEndpoint(baseUrl, owner) {
    const entry = findEndpoint(baseUrl, owner);
    if (!contexts["collection-administrator"].knownEndpoints.includes(baseUrl)) {
      throw requestError(403, `Mark ${baseUrl} as known to the Collection Administrator first.`);
    }
    return entry;
  }

  async function updateContext(scenario, body) {
    if (scenario === "runtime-operator") {
      const ownedRuntimeTypes = uniqueStrings(body.ownedRuntimeTypes);
      for (const owner of ownedRuntimeTypes) requireRuntimeOwner(owner);
      contexts[scenario] = { ownedRuntimeTypes };
      return contexts[scenario];
    }
    if (scenario === "collection-administrator") {
      const discoveredUrls = new Set(discovered.map((entry) => entry.baseUrl));
      const ownedEndpoints = uniqueStrings(body.ownedEndpoints);
      const knownEndpoints = uniqueStrings(body.knownEndpoints);
      for (const endpoint of [...ownedEndpoints, ...knownEndpoints]) {
        if (!discoveredUrls.has(endpoint)) throw requestError(409, `${endpoint} is not currently discovered.`);
      }
      const operatingFarm = body.operatingFarm || null;
      if (operatingFarm) {
        findEndpoint(operatingFarm, "farm");
        if (!ownedEndpoints.includes(operatingFarm)) throw requestError(409, "The operating Farm must be claimed as owned.");
      }
      contexts[scenario] = { ownedEndpoints, knownEndpoints, operatingFarm };
      return contexts[scenario];
    }
    throw requestError(404, `Unknown scenario '${scenario}'.`);
  }

  async function handleApi(path, request, response) {
    if (path === "/api/surface" && request.method === "GET") {
      sendJson(response, 200, {
        name: "Agent Wrangler Monitoring / Control Surface",
        authorization: "simulated-not-enforced",
        runtimes: runtimeCatalog,
        scenarios: [
          { id: "runtime-operator", name: "Runtime Operator" },
          { id: "collection-administrator", name: "Collection Administrator" },
        ],
      });
      return true;
    }
    if (path === "/api/discovery" && request.method === "GET") {
      sendJson(response, 200, { runtimes: discovered });
      return true;
    }
    if (path === "/api/discovery/scan" && request.method === "POST") {
      const body = await readJsonBody(request);
      discovered = await scanner.scan({ hosts: uniqueStrings(body.hosts).length ? uniqueStrings(body.hosts) : undefined });
      sendJson(response, 200, { observedAt: new Date().toISOString(), runtimes: discovered });
      return true;
    }
    if (path === "/api/discovery/inspect" && request.method === "POST") {
      const body = await readJsonBody(request);
      const runtime = findEndpoint(body.baseUrl, body.owner);
      const inspection = await cliClient.inspect(runtime.owner, runtime.baseUrl);
      sendJson(response, 200, { runtime, inspection });
      return true;
    }

    const contextMatch = path.match(/^\/api\/scenarios\/([^/]+)\/context$/);
    if (contextMatch) {
      const scenario = contextMatch[1];
      if (!contexts[scenario]) throw requestError(404, `Unknown scenario '${scenario}'.`);
      if (request.method === "GET") {
        sendJson(response, 200, { scenario, context: contexts[scenario] });
        return true;
      }
      if (request.method === "PUT") {
        const context = await updateContext(scenario, await readJsonBody(request));
        sendJson(response, 200, { scenario, context });
        return true;
      }
    }

    if (path === "/api/operator/processes" && request.method === "GET") {
      sendJson(response, 200, { processes: processManager.list(runtimeCatalog.map((runtime) => runtime.owner)) });
      return true;
    }
    const processMatch = path.match(/^\/api\/operator\/processes\/([^/]+)(?:\/(start|stop|restart))?$/);
    if (processMatch) {
      const owner = processMatch[1];
      requireRuntimeOwner(owner);
      if (request.method === "GET" && !processMatch[2]) {
        sendJson(response, 200, { process: processManager.get(owner) });
        return true;
      }
      if (request.method === "POST" && processMatch[2]) {
        requireOwnedRuntime(owner);
        const processRecord = await processManager[processMatch[2]](owner);
        sendJson(response, 200, { process: processRecord, localOperation: true });
        return true;
      }
    }

    if (path === "/api/scenarios/collection-administrator/connect-durable-data" && request.method === "POST") {
      const body = await readJsonBody(request);
      requireAdministratorFarm(body.farmUrl);
      requireKnownEndpoint(body.durableDataUrl, "durable-data");
      const result = await cliClient.run([
        "farm", "link", "durable-data", "set", "--url", body.durableDataUrl,
        "--endpoint", body.farmUrl, "--output", "json",
      ]);
      sendJson(response, 200, {
        command: result.command,
        route: ["Monitoring / Control Surface", `Farm ${body.farmUrl}`, `Durable Data ${body.durableDataUrl}`],
        result: result.value,
      });
      return true;
    }

    if (path === "/api/scenarios/collection-administrator/register-runtime" && request.method === "POST") {
      const body = await readJsonBody(request);
      requireAdministratorFarm(body.farmUrl);
      if (!administratorRuntimeIds.has(body.runtimeId)) throw requestError(400, "Register Ranch, Router, Gallery, or Engine in this slice.");
      requireKnownEndpoint(body.runtimeUrl, body.runtimeId);
      const result = await cliClient.run([
        "farm", "runtime", "set", body.runtimeId, "--url", body.runtimeUrl,
        "--endpoint", body.farmUrl, "--output", "json",
      ]);
      sendJson(response, 200, {
        command: result.command,
        route: ["Monitoring / Control Surface", `Farm ${body.farmUrl}`, "Farm's configured Durable Data Server"],
        result: result.value,
      });
      return true;
    }

    if (path === "/api/scenarios/collection-administrator/runtime-directory" && request.method === "POST") {
      const body = await readJsonBody(request);
      requireAdministratorFarm(body.farmUrl);
      const result = await cliClient.run([
        "farm", "runtime", "list", "--endpoint", body.farmUrl, "--output", "json",
      ]);
      sendJson(response, 200, {
        command: result.command,
        route: ["Monitoring / Control Surface", `Farm ${body.farmUrl}`, "Farm's configured Durable Data Server"],
        result: result.value,
      });
      return true;
    }
    return false;
  }

  return {
    contexts,
    async handle(request, response) {
      try {
        const path = new URL(request.url ?? "/", "http://surface.local").pathname;
        if (path.startsWith("/api/") && await handleApi(path, request, response)) return;
        const staticFile = request.method === "GET" ? staticFiles.get(path) : null;
        if (staticFile) {
          const body = await readFile(`${publicDirectory}/${staticFile.file}`);
          response.writeHead(200, { "cache-control": "no-store", "content-type": staticFile.contentType });
          response.end(body);
          return;
        }
        sendJson(response, 404, { error: { message: "Monitoring / Control Surface endpoint not found." } });
      } catch (error) {
        routeError(response, error, (fields) => ({ temporaryImplementation: true, ...fields }));
      }
    },
  };
}

