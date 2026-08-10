# CLI instructions

Maintain [CAPABILITIES.md](CAPABILITIES.md) when intentionally supported CLI behavior changes. Keep the CLI a replaceable client of declared runtime HTTP interfaces; do not import runtime source or storage.

Prefer concrete capability commands over a generic remote-procedure command. Tests belong under `tests/` and should prove supported happy flows without launching a live provider.
