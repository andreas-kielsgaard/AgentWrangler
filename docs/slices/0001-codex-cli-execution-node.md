# Slice 0001: Local Codex CLI execution node

## Status

Implemented exploration outcome.

The slice demonstrates an independently startable Execution Node that reports identity, health, provider availability, and explicit assurance limits. It invokes one prompt using fixed node-owned arguments, stdin, `shell: false`, a node-owned working directory, and a timeout. Default tests use a deterministic fake provider and never make a live or paid invocation.

The composed happy flow is recorded in `shared/cross-runtime/CAPABILITIES.md`. Current CLI arguments, HTTP and JSON shapes, Node.js implementation, and data paths are temporary.

The slice does not claim authoritative OS observation, full descendant supervision, sessions, MCP, remote placement, credentials, Gallery authorization, or Engine behavior.
