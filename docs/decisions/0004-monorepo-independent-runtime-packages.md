# ADR-0004: Monorepo with independent runtime packages

## Status

Confirmed by the user.

## Decision

Agent Wrangler remains a monorepo for now. Each runtime is an independent package and process boundary.

Each runtime must be able to:

- Start, load and preserve its own state, expose its health and management surfaces, and run its local tests without its peers.
- Report a peer-dependent capability as unavailable or degraded without crashing, corrupting state, or shutting down.
- Continue from its last accepted durable input when the owning capability supports offline continuation.
- Start, restart, load its state, and run local tests independently.

A runtime must not import another runtime's source or access another runtime's private storage. Cross-runtime interaction uses an explicitly shared, versioned contract or package. Shared packages have bounded exports and do not own runtime-specific product behavior.

## Consequences

- Repository co-location does not grant implementation or storage access.
- Runtime APIs and accepted projections become the integration boundaries.
- Intentionally supported cross-runtime happy flows have focused composition tests.
- A root launcher may compose runtimes but must not be required for an individual runtime to function.

## Not decided

This decision does not select languages, package tooling, transports, schema formats, deployment infrastructure, or final service grouping.

## Implementation note

Private npm workspaces, bounded shared packages, temporary HTTP artifacts, and package-local JSON state are reversible exploration choices. Packaging, deployment, release, and production hardening are outside the current exploration policy.
