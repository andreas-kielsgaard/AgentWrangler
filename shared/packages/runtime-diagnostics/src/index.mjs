import { runtimeDiagnosticsHttp } from "@agent-wrangler/contracts/runtime-diagnostics";
import { runtimeCapabilitiesHttp } from "@agent-wrangler/contracts/runtime-capabilities";
import { fetchJson, sendJson, startHttpServer } from "@agent-wrangler/http-transport";

const DIAGNOSTIC_LABEL = "disposable-scaffold-diagnostic";

export function diagnosticEnvelope(fields) {
  return { scaffoldBehavior: DIAGNOSTIC_LABEL, productContract: false, ...fields };
}

export async function probeRuntime(target, timeoutMs = 1_500) {
  const baseUrl = target.url.replace(/\/$/, "");
  try {
    const [identity, health] = await Promise.all([
      fetchJson(`${baseUrl}${runtimeDiagnosticsHttp.paths.identity}`, timeoutMs),
      fetchJson(`${baseUrl}${runtimeDiagnosticsHttp.paths.health}`, timeoutMs),
    ]);
    if (identity.runtime?.id !== target.id) {
      throw new Error(`Expected runtime ${target.id}, observed ${identity.runtime?.id ?? "unknown"}.`);
    }
    return {
      reachable: true,
      target,
      observed: { identity: identity.runtime, health: health.status, processId: identity.processId },
    };
  } catch (error) {
    return { reachable: false, target, error: error instanceof Error ? error.message : String(error) };
  }
}

export function startRuntime({ id, name, port, capabilities = { operations: [], dependencies: [] }, handleRoute }) {
  const host = process.env.RUNTIME_HOST ?? "127.0.0.1";
  const startedAt = new Date().toISOString();
  const runtime = { id, name };
  const server = startHttpServer({
    host,
    port,
    async handleRequest(request, response) {
      const path = new URL(request.url ?? "/", `http://${host}:${port}`).pathname;
      if (request.method === "GET" && path === runtimeDiagnosticsHttp.paths.identity) {
        sendJson(response, 200, diagnosticEnvelope({ runtime, processId: process.pid, host, port, startedAt }));
        return;
      }
      if (request.method === "GET" && path === runtimeDiagnosticsHttp.paths.health) {
        sendJson(response, 200, diagnosticEnvelope({ runtime, status: "ok" }));
        return;
      }
      if (request.method === "GET" && path === runtimeCapabilitiesHttp.paths.capabilities) {
        const advertised = typeof capabilities === "function" ? await capabilities() : capabilities;
        sendJson(response, 200, diagnosticEnvelope({ runtime, capabilities: advertised }));
        return;
      }
      if (handleRoute && (await handleRoute({ path, request, response, runtime }))) return;
      if (request.method !== "GET") {
        sendJson(response, 405, diagnosticEnvelope({ error: "Method not available." }));
        return;
      }
      sendJson(response, 404, diagnosticEnvelope({ error: "Scaffold diagnostic not found." }));
    },
    onListening() {
      console.log(`${name} scaffold listening at http://${host}:${port}`);
      console.log("Endpoints are disposable diagnostics, not product contracts.");
    },
  });
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  return server;
}
