# Cross-runtime capabilities

The current exploration intentionally demonstrates:

- seven independently running processes with identity and health, observed independently by Farm;
- machine-readable capability advertisement from every runtime;
- explicit session-local Ranch -> Durable Data Server and Router -> Durable Data Server links;
- Farm -> Ranch -> Durable Data Server connection management;
- Ranch -> Durable Data Server -> Execution Node observation without prompt execution;
- Router -> Durable Data Server -> Execution Node prompt execution;
- Farm -> Router prompt relay;
- Durable Data Server persistence across restart.
- terminal-visible inbound, outbound, and meaningful internal activity, with repeated routine diagnostics hidden.
- Farm-controlled setup through a configured Durable Data Server: runtime registration, Ranch and Router linking, node management, and prompt relay.
- Farm-mediated directory registration for Ranch, Router, Gallery, and Engine; registration does not add Gallery or Engine behavior.

Starting processes does not create runtime links. The provisional CLI can assemble the routed Farm flow after startup.

Happy-flow tests live in `tests/disposable-runtime-scaffold.test.mjs` and `tests/direct-codex-prompt-path.test.mjs`. They use the deterministic fake Codex provider.

Gallery discovery, authority decisions, Engine extensions, multiple data servers, caching, retries, publication, acknowledgements, and offline continuation are absent.
