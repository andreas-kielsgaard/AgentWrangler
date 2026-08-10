import { appendFile } from "node:fs/promises";

const argumentsList = process.argv.slice(2);

async function record(kind, prompt) {
  if (!process.env.FAKE_CODEX_LOG) return;
  await appendFile(process.env.FAKE_CODEX_LOG, `${JSON.stringify({
    kind,
    arguments: argumentsList,
    cwd: process.cwd(),
    ...(prompt === undefined ? {} : { prompt }),
  })}\n`, "utf8");
}

if (argumentsList.includes("--version")) {
  await record("version");
  if (process.env.FAKE_CODEX_VERSION_MODE === "fail") {
    process.stderr.write("fake version failure\n");
    process.exit(9);
  }
  if (process.env.FAKE_CODEX_VERSION_MODE === "timeout") {
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    process.exit(0);
  } else {
  process.stdout.write("fake-codex 1.2.3\n");
  process.exit(0);
  }
}

if (!argumentsList.includes("exec")) {
  process.stderr.write("unsupported fake invocation\n");
  process.exit(64);
}

let prompt = "";
for await (const chunk of process.stdin) prompt += chunk.toString();

await record("exec", prompt);

if (prompt.includes("[fake:timeout]")) {
  setTimeout(() => {}, 60_000);
} else if (prompt.includes("[fake:malformed]")) {
  process.stdout.write("not-json\n");
} else if (prompt.includes("[fake:fail]")) {
  process.stderr.write("fake provider failure\n");
  process.exitCode = 7;
} else if (prompt.includes("[fake:large]")) {
  process.stdout.write("x".repeat(2 * 1024 * 1024 + 1024));
} else {
  if (prompt.includes("[fake:delay]")) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  process.stdout.write(`${JSON.stringify({
    type: "item.completed",
    item: { type: "command_execution", command: "fake-observed-command", status: "completed" },
  })}\n`);
  process.stdout.write(`${JSON.stringify({
    type: "item.completed",
    item: { type: "agent_message", text: `fake response: ${prompt}` },
  })}\n`);
}
