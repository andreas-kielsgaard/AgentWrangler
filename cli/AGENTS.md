# CLI instructions

Maintain [CAPABILITIES.md](CAPABILITIES.md) when intentionally supported CLI behavior changes. Keep the CLI a replaceable client of declared runtime HTTP interfaces; do not import runtime source or storage.

Project declared runtime capabilities as concrete commands instead of exposing a generic remote-procedure command. Tests belong under `tests/` and should prove supported happy flows without launching a live provider.

## Command design

- Capabilities should belong to a runtime. Put runtime-owned capabilities beneath the runtime receiving the request, such as `aw ranch node observe` and `aw router prompt send`.
- Put operations over the runtime collection beneath `aw runtimes`.
- Treat declared runtime contracts and advertised capabilities as authoritative. CLI commands project those capabilities; they do not define, imply, or reshape them.
- Do not add a command until its owning runtime exposes the corresponding capability through a declared interface.
- Keep one predictable command grammar. Do not retain legacy aliases unless explicitly requested.
- Treat help as part of the interface: use clear descriptions, concrete examples, uppercase placeholders, valid choices, and focused command help.
- Keep concise human output separate from structured `--output json`; diagnostics and failures belong on stderr with nonzero exit codes.
- Keep the CLI thin over declared runtime contracts. Do not duplicate runtime behavior in command handlers.
- Test command ownership, grammar, help, output shape, and exit behavior for intentionally supported commands.
