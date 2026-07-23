# Conventions

> The hard rules live in AGENTS.md (always loaded). Load this file for the full
> naming table, the `apps/web/src` file-structure map, export/knip details, git
> hooks, and the rationale behind the rules.

## TypeScript

- `strict: true` in all tsconfigs. No `// @ts-ignore` or `as any` — fix the type.
- Prefer `interface` for object shapes; `type` for unions, intersections, and primitives.
- Avoid enums — use `as const` objects or string literal unions instead.
- `noUncheckedIndexedAccess` is enabled: always check array/object access results.
- Server-only modules use `import "server-only"` at the top to prevent client bundle leaks.
- Do **not** use `baseUrl` in tsconfig — it is deprecated in TS 6 (removed in TS 7). Define `paths` without it; they resolve relative to the tsconfig's own location (e.g. `"@/*": ["./src/*"]` in `apps/web/tsconfig.json`).
- Never put `paths` in a shared/extended tsconfig — relative path mappings resolve against the file that *defines* them, so they'd point at the wrong directory. Each app declares its own `paths`.

## Naming

| Thing | Convention | Example |
| --- | --- | --- |
| Files | kebab-case | `user-profile.tsx` |
| Directories | kebab-case | `components/user-profile/` |
| React components | PascalCase | `UserProfile` |
| Functions / variables | camelCase | `getUserById` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_FILE_SIZE` |
| Zod schemas | camelCase + `Schema` suffix | `userSchema` |
| Types / interfaces | PascalCase | `UserProfile` |
| tRPC routers | camelCase + `Router` suffix | `userRouter` |
| Zustand stores | camelCase + `Store` suffix | `useAuthStore` |
| DB table names | snake_case (Drizzle convention) | `user_profiles` |

## Exports

- Named exports everywhere. Default exports only where a framework/tool requires: page files, layout files, route handlers, `next.config.ts`, and tool config files (`vitest.config.ts`, `playwright.config.ts` — they `export default defineConfig(...)`).
- One React component per file.
- Index barrel files (`index.ts`) at package roots only — not within `apps/web`.
- **Dead code is gated by knip** (`pnpm knip`, root `knip.jsonc`; CI `verify` lane, A27): an unused file, an export no other file imports, or an unused/undeclared dependency fails CI. When it flags your change, prefer deleting the orphan. An export kept deliberately as boilerplate API surface (not yet consumed in-repo) gets a `/** @public — why */` JSDoc tag on the declaration — knip skips `@public`-tagged exports (`tags: ["-public"]`), and the reason lives next to the code. Exports a file itself uses are always allowed (`ignoreExportsUsedInFile`). A `knip.jsonc` ignore is the last resort and must carry its reason.

## Tests

- Unit/component tests: `*.test.ts(x)`, **co-located** with the file under test (run by Vitest).
- E2E tests: `*.spec.ts` under `apps/web/e2e/` (run by Playwright).
- Keep the suffixes distinct — `*.test.*` for Vitest, `*.spec.*` for Playwright — so neither runner picks up the other's files. See [TESTING.md](TESTING.md).

## File Structure Within `apps/web/src`

```text
app/
  layout.tsx        — root layout: a bare passthrough (owns only the globals.css
                      import); the real document shell lives in [locale]/layout.tsx
  [locale]/         — the WHOLE page tree (i18n path routing — see I18N.md);
                      [locale]/layout.tsx owns <html lang>, providers, Toaster
    (auth)/         — auth pages: login, signup, forgot-password, reset-password
                      (shared centered-card layout; render at /login, /signup, …)
    (dashboard)/    — protected app shell (nav + user menu + sign-out); the layout
                      runs the authoritative session check, redirects to /login if none
    page.tsx        — the landing page (renders at /)
  api/              — route handlers (auth, trpc, stripe, uploadthing, health)
i18n/               — next-intl plumbing: routing.ts, request.ts, navigation.ts
components/
  [feature]/        — co-locate component with its types and hooks
    component-name.tsx
    use-component-name.ts   (hook, if any)
server/
  trpc/
    routers/        — one file per domain (user.ts, post.ts, etc.)
    root.ts         — appRouter combining all routers
    trpc.ts         — tRPC instance + context
  actions/          — Server Actions, one file per domain
```

(Message catalogs live beside `src/` at `apps/web/messages/{en,es}.json`.)

## React

- Default to Server Components. Add `"use client"` only when you need browser APIs, event handlers, or hooks.
- Co-locate `"use client"` at the lowest possible component in the tree.
- Do not fetch data in Client Components — pass data down from Server Components or use TanStack Query for client-side refetching.
- **React Compiler is on** (`reactCompiler: true`), so don't reach for `useMemo`/`useCallback`/`React.memo` by default — the compiler memoizes for you. Write idiomatic components and keep the [Rules of React](https://react.dev/reference/rules) (no mutation during render, hooks at the top level); the compiler skips anything that breaks them. If a component must be left uncompiled, add the `"use no memo"` directive to it. Rationale in [DECISIONS.md](DECISIONS.md).

## Comments

No comments unless the WHY is genuinely non-obvious (a hidden constraint, a subtle invariant, a framework bug workaround). Never explain WHAT the code does.

## Imports

Biome's `organizeImports` assist handles ordering automatically. Manually maintain this rough order if editing:

1. Node built-ins
2. External packages
3. `@repo/*` packages
4. `@/*` app-internal imports
5. Relative imports

## Error Handling

- Server Actions return the shared `ActionResult<T>` (`@repo/validators`): `{ data: T }`
  or `{ error: string; fieldErrors?: Record<string, string> }` — the optional per-field
  `fieldErrors` (A7) map to inline RHF `setError` messages; the form-level `error` stays
  a banner. See [API.md](API.md#typed-field-errors--the-actionresult-convention-a7).
- tRPC procedures throw `TRPCError` with appropriate codes.
- Client-side errors surface via TanStack Query's `error` state or React Error Boundaries.
- Never swallow errors silently.

## Git hooks

[husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) run a fast quality gate locally before code leaves your machine (CI still runs the full gate). They install automatically on `pnpm install` via the root `prepare` script — no manual setup. Bypass any hook with `git commit --no-verify` / `git push --no-verify`.

| Hook | Runs | Purpose |
| --- | --- | --- |
| `pre-commit` | `lint-staged` → `biome check --write` on staged `*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,json,jsonc,css}` | Formats, lints, and sorts imports on **staged files only**; safe fixes are re-staged. An unfixable error (e.g. an unused variable) blocks the commit. |
| `commit-msg` | a dependency-free POSIX-sh check (`.husky/commit-msg`) | Rejects empty / too-short (`< 10` chars) subjects and leftover `fixup!`/`squash!` prefixes. Deliberately **not** a Conventional-Commits enforcer (history is mixed-style on purpose); the length floor is a tunable variable at the top of the script. |
| `pre-push` | `pnpm type-check` | Project-wide `tsc` across all packages (turbo-cached → near-instant when types are unchanged). |

- **Why type-check is pre-push, not pre-commit:** the repo's types cross package boundaries and `type-check` `dependsOn` `^build`, so a per-file `tsc` would be unsound. The full check is heavier, so it sits at the less-frequent push boundary while `pre-commit` stays fast by touching only staged files.
- **Markdown isn't linted by the hooks** — Biome doesn't lint Markdown; markdownlint stays editor-only (see `.markdownlint.jsonc`).
- **husky internals** live in the git-ignored `.husky/_/`; the committed hooks are `.husky/{pre-commit,commit-msg,pre-push}`. The `prepare` script no-ops safely where there's no `.git` (the Docker build, CI installs), so it never breaks those.
