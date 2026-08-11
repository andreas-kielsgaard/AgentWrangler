# Connection scenario laboratory

## Purpose

**Confirmed.** Agent Wrangler will use an independent Monitoring / Control Surface to make runtime boundaries, network routes, advertised capabilities, and actor-specific operations visible before the runtime internals are elaborated.

The laboratory treats each runtime as though it runs on a separate system. It is intended to reveal missing interfaces and accidental coupling. It does not implement authorization or prove security.

## Runtime and actor facts

The laboratory keeps these facts distinct:

- **Discovered**: the monitoring scanner found a runtime endpoint.
- **Known**: the selected scenario actor claims knowledge of that endpoint.
- **Owned**: the actor claims local operational control of that runtime instance.
- **Permitted**: a future authority system authorizes an operation. This is not implemented.

Discovery never grants knowledge or ownership. Ownership permits local process control. Knowledge permits network communication. A runtime that is neither owned nor known is unavailable inside that scenario even when the monitor can see it.

## Interaction rules

**Confirmed.** Runtime packages remain independently startable. A runtime can fail without terminating its peers, does not read another runtime's private storage, and interacts across boundaries through declared network interfaces.

The Monitoring / Control Surface follows these rules:

- monitoring is read-only and does not require an actor claim;
- local process operations are available only for claimed-owned runtimes;
- actions against other runtimes use network interfaces and require claimed endpoint knowledge;
- scenario controls call runtime-specific CLI commands;
- the CLI remains a replaceable projection of runtime-owned capabilities;
- the surface does not own Agent Wrangler configuration or downstream product behavior.

Without authorization, these rules constrain the laboratory client, not arbitrary callers. Scenario results must describe this as topology simulation rather than access enforcement.

## Monitoring view

The monitor scans configured local hosts at the known exploratory runtime ports and verifies `/identity`. A discovered entry shows runtime type, name, address, process identity, and reachability. Its detail view obtains status and advertised capabilities through a non-persistent CLI endpoint override.

The monitor does not infer actor knowledge from scan results and does not attach to output from processes it did not launch.

## Scenario control view

Every scenario surface contains:

- a scenario selector;
- a concise actor description;
- explicit claimed ownership;
- explicit claimed connection knowledge;
- scenario-specific operations;
- the command, expected network route, and observed result for each operation.

### Runtime Operator

The operator selects which of the seven runtime packages they own. Each runtime has a dedicated tab with launch, stop, restart, status, and capability controls. Output is available only for processes launched by the Monitoring / Control Surface.

Stopping a runtime is a local process operation on a process owned by the surface. It is not a remote runtime shutdown capability.

### Collection Administrator

The administrator selects an owned Farm instance as the operating runtime and explicitly marks downstream endpoints as known. The initial happy flow is:

1. connect Farm to a known Durable Data Server;
2. register known Ranch, Router, Gallery, and Engine endpoints through Farm;
3. list the resulting directory through Farm.

The intended route is `Monitoring / Control Surface -> Farm -> Durable Data Server`. Registration does not imply that Gallery or Engine already implement collection behavior.

### Later scenario surfaces

The following scenarios are part of the investigation direction but are not implemented until their product capabilities are deliberately explored:

- delegated collection administration;
- user-owned Wrangle configuration using organizational resources;
- external-product discovery and connection through Gallery;
- user connection approval through a presentation application;
- invocation resolution through Router;
- observation of configuration and product connections.

## Separate-system simulation

The current transports are temporary. The first laboratory slice can bind processes to configured hosts and ports and can scan more than one host. A later slice may give every runtime isolated environment and storage, but should retain network-only cross-runtime interaction.

## Evidence posture

Tests prove intentionally supported happy flows:

- scan and identify a runtime;
- inspect an arbitrary discovered endpoint without changing saved CLI targets;
- withhold local controls until ownership is claimed;
- withhold network operations until endpoint knowledge is claimed;
- register a known runtime through Farm rather than writing Durable Data storage directly.

They do not claim credential enforcement, hostile-client resistance, network isolation, or independently installable production artifacts.

