# Slice 0003: Monitoring / Control Surface

## Status

Implementation slice.

## Outcome

Create a technically independent browser-based side program that exposes the current runtime topology and lets a user exercise the first actor scenarios without adding agent, authorization, Gallery, Engine, or Wrangle behavior.

## Included

- local-host scanning of known Agent Wrangler runtime ports;
- runtime details obtained through runtime-specific CLI status and capability commands;
- explicit, ephemeral ownership and endpoint-knowledge claims;
- Runtime Operator controls for the seven runtime packages;
- captured output for processes launched by the surface;
- Collection Administrator controls for Farm's Durable Data link and Ranch, Router, Gallery, and Engine directory registration;
- command, route, and result presentation;
- non-persistent CLI endpoint overrides;
- Engine as an allowed Durable Data runtime-directory entry;
- focused happy-flow tests.

## Excluded

- credentials, authorization, grants, membership, or durable scenario identities;
- broad LAN discovery;
- remote shutdown endpoints;
- attaching to stdout of externally launched processes;
- Gallery discovery and connection requests;
- Wrangle definitions or external-product invocation;
- generalized capability-to-form generation;
- production supervision, retries, streaming infrastructure, or audit logs.

## Placement

The program lives under `tools/monitoring-control-surface/`. It is not one of the seven Agent Wrangler runtimes and is not part of Farm. It may consume the CLI and public HTTP contracts but must not read runtime-private storage.

## Review path

1. Start the seven runtime instances separately.
2. Start the Monitoring / Control Surface.
3. Scan `127.0.0.1` and inspect runtime details.
4. In Runtime Operator, claim one package and exercise its local controls.
5. In Collection Administrator, claim Farm, mark Durable Data and target runtimes as known, connect Farm, and register the endpoints one at a time.
6. Verify the displayed route and the activity shown in the runtime terminals.

