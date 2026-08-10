# Wrangle Router capabilities

Router currently demonstrates:

- independent start, identity, and health;
- machine-readable capability advertisement;
- explicit session-local configuration and testing of its Durable Data Server link;
- current execution-node connection lookup from the Durable Data Server;
- forwarding one prompt to an enabled Execution Node;
- a clear unavailable response when server lookup cannot run.

Implementation: `server.mjs` and the declared contracts in `shared/packages/contracts/src/`. Happy-flow and dependency tests: `tests/direct-prompt-routing.test.mjs` and `tests/runtime-management.test.mjs`.

Router starts without a default Durable Data Server link. It owns no durable configuration, cache, publication endpoint, retry, acknowledgement, offline continuation, Gallery authorization, or Engine behavior. HTTP paths and JSON shapes are temporary.
