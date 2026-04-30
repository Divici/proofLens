// Test-only stub for the `server-only` package. The real package throws
// in non-server contexts to enforce server-only imports in production
// builds. In Vitest we explicitly want to exercise these modules as
// regular Node code, so this stub is a no-op.
export {};
