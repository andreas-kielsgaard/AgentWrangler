# Shared package instructions

Keep packages under `packages/` as bounded leaves with explicit exports. They may provide transport, persistence, versioned interface artifacts, diagnostics, or test support, but must not own runtime-specific product behavior.

Cross-runtime capability claims and composition tests belong under `cross-runtime/`.
