# Wrangle Router instructions

Maintain [CAPABILITIES.md](CAPABILITIES.md) when intentionally supported Router behavior changes. Router must not acquire Ranch configuration ownership or Engine extension behavior through convenience changes.

Run `npm start` and `npm test` from this package. Router reads current bounded configuration from the Durable Data Server for each prompt and owns no durable connection projection.
