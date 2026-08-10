# Slice 0002: Durable Data Server configuration

## Status

Implemented exploration outcome. `authority-server` is a temporary package name; final naming is open.

The slice demonstrates one independently startable server that owns a durable execution-node connection collection. Ranch forwards management operations and performs live node observation after fetching the current connection. Router fetches the current bounded connection for each prompt. Farm remains presentation and relay only.

The flow has one configured server identifier and no profiles, multiple servers, credentials, grants, permissions, audit, federation, cache, retry, publication, acknowledgement, replication, or offline continuation.

Node.js, HTTP, JSON storage, routes, fields, and package terminology remain temporary.
