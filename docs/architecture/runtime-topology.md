# Runtime topology

## Confirmed runtime boundaries

The five named Agent Wrangler components are separate runtimes: Ranch, Gallery, Router, Engine, and Farm. Execution nodes are separate runtimes outside that five-part split. ADR-0005 adds an independently startable server runtime for durable configuration.

The current repository therefore runs seven packages. `authority-server` is the temporary package name for the Durable Data Server.

## Current implemented path

**Status: Working implementation, not a product contract.**

```text
Farm -> Ranch -> Durable Data Server: connection management
Ranch -> Durable Data Server -> Execution Node: identity, health, and capability observation
Farm -> Router -> Durable Data Server -> Execution Node: one prompt
```

Farm observes identity and health for every runtime independently. Gallery and Engine currently expose only identity and health.

## Independence

Each package starts, exposes identity and health, and runs local tests without requiring peer startup. A missing Durable Data Server leaves Ranch and Router running but makes their dependent operation unavailable. Runtime packages do not import sibling source or access sibling private storage.

Startup does not establish inter-runtime links. Ranch and Router expose predictable local addresses, advertise their capabilities, and accept an explicit session-local Durable Data Server link after startup. The repository CLI is one replaceable client of those interfaces.

## Deliberately absent

The current topology has no credentials, grants, authority decisions, Gallery discovery, Engine extensions, multiple data servers, cache, retry, publication, acknowledgement, replication, or offline continuation.

Node.js, npm workspaces, HTTP, JSON, ports, endpoint names, and process composition are temporary.
