// Empty stub that `vitest.config.ts` aliases the `server-only` specifier to for
// node-env tests (mirrors @repo/jobs). The real `server-only` package's default
// export THROWS on import unless the React `react-server` resolution condition is
// set (Next sets it; a plain Node/Vitest run does not). Its only purpose is to fail
// a build if a module is pulled into a CLIENT bundle — irrelevant when we import the
// send helpers directly to assert their graceful-degradation contract — so
// neutralizing the marker here is correct, not a workaround. See DECISIONS.md.
export {};
