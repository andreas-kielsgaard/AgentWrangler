# Agent Wrangler CLI capabilities

The provisional `aw` CLI currently demonstrates:

- launching one runtime or the existing process-only all-runtime launcher;
- CLI-owned runtime target addresses and identity/health status;
- runtime-advertised capability inspection;
- explicit session-local Ranch and Router links to the Durable Data Server;
- execution-node connection management and observation through Ranch;
- direct development prompt submission through Router.

Implementation: `src/`. Happy-flow tests: `tests/cli.test.mjs`.

The command names, configuration path, HTTP interfaces, and `aw` executable name are temporary. The CLI does not import runtime source, own product configuration, or provide Wrangle, Gallery, Engine, session, extension, or authority behavior.
