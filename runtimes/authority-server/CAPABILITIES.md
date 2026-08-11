# Durable Data Server capabilities

`authority-server` is a temporary package and product name. The runtime currently demonstrates:

- terminal-visible request and connection-write activity;
- a durable directory for Ranch, Router, Gallery, and Engine endpoint definitions;
- independent start, identity, and health;
- machine-readable capability advertisement;
- one stable configured server identifier;
- durable JSON storage for one execution-node connection collection;
- list, create, update, delete, and current-connection lookup.

Implementation: `server.mjs` and the declared contracts in `shared/packages/contracts/src/`. Happy-flow tests: `tests/durable-configuration.test.mjs`.

The server validates stored configuration. It does not implement credentials, grants, permissions, audit, quotas, federation, multiple servers, replication, caching, or offline policy. Node.js, HTTP, JSON, routes, fields, and the package name are temporary.
