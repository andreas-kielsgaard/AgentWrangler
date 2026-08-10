# Temporary interface map

**Status: Working implementation.**

Shared interface artifacts declare the HTTP paths and the few payload helpers currently used across independent runtimes:

| Producer | Consumer | Current purpose |
|---|---|---|
| Every runtime | Farm or diagnostics client | Identity and health |
| Durable Data Server | Ranch | Connection list, create, update, delete, and lookup |
| Durable Data Server | Router | Current bounded connection lookup |
| Ranch | Farm | Connection management and non-invoking node test |
| Router | Farm | Direct development prompt |
| Execution Node | Ranch and Router | Capability observation and prompt execution |

These declarations centralize route identifiers and prevent sibling-source imports. Most payload shapes remain temporary and implicit; add a small shared payload artifact when a capability needs an explicit cross-runtime shape. The current artifacts do not confirm HTTP, JSON, route names, version labels, package names, or final product contracts.

No peer-pairing, credentials, grants, sessions, Gallery discovery, Engine extension, cache, retry, publication, acknowledgement, or offline-continuation contract exists.
