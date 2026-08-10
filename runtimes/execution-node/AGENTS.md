# Execution Node instructions

Maintain [CAPABILITIES.md](CAPABILITIES.md) when intentionally supported execution-node behavior changes. Do not turn provider-reported activity into an OS guarantee, and do not add general filesystem, terminal, process, MCP, or remote-placement functionality without explicit scope.

Run `npm start` and `npm test` from this package. Keep the fake provider in the declared test-support dependency and node working state within this package's configured data root.
