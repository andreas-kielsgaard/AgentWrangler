import { spawn } from "node:child_process";
import { agentWranglerCliPath, cliWorkspaceRoot } from "./cli-client.mjs";

const OUTPUT_LIMIT = 600;

async function terminateProcessTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("error", resolve);
      killer.once("close", resolve);
    });
    return;
  }
  child.kill("SIGTERM");
}

export function createProcessManager({
  launch = (owner) => spawn(process.execPath, [agentWranglerCliPath, owner, "launch"], {
    cwd: cliWorkspaceRoot,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  }),
  terminate = terminateProcessTree,
} = {}) {
  const records = new Map();

  function publicRecord(owner) {
    const record = records.get(owner);
    return record ? {
      owner,
      processId: record.child.pid ?? null,
      status: record.status,
      startedAt: record.startedAt,
      exitedAt: record.exitedAt ?? null,
      exitCode: record.exitCode ?? null,
      output: [...record.output],
    } : { owner, status: "not-started", output: [] };
  }

  function append(record, source, chunk) {
    const lines = String(chunk).replace(/\r/g, "").split("\n").filter((line) => line.length > 0);
    record.output.push(...lines.map((line) => `[${source}] ${line}`));
    if (record.output.length > OUTPUT_LIMIT) record.output.splice(0, record.output.length - OUTPUT_LIMIT);
  }

  async function start(owner) {
    const existing = records.get(owner);
    if (existing?.status === "running") throw Object.assign(new Error(`${owner} is already running under this surface.`), { statusCode: 409 });
    const child = launch(owner);
    const record = { child, status: "running", startedAt: new Date().toISOString(), output: [] };
    records.set(owner, record);
    child.stdout?.on("data", (chunk) => append(record, "stdout", chunk));
    child.stderr?.on("data", (chunk) => append(record, "stderr", chunk));
    child.once("error", (error) => {
      append(record, "error", error.message);
      record.status = "failed";
      record.exitedAt = new Date().toISOString();
    });
    child.once("exit", (code) => {
      record.status = "exited";
      record.exitCode = code;
      record.exitedAt = new Date().toISOString();
    });
    return publicRecord(owner);
  }

  async function stop(owner) {
    const record = records.get(owner);
    if (!record || record.status !== "running") return publicRecord(owner);
    record.status = "stopping";
    await terminate(record.child);
    return publicRecord(owner);
  }

  return {
    start,
    stop,
    async restart(owner) {
      await stop(owner);
      return await start(owner);
    },
    get: publicRecord,
    list(owners) {
      return owners.map(publicRecord);
    },
    async stopAll() {
      await Promise.all([...records.keys()].map(stop));
    },
  };
}
