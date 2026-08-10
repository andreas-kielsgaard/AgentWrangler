# Execution Node capabilities

Execution Node currently demonstrates:

- independent start, identity, health, and a node-owned working directory;
- bounded non-agent Codex CLI availability observation;
- one request-response prompt invocation with fixed node-owned arguments, stdin transport, `shell: false`, a controlled working directory, and timeout;
- normalized agent output and explicit provider-reported-only activity evidence.

Implementation: `server.mjs` and `codex-process.mjs`. Happy-flow and safety tests: `tests/runtime-management.test.mjs` and `tests/codex-cli-provider.test.mjs`; deterministic provider: `shared/packages/test-support/fixtures/fake-codex.mjs`.

It does not provide authoritative OS observation, full descendant supervision, sessions, MCP, remote placement, or credential management. Provider availability is reported honestly and no default test invokes a live provider.
