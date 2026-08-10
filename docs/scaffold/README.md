# Exploration runtime guide

The repository currently composes seven independent loopback processes. Run `launch-all.bat` on Windows or start any package with `npm start --workspace @agent-wrangler/<runtime>`.

| Runtime | Default port |
|---|---:|
| Ranch | 4101 |
| Gallery | 4102 |
| Router | 4103 |
| Engine | 4104 |
| Farm | 4105 |
| Durable Data Server (`authority-server`) | 4106 |
| Execution Node | 4110 |

Every runtime exposes `GET /identity` and `GET /health`. Farm serves the browser interface and independently aggregates those diagnostics. Its connection and prompt routes are Farm-local presentation adapters.

Run `npm test` for deterministic behavioral validation. No default test makes a live or paid provider call.

Node.js, npm workspaces, Windows Terminal composition, HTTP, JSON, ports, environment variables, and route names are temporary exploration choices. See each runtime's `CAPABILITIES.md` for intentionally advertised behavior and limitations.
