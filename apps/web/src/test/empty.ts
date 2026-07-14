// Empty module used to alias `server-only` during Vitest runs. The real
// `server-only` package throws on import outside a React Server build (its
// `default` export is a hard throw), which would break unit tests for the
// server-only `lib/*` modules. Aliasing it here makes the import a no-op.
// See apps/web/vitest.config.ts.
export {};
