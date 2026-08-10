# Wrangler Farm instructions

Maintain [CAPABILITIES.md](CAPABILITIES.md) when intentionally supported Farm behavior changes. Farm is presentation and request relay only; do not give it durable product state, routing decisions, server-domain validation, retries, or backend authority.

Run `npm start` and `npm test` from this package. Farm consumes declared runtime, Ranch, and Router HTTP artifacts and owns no durable runtime state.
