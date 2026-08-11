# Monitoring / Control Surface capabilities

This independent exploratory program currently demonstrates:

- scanning configured local hosts at known Agent Wrangler ports;
- inspecting discovered runtime status and capabilities through one-use CLI endpoints;
- separate discovered, known, and claimed-owned facts;
- Runtime Operator launch, stop, restart, inspection, and captured output for surface-launched processes;
- Collection Administrator connection and directory operations through an owned Farm endpoint;
- presentation of the CLI command, expected network route, and observed result.

Implementation: `server.mjs`, `src/`, and `public/`. Happy-flow tests: `tests/`.

Claims are session-local simulation inputs, not authorization. The program does not own Agent Wrangler configuration, attach to external process output, scan arbitrary networks, or implement later user, Gallery, Wrangle, Engine, or external-product behavior.

