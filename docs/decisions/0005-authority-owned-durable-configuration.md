# ADR-0005: Server-owned durable configuration

## Status

Confirmed direction; current mechanics remain temporary.

## Decision

An independently startable server runtime owns durable configuration used by replaceable Agent Wrangler components. Ranch manages that configuration through a declared interface, and Router reads the current bounded connection through a declared interface. Neither reads the server's private storage.

Identity ownership remains an architectural concern. Components may eventually connect to personal or organization-owned servers, possibly more than one, but the current implementation has one configured server and no profiles.

The package name `authority-server`, the term `authority realm`, Node.js, HTTP, JSON, routes, schemas, and storage mechanics are working choices. **Durable Data Server** is a descriptive label, not a confirmed product name.

## Consequences

- Ranch restart does not determine whether configuration exists.
- Router does not read Ranch state and performs a current server lookup.
- The current flow has no cache, publication, retry, acknowledgement, or offline continuation.
- The server implementation can be replaced behind declared interfaces.

## Open

- Final names and contract shapes.
- How component and data identity relate to future personal or organizational servers.
- Whether and how components connect to several servers.
