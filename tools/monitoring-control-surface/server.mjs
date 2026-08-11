import { fileURLToPath } from "node:url";
import { readPort, startHttpServer } from "@agent-wrangler/http-transport";
import { createSurfaceApplication } from "./src/application.mjs";
import { createCliClient } from "./src/cli-client.mjs";
import { defaultScanPorts, scanRuntimeEndpoints } from "./src/discovery.mjs";
import { createProcessManager } from "./src/process-manager.mjs";

const host = process.env.SURFACE_HOST ?? "127.0.0.1";
const port = readPort("SURFACE_PORT", 4120);
const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));
const configuredHosts = (process.env.SURFACE_SCAN_HOSTS ?? "127.0.0.1").split(",").map((value) => value.trim()).filter(Boolean);
const configuredPorts = process.env.SURFACE_SCAN_PORTS
  ? process.env.SURFACE_SCAN_PORTS.split(",").map((value) => Number.parseInt(value.trim(), 10)).filter(Number.isInteger)
  : defaultScanPorts;
const timeoutMs = Number.parseInt(process.env.SURFACE_SCAN_TIMEOUT_MS ?? "350", 10);

const cliClient = createCliClient();
const processManager = createProcessManager();
const application = createSurfaceApplication({
  cliClient,
  processManager,
  publicDirectory,
  scanner: {
    scan: ({ hosts: requestedHosts } = {}) => scanRuntimeEndpoints({
      hosts: requestedHosts ?? configuredHosts,
      ports: configuredPorts,
      timeoutMs,
    }),
  },
});

const server = startHttpServer({
  host,
  port,
  handleRequest: application.handle,
  onListening() {
    console.log(`Agent Wrangler Monitoring / Control Surface listening at http://${host}:${port}`);
    console.log("Actor claims are exploratory topology controls, not authorization.");
  },
});

async function stop() {
  await processManager.stopAll();
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

