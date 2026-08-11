import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const cliPath = fileURLToPath(new URL("../../../cli/src/cli.mjs", import.meta.url));

function displayCommand(args) {
  return `aw ${args.map((argument) => /\s/.test(argument) ? JSON.stringify(argument) : argument).join(" ")}`;
}

export function createCliClient({ executeFile = execute } = {}) {
  return {
    async run(args, timeoutMs = 10_000) {
      const command = displayCommand(args);
      const result = await executeFile(process.execPath, [cliPath, ...args], {
        cwd: workspaceRoot,
        env: { ...process.env },
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
      let value = null;
      if (result.stdout.trim()) value = JSON.parse(result.stdout);
      return { command, stdout: result.stdout, stderr: result.stderr, value };
    },

    async inspect(owner, baseUrl) {
      const status = await this.run([owner, "status", "--endpoint", baseUrl, "--output", "json"]);
      const capabilities = await this.run([owner, "capabilities", "--endpoint", baseUrl, "--output", "json"]);
      return {
        commands: [status.command, capabilities.command],
        status: status.value?.[0] ?? null,
        capabilities: capabilities.value?.[0] ?? null,
      };
    },
  };
}

export const cliWorkspaceRoot = workspaceRoot;
export const agentWranglerCliPath = cliPath;

