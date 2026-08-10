# ADR-0001: Five independent runtimes

## Status

Confirmed by the user.

## Decision

Agent Wrangler begins with five independently startable runtimes:

1. Wrangle Ranch.
2. Wrangle Gallery.
3. Wrangle Router.
4. Wrangle Engine.
5. Wrangler Farm.

They may initially run on one device. Separation is maintained through explicit contracts and independent lifecycle and failure behavior.

The relationship between execution nodes, capability providers, and these five runtimes remains to be specified.

No implementation language, transport, or final deployment grouping is selected by this decision.
