import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executionNodeHttp } from "@agent-wrangler/contracts/execution-node";
import { readJsonBody, readPort, routeError, sendJson } from "@agent-wrangler/http-transport";
import { diagnosticEnvelope, startRuntime } from "@agent-wrangler/runtime-diagnostics";
import { inspectProvider, normalizeCodexJsonl, runProcess } from "./codex-process.mjs";

const SLICE = "temporary-codex-cli-execution-node/v1";
const packageRoot = fileURLToPath(new URL("./", import.meta.url));
const port = readPort("CODEX_NODE_PORT", 4110);
const nodeId = process.env.CODEX_NODE_ID ?? "local-codex-cli";
const workingDirectory = resolve(packageRoot, process.env.CODEX_NODE_WORKING_DIRECTORY ?? "runtime-data/workspace");
const requestedExecutable = process.env.CODEX_EXECUTABLE ?? "codex";
const timeoutMs = readPositiveInteger("CODEX_TIMEOUT_MS", 120_000);
const inspectTimeoutMs = readPositiveInteger("CODEX_INSPECT_TIMEOUT_MS", 5_000);
const prefixArguments = parsePrefixArguments(process.env.CODEX_EXECUTABLE_ARGS_JSON);

await mkdir(workingDirectory, { recursive: true });

const limitations = [
  "Provider-reported file and tool activity is not authoritative OS evidence.",
  "No independent filesystem observation or enforcement is provided.",
  "Only the direct Codex process is controlled; full descendant-process supervision is not provided.",
  "No Gallery authorization, Wrangle, Agent Session, extension, MCP, fallback, workflow, or remote-placement semantics are present.",
];

function readPositiveInteger(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function parsePrefixArguments(raw) {
  if (raw === undefined) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error("CODEX_EXECUTABLE_ARGS_JSON must be a JSON array of strings.");
  }
  return value;
}

function envelope(fields) {
  return diagnosticEnvelope({ slice: SLICE, ...fields });
}

async function capabilities() {
  const provider = await inspectProvider({
    requestedExecutable,
    prefixArguments,
    workingDirectory,
    inspectTimeoutMs,
  });
  return {
    node: { id: nodeId, kind: "local-codex-cli", host: process.env.RUNTIME_HOST ?? "127.0.0.1", port },
    provider: {
      name: "Codex CLI",
      requestedExecutable: provider.requestedExecutable,
      observedPath: provider.observedPath,
      resolution: provider.resolution,
      version: provider.version,
      promptExecution: provider.promptExecution,
    },
    invocation: {
      mode: "request-response",
      promptTransport: "stdin",
      argumentPolicy: "node-owned-fixed-arguments",
      workingDirectoryPolicy: "node-owned-configuration",
    },
    assurance: { limitations },
    _resolvedProvider: provider,
  };
}

async function execute(prompt) {
  const observed = await capabilities();
  const provider = observed._resolvedProvider;
  delete observed._resolvedProvider;

  const diagnostics = {
    requestedExecutable,
    observedExecutable: provider.observedPath,
    launchExecutable: provider.command,
    arguments: [...provider.prefixArguments, "exec", "--json", "--color", "never", "--skip-git-repo-check", "--ephemeral", "-"],
    promptTransport: "stdin",
    workingDirectory: { source: "node-owned-configuration", path: workingDirectory },
    shellInterpolation: false,
    timeoutMs,
    assuranceLimitations: limitations,
  };

  if (!provider.promptExecution.available) {
    return {
      statusCode: 503,
      body: envelope({
        error: { code: "provider_unavailable", message: provider.promptExecution.evidence },
        terminal: { outcome: "not-started", exitCode: null, signal: null },
        diagnostics,
      }),
    };
  }

  const result = await runProcess({
    command: provider.command,
    arguments: diagnostics.arguments,
    cwd: workingDirectory,
    input: prompt,
    timeoutMs,
  });
  Object.assign(diagnostics, {
    durationMs: result.durationMs,
    stderr: result.stderr,
    stdout: result.stdout,
  });

  if (result.kind === "launch-failed") {
    return {
      statusCode: 502,
      body: envelope({
        error: { code: "provider_failed", message: result.error },
        terminal: { outcome: "failed", exitCode: null, signal: null },
        diagnostics,
      }),
    };
  }

  if (result.kind === "timed-out") {
    return {
      statusCode: 504,
      body: envelope({
        error: { code: "provider_timed_out", message: `Codex exceeded the node-owned ${timeoutMs} ms timeout.` },
        terminal: { outcome: "timed-out", exitCode: result.exitCode ?? null, signal: result.signal ?? null },
        diagnostics,
      }),
    };
  }

  if (result.outputLimited || result.exitCode !== 0) {
    return {
      statusCode: 502,
      body: envelope({
        error: { code: "provider_failed", message: "Codex did not complete successfully." },
        terminal: { outcome: "failed", exitCode: result.exitCode, signal: result.signal ?? null },
        diagnostics,
      }),
    };
  }

  const normalized = normalizeCodexJsonl(result.stdout);
  if (!normalized.valid) {
    return {
      statusCode: 502,
      body: envelope({
        error: { code: "provider_failed", message: "Codex completed without a usable agent message." },
        terminal: { outcome: "failed", exitCode: result.exitCode, signal: result.signal ?? null },
        diagnostics,
      }),
    };
  }

  return {
    statusCode: 200,
    body: envelope({
      output: {
        text: normalized.text,
        providerReportedActivity: normalized.providerReportedActivity,
        activityEvidence: "provider-reported-only",
      },
      providerOutput: { format: "codex-jsonl", events: normalized.events },
      terminal: { outcome: "succeeded", exitCode: result.exitCode, signal: result.signal ?? null },
      diagnostics,
    }),
  };
}

startRuntime({
  id: "execution-node",
  name: "Codex CLI Execution Node",
  port,
  capabilities: {
    operations: [
      "runtime.identity",
      "runtime.health",
      "codex-cli.observe",
      "codex-cli.execute-prompt",
    ],
    dependencies: [],
  },
  async handleRoute({ path, request, response }) {
    try {
      if (request.method === "GET" && path === executionNodeHttp.paths.capabilities) {
        const observed = await capabilities();
        delete observed._resolvedProvider;
        sendJson(response, 200, envelope(observed));
        return true;
      }

      if (request.method === "POST" && path === executionNodeHttp.paths.execute) {
        const body = await readJsonBody(request);
        if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
          const error = new Error("prompt must be a non-empty string.");
          error.statusCode = 400;
          throw error;
        }
        if (body.prompt.length > 100_000) {
          const error = new Error("prompt exceeds the temporary 100000-character limit.");
          error.statusCode = 413;
          throw error;
        }
        const result = await execute(body.prompt);
        sendJson(response, result.statusCode, result.body);
        return true;
      }
    } catch (error) {
      routeError(response, error, envelope);
      return true;
    }
    return false;
  },
});
