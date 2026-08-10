# ADR-0003: Lightweight Codex CLI execution node

## Status

Confirmed by the user for the first executable slice.

## Decision

Add an execution-node runtime outside the five primary Agent Wrangler runtimes. The first node runs on the local machine and hosts Codex CLI.

The node:

- reports observed Codex CLI capabilities to Ranch;
- accepts an agent prompt;
- launches Codex CLI; and
- returns provider output and diagnostics.

Ranch durably configures the node connection, exposes a simple connection test, and makes a bounded connection representation available to Router. Router uses that configured connection to forward a prompt to the node.

## Guarantee boundary

The first node controls and observes the Codex CLI launch boundary. It does not independently guarantee complete filesystem observation, filesystem restriction, descendant-process supervision, or attribution of every OS effect.

Codex-reported activity is provider evidence, not an authoritative OS audit.

## Excluded from this decision

- Gallery authorization.
- Agent Wrangle selection or resolution.
- Durable Agent Sessions or continuation.
- Wrangle Engine extension behavior.
- Fallback behavior.
- MCP.
- General filesystem, terminal, or OS APIs.
- Distributed execution-node placement.

Implementation language, HTTP endpoints, payload shapes, ports, and storage formats remain temporary choices.
