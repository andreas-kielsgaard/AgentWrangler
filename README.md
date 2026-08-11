# Agent Wrangler

Agent Wrangler is currently a capability laboratory for independently replaceable agent runtimes.

The repository contains seven independently startable packages: Ranch, Gallery, Router, Engine, Farm, Execution Node, and `authority-server`. The last package is a temporary implementation name for the Durable Data Server; no final product name is confirmed.

`tools/monitoring-control-surface` is a separate capability-laboratory application. It scans the exploratory runtimes, inspects their advertised interfaces through the CLI, and exercises explicit Runtime Operator and Collection Administrator scenarios. Start it with `npm run start:surface`, then open `http://127.0.0.1:4120`.

The demonstrated flow is:

```text
Farm -> Ranch -> Durable Data Server: connection management
Ranch -> Durable Data Server -> Execution Node: connection observation
Farm -> Router -> Durable Data Server -> Execution Node: prompt execution
```

Run all processes with `launch-all.bat`. It opens one maximized Windows Terminal window split 40/60: a command pane above an Execution Node pane occupying one-third of the 40% left column, and the other six runtimes in a 2-by-3 grid on the 60% right. Alternatively, use the package-local `npm start` commands. Open Farm at <http://127.0.0.1:4105>. Default tests use only a deterministic fake Codex provider.

The launcher does not connect the runtimes. Use the provisional repository CLI to inspect and assemble the current path:

```text
aw runtimes status
aw farm link durable-data set
aw farm runtime set ranch --url http://127.0.0.1:4101
aw farm runtime set router --url http://127.0.0.1:4103
aw farm runtime set gallery --url http://127.0.0.1:4102
aw farm runtime connect ranch
aw farm runtime connect router
aw farm node add --id local-codex --name "Local Codex" --url http://127.0.0.1:4110
aw farm node observe local-codex
aw farm prompt send --connection local-codex "Respond with hello"
```

The CLI package exposes the working `aw` executable; from the repository use `npm exec aw -- <command>`. CLI target addresses are presentation configuration; Ranch and Router links are separate, session-local runtime configuration.

Node.js, npm workspaces, HTTP, JSON, routes, ports, fields, storage paths, and runtime names remain temporary choices. See [Architecture](docs/architecture/README.md) and [current cross-runtime capabilities](shared/cross-runtime/CAPABILITIES.md).
