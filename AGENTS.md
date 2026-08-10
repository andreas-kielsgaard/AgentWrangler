# Agent instructions

Read `docs/architecture/recording-policy.md` and the nearest nested `AGENTS.md` before changing code.

Preserve the independent runtime boundaries. Shared code may provide transport and storage primitives, but must not acquire runtime-specific product responsibility.

## Exploration posture

Agent Wrangler currently explores capabilities and architectural seams; it is not being hardened for publication or production.

- Prefer the smallest transparent implementation that demonstrates the current capability and its happy path within the confirmed runtime boundaries.
- Add robustness, generalized infrastructure, compatibility behavior, and exhaustive failure handling only when explicitly requested or required for basic safety and truthful behavior.
- Keep temporary choices easy to replace and clearly labeled; do not turn exploratory behavior into an implied product contract.
- Record meaningful limitations instead of implementing speculative completeness.

## Runtime package independence

Keep Agent Wrangler as a monorepo of independently startable and testable runtime packages.

- A runtime must start, load and preserve its own state, expose health and management surfaces, and run its local tests without its peers.
- A missing or failed peer may make a dependent capability degraded or unavailable, but must not crash, corrupt, or shut down the runtime.
- Preserve the last accepted durable input when the owning capability requires offline continuation.
- A runtime must not import another runtime's source or read or write another runtime's private storage.
- Cross-runtime interaction must use an explicitly shared, versioned package, API manifest, message contract, or other declared public artifact.
- Shared packages must be explicit dependencies with bounded exports; do not create a general shared implementation layer containing runtime responsibility.
- Runtime start, restart, state loading, and local tests must remain independently possible.

Briefly record intentionally added runtime capabilities in that runtime's `CAPABILITIES.md`. Record intentionally added multi-runtime outcomes in `shared/cross-runtime/CAPABILITIES.md`.

Do not promote temporary scaffold behavior, names, transports, or schemas to confirmed architecture.

## Test separation

- Put focused runtime tests under `runtimes/<runtime>/tests/` and multi-runtime happy paths under `shared/cross-runtime/tests/`.
- Put shared primitive tests with their package under `shared/packages/<package>/tests/` and shared test fixtures under the declared test-support package.
- Tests primarily prove intentionally supported happy flows. Add non-happy-path coverage only for advertised behavior, basic safety, or truthful capability claims.
- Default tests must be deterministic and must not make live or paid provider calls.
