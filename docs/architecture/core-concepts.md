# Core concepts

## Agent Wrangle

**Status: Confirmed name and direction.** A reusable, user-owned definition of an agent session. Its exact fields and runtime behavior remain undesigned.

## Capability route

**Status: Working terminology.** A controlled path from a caller to a capability provider. Optional Engine participation remains future work.

## Execution node

**Status: Confirmed concept and initial Codex CLI role.** A separate device-local runtime that exposes bounded provider capabilities. The current node observes and invokes a configured Codex CLI with node-owned arguments, working directory, and timeout. Provider-reported activity is not authoritative OS evidence.

## Execution-node connection

**Status: Confirmed direction; contract name is working terminology.** Durable configuration identifying an execution node. The Durable Data Server owns it, Ranch manages and tests it, and Router reads the current bounded connection for prompt forwarding.

## Durable Data Server

**Status: Confirmed server-owned durability; name open.** An independently replaceable runtime that owns durable configuration. The current package name `authority-server` and term `authority realm` are working terminology. Future identity ownership and connections to personal or organizational servers remain architectural directions, not implemented capabilities.
