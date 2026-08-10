# Agent Wrangler

Agent Wrangler is currently a capability laboratory for independently replaceable agent runtimes.

The repository contains seven independently startable packages: Ranch, Gallery, Router, Engine, Farm, Execution Node, and `authority-server`. The last package is a temporary implementation name for the Durable Data Server; no final product name is confirmed.

The demonstrated flow is:

```text
Farm -> Ranch -> Durable Data Server: connection management
Ranch -> Durable Data Server -> Execution Node: connection observation
Farm -> Router -> Durable Data Server -> Execution Node: prompt execution
```

Run all processes with `launch-all.bat`, or use the package-local `npm start` commands. Open Farm at <http://127.0.0.1:4105>. Default tests use only a deterministic fake Codex provider.

Node.js, npm workspaces, HTTP, JSON, routes, ports, fields, storage paths, and runtime names remain temporary choices. See [Architecture](docs/architecture/README.md) and [current cross-runtime capabilities](shared/cross-runtime/CAPABILITIES.md).
