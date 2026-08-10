# Wrangler Farm capabilities

Farm is a small presentation application. It currently demonstrates:

- independent start, identity, health, and browser asset serving;
- machine-readable capability advertisement;
- independent identity and health observation for the other six runtimes;
- Farm-local presentation adapters that relay connection actions to Ranch and prompts to Router;
- browser presentation of runtime status, connections, node observations, and prompt results.

Implementation: `server.mjs` and `public/`. Happy-flow tests: `tests/runtime-management.test.mjs`, `tests/runtime-monitoring.test.mjs`, and `tests/development-controls.test.mjs`.

Farm owns no durable configuration, routing or authority decisions, server-domain validation, application retry, or unrelated coordination behavior. Its relays and view models are temporary presentation details, not product contracts.
