# Wrangler Farm instructions

Maintain [CAPABILITIES.md](CAPABILITIES.md) when intentionally supported Farm behavior changes. Farm is the current external control and presentation surface. It may resolve declared runtime addresses through its configured Durable Data Server and relay commands, but must not acquire the downstream capability, durable product state, retries, or backend authority.

Run `npm start` and `npm test` from this package. Farm consumes declared Durable Data, Ranch, and Router HTTP artifacts and owns no durable runtime state.
