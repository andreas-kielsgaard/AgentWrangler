# Authority Server instructions

Maintain [CAPABILITIES.md](CAPABILITIES.md) when intentionally supported behavior changes.

Keep canonical configuration, the runtime endpoint directory, and the minimal server identity private to this runtime. Expose only declared bounded contracts; do not acquire Ranch presentation, Router execution, or Execution Node probing behavior. `Authority Server` is a temporary package name; do not infer credentials, grants, policy, or federation from it.

Run `npm start` and `npm test` from this package.
