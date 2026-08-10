import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, dirname, extname, isAbsolute, join } from "node:path";

const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

async function isFile(path) {
  try {
    const details = await stat(path);
    return details.isFile();
  } catch {
    return false;
  }
}

async function executableCandidates(requested) {
  if (isAbsolute(requested) || requested.includes("/") || requested.includes("\\")) {
    return [requested];
  }

  const directories = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const extensions = process.platform === "win32"
    ? [".exe", ".com", ".cmd", ".bat", ".ps1", ""]
    : [""];
  return directories.flatMap((directory) => extensions.map((extension) => join(directory, `${requested}${extension}`)));
}

export async function resolveProviderCommand(requestedExecutable, configuredPrefixArguments = []) {
  for (const candidate of await executableCandidates(requestedExecutable)) {
    if (!(await isFile(candidate))) {
      continue;
    }

    const extension = extname(candidate).toLowerCase();
    if (process.platform === "win32" && [".cmd", ".bat", ".ps1"].includes(extension)) {
      const npmLauncher = join(dirname(candidate), "node_modules", "@openai", "codex", "bin", "codex.js");
      if (await isFile(npmLauncher)) {
        return {
          detected: true,
          requestedExecutable,
          observedPath: candidate,
          command: process.execPath,
          prefixArguments: [npmLauncher, ...configuredPrefixArguments],
          resolution: "npm-launcher-without-shell",
        };
      }
      return {
        detected: true,
        requestedExecutable,
        observedPath: candidate,
        command: null,
        prefixArguments: [],
        resolution: "unsupported-shell-wrapper",
      };
    }

    if (process.platform !== "win32") {
      try {
        await access(candidate, constants.X_OK);
      } catch {
        continue;
      }
    }

    return {
      detected: true,
      requestedExecutable,
      observedPath: candidate,
      command: candidate,
      prefixArguments: configuredPrefixArguments,
      resolution: "direct-executable",
    };
  }

  return {
    detected: false,
    requestedExecutable,
    observedPath: null,
    command: null,
    prefixArguments: [],
    resolution: "not-found",
  };
}

export function runProcess({ command, arguments: args, cwd, input = "", timeoutMs, spawnImpl = spawn }) {
  return new Promise((resolve) => {
    const started = Date.now();
    let child;
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let outputLimited = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, stdout, stderr, timedOut, outputLimited, durationMs: Date.now() - started });
    };

    try {
      child = spawnImpl(command, args, {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({
        kind: "launch-failed",
        error: error instanceof Error ? error.message : String(error),
        stdout,
        stderr,
        timedOut,
        outputLimited,
        durationMs: Date.now() - started,
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    const collect = (target) => (chunk) => {
      const current = target === "stdout" ? stdout : stderr;
      if (Buffer.byteLength(current) + chunk.length > MAX_CAPTURE_BYTES) {
        outputLimited = true;
        child.kill();
        return;
      }
      if (target === "stdout") stdout += chunk.toString();
      else stderr += chunk.toString();
    };

    child.stdout?.on("data", collect("stdout"));
    child.stderr?.on("data", collect("stderr"));
    child.once("error", (error) => finish({
      kind: "launch-failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    child.once("close", (exitCode, signal) => finish({
      kind: timedOut ? "timed-out" : "terminated",
      exitCode,
      signal,
    }));
    child.stdin?.end(input);
  });
}

export async function inspectProvider(configuration) {
  const resolved = await resolveProviderCommand(
    configuration.requestedExecutable,
    configuration.prefixArguments,
  );
  if (!resolved.command) {
    return {
      ...resolved,
      version: null,
      promptExecution: {
        available: false,
        evidence: resolved.detected ? "configured wrapper cannot be launched without a shell" : "executable not found",
      },
    };
  }

  const result = await runProcess({
    command: resolved.command,
    arguments: [...resolved.prefixArguments, "--version"],
    cwd: configuration.workingDirectory,
    timeoutMs: configuration.inspectTimeoutMs,
  });
  const version = result.kind === "terminated" && result.exitCode === 0
    ? result.stdout.trim() || result.stderr.trim()
    : null;

  return {
    ...resolved,
    version,
    promptExecution: {
      available: version !== null,
      evidence: version !== null
        ? "non-agent version probe completed successfully"
        : `version probe ${result.kind}${result.exitCode === undefined ? "" : ` with exit code ${result.exitCode}`}`,
    },
  };
}

export function normalizeCodexJsonl(stdout) {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const events = [];

  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      return { valid: false, events: [], text: "", providerReportedActivity: [] };
    }
  }

  const messages = [];
  const providerReportedActivity = [];
  for (const event of events) {
    if (event?.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") {
      messages.push(event.item.text);
    } else if (event?.type === "agent_message" && typeof event.text === "string") {
      messages.push(event.text);
    }

    if (event?.type === "item.completed" && event.item?.type && event.item.type !== "agent_message") {
      providerReportedActivity.push(event.item);
    }
  }

  return {
    valid: lines.length > 0 && messages.length > 0,
    events,
    text: messages.join("\n"),
    providerReportedActivity,
  };
}
