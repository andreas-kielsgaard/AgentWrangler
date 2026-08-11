# Wrangler Farm capabilities

Farm is a small presentation application. It currently demonstrates:

- terminal-visible request and relayed cross-runtime activity;
- a session-local link to one Durable Data Server;
- runtime-directory management through Durable Data and resolution of Ranch and Router for relayed commands;
- configuration of Ranch and Router's Durable Data links through registered endpoints;
- independent start, identity, health, and browser asset serving;
- machine-readable capability advertisement;
- independent identity and health observation for the other six runtimes;
- Farm-local presentation adapters that relay connection actions to Ranch and prompts to Router;
- browser presentation of runtime status, connections, node observations, and prompt results.

Implementation: `server.mjs` and `public/`. Happy-flow tests: `tests/runtime-management.test.mjs`, `tests/runtime-monitoring.test.mjs`, and `tests/development-controls.test.mjs`.

Farm owns no durable configuration, downstream capability, application retry, or backend authority. Its relays and view models are temporary presentation details, not product contracts.
