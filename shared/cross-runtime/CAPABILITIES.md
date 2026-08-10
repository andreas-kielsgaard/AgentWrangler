# Cross-runtime capabilities

The current exploration intentionally demonstrates:

- seven independently running processes with identity and health, observed independently by Farm;
- Farm -> Ranch -> Durable Data Server connection management;
- Ranch -> Durable Data Server -> Execution Node observation without prompt execution;
- Router -> Durable Data Server -> Execution Node prompt execution;
- Farm -> Router prompt relay;
- Durable Data Server persistence across restart.

Happy-flow tests live in `tests/disposable-runtime-scaffold.test.mjs` and `tests/direct-codex-prompt-path.test.mjs`. They use the deterministic fake Codex provider.

Gallery discovery, authority decisions, Engine extensions, multiple data servers, caching, retries, publication, acknowledgements, and offline continuation are absent.
