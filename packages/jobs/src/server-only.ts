// Empty stub that `tsconfig.json` maps the `server-only` specifier to (see its
// compilerOptions.paths). The real `server-only` package's default export THROWS
// on import unless the React `react-server` resolution condition is set (Next sets
// it; a plain Node/tsx worker does not). Its only purpose is to fail a build if a
// module is pulled into a CLIENT bundle — irrelevant to this server-side worker —
// so neutralizing the marker here is correct, not a workaround. See DECISIONS.md.
export {};
