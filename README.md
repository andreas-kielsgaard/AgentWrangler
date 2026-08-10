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

The launcher does not connect the runtimes. Use the provisional repository CLI to inspect and assemble the current path:

```text
aw status
aw capabilities ranch
aw capabilities durable-data
aw link set ranch durable-data
aw link set router durable-data
aw nodes add --name "Local Codex" --url http://127.0.0.1:4110
aw nodes observe <id>
aw prompt send --connection <id> "Respond with hello"
```

The CLI package exposes the working `aw` executable; from the repository use `npm exec aw -- <command>`. CLI target addresses are presentation configuration; Ranch and Router links are separate, session-local runtime configuration.

Node.js, npm workspaces, HTTP, JSON, routes, ports, fields, storage paths, and runtime names remain temporary choices. See [Architecture](docs/architecture/README.md) and [current cross-runtime capabilities](shared/cross-runtime/CAPABILITIES.md).
