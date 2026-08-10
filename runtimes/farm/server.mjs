import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ranchConnectionsHttp } from "@agent-wrangler/contracts/ranch-connections";
import { routerPromptsHttp } from "@agent-wrangler/contracts/router-prompts";
import { readJsonBody, readPort, requestJson, sendJson } from "@agent-wrangler/http-transport";
import { diagnosticEnvelope, probeRuntime, startRuntime } from "@agent-wrangler/runtime-diagnostics";

const port = readPort("FARM_PORT", 4105);
const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));
const targetTimeout = Number.parseInt(process.env.FARM_TARGET_TIMEOUT_MS ?? "1500", 10);
const ranchUrl = process.env.RANCH_URL ?? `http://127.0.0.1:${readPort("RANCH_PORT", 4101)}`;
const routerUrl = process.env.ROUTER_URL ?? `http://127.0.0.1:${readPort("ROUTER_PORT", 4103)}`;

const targets = [
  target("ranch", "Wrangle Ranch", "RANCH", 4101),
  target("gallery", "Wrangle Gallery", "GALLERY", 4102),
  target("router", "Wrangle Router", "ROUTER", 4103),
  target("engine", "Wrangle Engine", "ENGINE", 4104),
  target("authority-server", "Durable Data Server (working name)", "AUTHORITY", 4106),
  target("execution-node", "Codex CLI Execution Node", "CODEX_NODE", 4110),
];

function target(id, name, prefix, defaultPort) {
  const targetPort = readPort(`${prefix}_PORT`, defaultPort);
  return {
    id,
    name,
    url: process.env[`${prefix}_URL`] ?? `http://127.0.0.1:${targetPort}`,
  };
}

async function inspectTarget(runtimeTarget) {
  return await probeRuntime(runtimeTarget, targetTimeout);
}

const staticFiles = new Map([
  ["/", { file: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/app.js", { file: "app.js", contentType: "text/javascript; charset=utf-8" }],
  ["/styles.css", { file: "styles.css", contentType: "text/css; charset=utf-8" }],
]);

async function relayJson(request, response, url, timeoutMs = 5_000) {
  try {
    const body = ["POST", "PUT", "PATCH"].includes(request.method)
      ? await readJsonBody(request)
      : undefined;
    const result = await requestJson(url, { method: request.method, body, timeoutMs });
    sendJson(response, result.statusCode, result.body);
  } catch (error) {
    sendJson(response, 502, {
      productContract: false,
      temporaryImplementation: true,
      error: {
        code: "development_backend_unavailable",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

startRuntime({
  id: "farm",
  name: "Wrangler Farm",
  port,
  capabilities: {
    operations: [
      "runtime.identity",
      "runtime.health",
      "runtime-status.present",
      "execution-node-connections.present",
      "prompt-results.present",
    ],
    dependencies: [],
  },
  async handleRoute({ path, request, response, runtime }) {
    if (path === "/scaffold/status") {
      const inspected = await Promise.all(targets.map(inspectTarget));
      sendJson(
        response,
        200,
        diagnosticEnvelope({
          observedAt: new Date().toISOString(),
          monitor: { runtime, reachable: true, url: `http://127.0.0.1:${port}` },
          runtimes: inspected,
        }),
      );
      return true;
    }

    if (path === "/development/connections" && ["GET", "POST"].includes(request.method)) {
      await relayJson(request, response, `${ranchUrl}${ranchConnectionsHttp.paths.collection}`);
      return true;
    }

    const connectionMatch = path.match(/^\/development\/connections\/([^/]+)(\/test)?$/);
    if (connectionMatch && ["PUT", "DELETE", "POST"].includes(request.method)) {
      const suffix = connectionMatch[2] ?? "";
      await relayJson(
        request,
        response,
        `${ranchUrl}${ranchConnectionsHttp.paths.connection(decodeURIComponent(connectionMatch[1]))}${suffix}`,
      );
      return true;
    }

    if (path === "/development/prompts" && request.method === "POST") {
      await relayJson(request, response, `${routerUrl}${routerPromptsHttp.paths.execute}`, 130_000);
      return true;
    }

    const staticFile = staticFiles.get(path);
    if (!staticFile) {
      return false;
    }

    const body = await readFile(`${publicDirectory}/${staticFile.file}`);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": staticFile.contentType,
    });
    response.end(body);
    return true;
  },
});
