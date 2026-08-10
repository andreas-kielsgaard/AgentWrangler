# ADR-0002: Authority decisions remain outside Gallery

## Status

Confirmed by the user for the initial architecture.

## Decision

Wrangle Gallery accepts and routes connection requests but does not approve or reject authority.

Authority approval is routed through Wrangle Ranch in the first slice. Future users may provide custom authority components, including custom interfaces or external communication routes.

The contract for request persistence, status, delivery, and Ranch unavailability is open.
