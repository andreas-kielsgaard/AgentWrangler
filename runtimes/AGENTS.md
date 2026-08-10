# Runtime source instructions

Agent Wrangler has five primary runtime packages, one working-name Durable Data Server package, and a separate execution-node package. Each directory owns its manifest, process entry point, focused tests, `CAPABILITIES.md`, and runtime-private default data paths.

Read the target runtime's `AGENTS.md` and `CAPABILITIES.md` before editing it.

Cross-runtime claims and happy-flow tests belong under `shared/cross-runtime/`. Runtime-local tests belong under the owning package's `tests/` directory. Runtime packages may import declared shared packages but never sibling runtime source.
