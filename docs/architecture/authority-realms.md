# Durable data ownership

## Confirmed direction

Durable configuration belongs behind an independently replaceable server runtime, not inside Ranch, Farm, or another replaceable client. Components use declared interfaces and never read that server's private storage.

Identity ownership matters to that boundary. Future components may connect to personal or organization-owned servers, possibly several, but the current exploration implements one configured server only.

## Current working interpretation

**Status: Working inference.**

The `authority-server` package is the current Durable Data Server implementation. It owns one stable server identifier and one durable execution-node connection collection. Ranch submits management operations; Router requests one current bounded connection; Farm only presents and relays user actions.

`Authority Server`, `authority realm`, and `Durable Data Server` are working terminology. They do not imply credentials, grants, permissions, quotas, audit, federation, identity-provider integration, leases, revocation, projections, or multi-server aggregation.

## Open

- Final runtime and product names.
- Which identities a future server owns and how components bind to them.
- How personal and organizational servers coexist.
- Whether components connect to several servers and what the minimal interfaces are.
