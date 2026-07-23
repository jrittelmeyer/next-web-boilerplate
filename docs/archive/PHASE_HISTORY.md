# Phase History — full per-step record (Steps 1–29)

> **Archived historical record. Not loaded by agents in normal work.** Read this
> only when you need the *rationale* behind a past decision, or the exact
> verification a step performed. Current state lives in
> [../PROJECT_STATUS.md](../PROJECT_STATUS.md); durable architectural decisions in
> [../context/DECISIONS.md](../context/DECISIONS.md); working agreements in
> [../../CLAUDE.md](../../CLAUDE.md).
>
> Two formats are preserved verbatim from the original PROJECT_STATUS.md:
> (1) the prepended **narrative log** (Steps 17–29, newest first), and
> (2) the per-step **notes / carry-overs** blocks (Steps 25→1).

---

## Narrative log (Steps 17–29, newest first)

_Last updated: 2026-06-24 · **Post-Step-29 CI fix — the push-to-main E2E lane is GREEN for the first time (verified in GitHub Actions, run `28129405045`).** Installing + authing the **`gh` CLI** (prior sessions had none, so CI was never observed from the machine) revealed the **E2E lane had been silently failing across Steps 27–29**: Playwright's webServer (`next start`) exited 1 with `Invalid environment variables: DATABASE_URL, BETTER_AUTH_SECRET undefined`. Cause: **Turborepo 2.x strict env mode** — a task only sees env it declares, and the `test:e2e` task declared none, so turbo stripped the job-level `DATABASE_URL`/`BETTER_AUTH_SECRET` before the webServer spawned. **Masked locally** because `pnpm start`'s `dotenv -e ../../.env` re-injects them from the real `.env`; CI has no `.env`. **Fix:** a **`passThroughEnv`** on the `test:e2e` turbo task (mirrors the app runtime env the `build` task declares + the new `E2E_BASE_URL`); confirmed via `turbo run test:e2e --dry-run` and a now-green CI run (verify · audit · **e2e** all ✓; the new "Integration tests (DB)" step also ✓). **`CodeQL` workflow now gated opt-in (resolved)** — it had failed every push since Step 26 (expected on a **private repo without GitHub Advanced Security**: `Code scanning is not enabled for this repository`). Gated on **`if: vars.ENABLE_CODEQL == 'true'`** so it **skips** (neutral run, no false-red) until the repo is public / GHAS is enabled — then `gh variable set ENABLE_CODEQL --body true` (documented in DEPLOYMENT.md). **The entire CI surface is now clean: CI green (verify · audit · e2e), CodeQL skipped.** Also: the **`gh` CLI is installed + authed on this machine** going forward, so CI is observable from here. ━ **Phase 2 COMPLETE — Step 29 done (testing depth); this closes Steps 17–29.** The first step since Step 25 to add a **dependency** but **no app code** — only tests, test config, CI, and docs. Delivers the four testing-depth artifacts on the **real `posts` entity** (Step 28), all verified live. **New dep:** **`@axe-core/playwright`** **exact-pinned `4.11.3`** (a **devDep of `apps/web`**) — the latest `4.12.1` published **1 day ago** (fails the 7-day release-age gate) and a caret would re-resolve to it, so exact-pin (same posture as `lint-staged`/`lucide-react`); it bundles **`axe-core@4.11.4`** and peer-matched the existing **`playwright-core@1.61.0`**. Also **promoted `vitest ^4.1.9` to a direct devDep of `@repo/db`** (it was already transitively in the tree → `pnpm install` reported **"added 2"** = the two axe packages only). **Both pure-JS, no native postinstall → no `allowBuilds`/lockfile-policy change** (install printed the supply-chain pass; **`--frozen-lockfile` clean** for CI). **(1) DB-backed Vitest integration test** — new **`packages/db/__tests__/integration/posts.test.ts`** (4 tests) runs the **exact SQL behind tRPC `post.list`** (`select` projection + **`leftJoin` author name** + `desc(createdAt)` + limit), an insert→read-back (the `findFirst` `deletePost` does), a delete, and the **FK `onDelete:"cascade"`** (deleting the author removes the posts) against **real Postgres**. Wired so the **default run stays DB-free**: a dedicated **`packages/db/vitest.config.ts`** (node, `fileParallelism:false`) `include`s only `__tests__/integration/**` with a **`setupFiles`** that loads the root `.env` **before** `@repo/db` is imported (the pg `Pool` reads `DATABASE_URL` at construction; dotenv no-ops in CI where it's already set); **`@repo/db` gets only a `test:integration` script (no `test`/`test:coverage`)**, so `turbo test`/the `verify` lane never invoke it (proven: `pnpm test` ran only validators+ui). `tsconfig.json` `include` extended to `__tests__/**` so **`pnpm type-check` covers it**. Scoped to a fixed **`integration-test-author`** that **cleans up via the FK cascade** without touching the 4 `db:seed` posts (proven live: seed intact, author removed). **(2) Auth-flow + (3) example-entity E2E** (`apps/web/e2e/`, Playwright) — the repo ships **no `/login` UI**, so **`e2e/auth.spec.ts`** signs up through the **Better Auth HTTP API** via **`page.request`** (which shares the browser cookie jar) and asserts a **Server Component greets the user by email** on `/posts` (+ a logged-out negative); the shared helper is **`e2e/support/auth.ts`** (`makeTestUser`/`signUp`). **`e2e/posts.spec.ts`** drives the **DB-backed CRUD through the real UI** — publish via the `createPost` Server Action → the row appears via the public `post.list` query (cache invalidated, no reload) → author-only delete removes it — plus a logged-out **"Unauthorized"**. **Key discovery (a real cross-mode bug the tests caught):** the create form's **RHF-controlled inputs hydrate *between* the two `fill()` calls on the faster prod build** — the first fill (Title) lands pre-hydration and is **wiped** when React attaches → "Title is required" → **the posts specs PASSED on the `:3000` dev server but FAILED on the `:3100` prod build**; fixed by **waiting for `networkidle`** (hydration kicks off the `post.list` refetch, making it a reliable "hydrated" gate) before filling, with a **`toHaveValue` guard** (documented in TESTING.md). **(3-a) a11y** — **`e2e/a11y.spec.ts`** scans `/` (DB-free) and `/posts` (the form surface) with **`@axe-core/playwright`** (`wcag2a`+`wcag2aa`) and **fails on any `critical`/`serious` violation** — both pages clean. **Test-infra fixes:** added an optional **`E2E_BASE_URL`** to `playwright.config.ts` (target an already-running server + skip the managed `webServer`; default/CI path unchanged) — used to run the suite against the `:3100` prod build without disturbing the standing `:3000` dev server; and added **`afterEach(cleanup)` to `@repo/ui`'s test `setup.ts`** — RTL auto-cleanup only registers with Vitest `globals` (this config uses explicit imports), so renders were silently **accumulating across a file** (a latent gap that surfaced once the new `textarea.test.tsx` cases shared an `aria-label`). **(4) Enforced coverage thresholds raised:** **`@repo/validators` 90 → 100** (pure logic, already at 100% — a new untested schema now fails the gate) and **`@repo/ui` floor 10/10/35 → 15/15/40** (lines/funcs/statements/**branches**), backed by the **actual 18.84 / 20 / 47.82%** after adding a **`textarea.test.tsx`** (3 cases for the Step-28 `Textarea`, which was untested) — kept a documented **regression floor**, not a target. The **"gate fails below threshold" proof was captured live** (a transient ui `lines:25` → **exit 1** `Coverage for lines (18.84%) does not meet global threshold (25%)`, then reverted). **CI:** the **push-to-main `e2e` lane** gains an **"Integration tests (DB)"** step (`pnpm --filter @repo/db test:integration`, after `db:migrate`, before Playwright); the **DB-free `verify` lane is unchanged**. **No env var, no CSP/SECURITY.md change, no app code touched** — static-generation posture unchanged. **Fully verified on this machine:** full gate green — **lint (Biome 147 files**, +8 new test files), **type-check 6/6** (incl. the integration test + e2e specs), **build** (**`/posts` `ƒ`**; `/` + every static demo + all 7 SEO routes still prerender `○`), **`pnpm test:coverage`** (validators **9/9 @ 100**, ui **9/9** @ the raised floor), **`pnpm test`** (DB-free) ran **only validators+ui** (skipped `@repo/db`), **`pnpm --filter @repo/db test:integration` 4/4** against local Postgres (seed intact after). **E2E live:** the **full suite 7/7** (home + auth ×2 + posts ×2 + a11y ×2) against a **fresh prod build on `:3100`** (via `E2E_BASE_URL`), run **twice** — serial (`--workers=1`) **and** 4-worker parallel — **deterministic**; the 9 throwaway `e2e-*@example.com` users were **cascade-cleaned**, DB back to the 4 seed posts; `:3100` stopped; the standing `:3000` dev server left running. Docs: **TESTING.md** substantially updated (Integration-pattern rewritten to the real `posts.test.ts` + the `test:integration`/no-`test`-script wiring; Playwright-pattern's future-`/login` placeholder replaced with the **API-driven auth flow** + the **hydration-race** note + **`E2E_BASE_URL`**; new **Accessibility (axe)** section; coverage table → 100 / 15-40; stack/conventions/commands), **PHASE_2_PLAN.md** Step-29 ✅ + header marked **complete**, CLAUDE.md resume pointer → **Phase 2 complete**. ━ Prior: **Step 28 complete (example domain entity, end-to-end).** The first step that adds **app code + a migration + a (dev) dependency** since the docs/config run of Steps 25–27 — a real `posts` entity wired through every layer as the **copy-me template**: schema + migration → public tRPC query → Server Actions → UI → Meilisearch-on-write → `db:seed`. **Schema:** new **`packages/db/src/schema/posts.ts`** (`posts` — `id` uuid `defaultRandom()`, **`authorId` text NOT NULL → `user.id` `onDelete:"cascade"`**, `title`, `content`, `created_at`/`updated_at`; `Post`/`NewPost` types), exported from the schema barrel. Migration **`0002_kind_boomer.sql`** (`CREATE TABLE posts` + the FK constraint) generated + **applied to local Postgres** (`appdb`; FK + cascade confirmed via `\d posts`). **Validators:** `createPostSchema` (`title` 1–200, `content` 1–5000, trimmed) + `CreatePostInput` in `@repo/validators`, shared client↔server, with **3 new unit tests** (9/9). **Seed:** new **`db:seed`** script (`packages/db/src/seed.ts`) run by **`tsx`** — a new **devDep of `@repo/db` pinned `^4.22.4`** (latest, ~24 days aged → clears the 7-day gate; **`esbuild` was already `allowBuilds:true`** so **no new build prompt**, and `pnpm install` reported **"added 0"** = tsx was already transitively in the tree, so this is a *promotion to a direct devDep*, not a new package). The seed inserts a deterministic `seed-author` (`user` row) + 4 **fixed-UUID** posts via **`onConflictDoNothing`** (idempotent — re-running stays at 4 rows, proven live), FK-ordered author→posts. It's **DB-only** (no Meilisearch import — preserves the "`@repo/db` is pure Drizzle/Postgres" rule); `dotenv` loads the root `.env` **before** the client is pulled in via **dynamic `import()`** (the pool reads `DATABASE_URL` at construction and ESM hoists static imports); `client.ts` now **exports `pool`** so the script can `await pool.end()` and exit cleanly. **API:** **`post.list`** (`publicProcedure`, `server/trpc/routers/post.ts`) lists posts newest-first, **`leftJoin`-ing the author name from `user`** (`authorName`) rather than a Drizzle `relations()` (keeps the Better Auth schema untouched); registered as `post` in `root.ts`. **Three Server Actions** (`server/actions/post.ts`): **`createPost`** (auth-gated, **rate-limited 10/min/user**, validates, inserts via `@repo/db`, then **indexes `{id,title,content}` into Meilisearch on write**), **`deletePost`** (**author-only** row-level authz → typed `Forbidden`, deletes + **de-indexes**), **`reindexPosts`** (auth-gated bulk-rebuild from the DB — **this replaces the old hardcoded `EXAMPLE_DOCUMENTS`/`indexExampleDocuments`**, and bridges the DB-only seed → the engine). Per-post indexing is **best-effort** — a search outage is `log.warn`'d but **never fails the DB write** (the row is the source of truth; reindex repairs the index). **Search rewire:** `lib/search.ts` `EXAMPLE_INDEX`→**`POSTS_INDEX`**, `SearchDocument`→**`PostDocument`** (search router updated to match); **`server/actions/search.ts` deleted**; the `/search` demo's button is now **"Reindex posts from database"** (`reindexPosts`) with updated copy. **UI:** new **`/posts`** page — an **RSC that's dynamic (`ƒ`)** because it reads the session, so its **`prefetchQuery(post.list)` + `<HydrateClient>`** run at **request time, never at build** (build stays green with the DB down), making it the **first live demo of the documented RSC prefetch/hydration pattern**; client **`CreatePostForm`** (RHF + `createPost` + `invalidateQueries`) and **`PostList`** (`useQuery(post.list)` + author-only delete). Needed a **`Textarea`** primitive — none existed in `@repo/ui`, so added the canonical shadcn **`textarea.tsx`** (hand-written to the repo's `data-slot`/`cn` style). **No CSP / SECURITY.md change** — Meilisearch calls are server-to-server (`server-only`), already covered by the Step-20 rationale. **Fully verified on this machine:** full gate green — **lint (139 files**, +7 net = 8 new TS/TSX − the deleted `search.ts` action), **type-check 6/6**, **build** (**`/posts` is `ƒ`**; `/` + every static demo + all 7 SEO routes still prerender `○`, `/search` stays `○`), **Vitest validators 9 / ui 6**, **validators coverage 100% > the 90 gate**. **Live:** `db:migrate` + `db:seed` (idempotent — 4 posts after two runs); the `/posts` SSR HTML on the running `:3000` dev server carries all 4 seed titles + "Seed Author" (proving `post.list` + the author `leftJoin` + the prefetch render). **End-to-end Playwright/chromium** against a **fresh prod build on `:3100`** (Meilisearch injected via shell env — `dotenv` doesn't override already-set vars — so the standing `:3000` dev server + the committed `.env` were both left untouched) — **all 9 assertions PASS:** browser authed (Better Auth cookie from a throwaway sign-up), **`createPost` (authed) → success**, new post **appears in `post.list`** (query invalidation), **search finds it (indexed on write)**, **`reindexPosts` → "Reindexed 5 posts"** (4 seed + 1 created), **search finds a seed post after reindex**, **`deletePost` removes it from the list**, **de-indexes it (no search hit)**, **logged-out `createPost` → "Unauthorized"**. Throwaway `step28-author@example.com` user + its posts cascade-deleted, the test post + Meili docs cleared, **DB back to the 4 seed posts**; `:3100` stopped; `:3000` dev left running (the standing carry-over). Docs: DATABASE.md (`posts` is now the real worked example + a new **"Seeding (`db:seed`)"** section — tsx/dotenv/dynamic-import rationale, the DB-only-vs-search note), ARCHITECTURE.md (demo-routes table gains `/posts` + a **"copy-me template, not throwaway"** note; `/search` row updated), API.md (a **"Example entity (`post`)"** section + the `/posts` prefetch-demo note), SERVICES.md (Meilisearch now indexes **real posts** on write; `EXAMPLE_DOCUMENTS` retired), CLAUDE.md resume pointer → **Step 29**, PHASE_2_PLAN.md Step-28 ✅. **Next: Step 29 — testing depth** (auth-flow E2E, a DB-backed integration test, an axe a11y check, enforced coverage on the real `posts` entity). ━ Prior: **Step 27 complete (community & editor files).** Docs/config only — **no app code, no new dependency, no env var, no lockfile/`allowBuilds` change**; static-generation posture unchanged and cross-platform safe. Ten new files + three meta edits. **Community health:** **`LICENSE`** (MIT, © 2026, the repo owner — makes the README's long-stated "MIT" real), **`CONTRIBUTING.md`** (root — prereqs/Node 24·pnpm 11·Docker, the `install → db:migrate → dev` quickstart, the full gate, the **Step-25 Git-hooks table** repeated from CONVENTIONS.md, the Vitest-`*.test.*`/Playwright-`*.spec.*` convention, the "read the `docs/context/*` doc first" rule, and the PR flow), **`CODE_OF_CONDUCT.md`** (root — Contributor Covenant v2.1, contact the maintainer email), and **`.github/SECURITY.md`** — a vulnerability-**disclosure policy** (private reporting via GitHub Security Advisories / email, supported = latest `main`, response expectations). **Key design call — the `SECURITY.md` name collision:** the community policy lives at **`.github/SECURITY.md`** (GitHub-recognized) and **explicitly cross-links** the pre-existing **`docs/context/SECURITY.md`** (the Step-18 CSP/headers *engineering* reference) so the two are never confused — the context doc is **untouched**. **GitHub templates:** **`.github/PULL_REQUEST_TEMPLATE.md`** (summary / linked issue / type-of-change / the lint·type-check·build·test gate checklist / PROJECT_STATUS-updated reminder) and **`.github/ISSUE_TEMPLATE/`** Issue Forms — **`bug_report.yml`**, **`feature_request.yml`**, **`config.yml`** (`blank_issues_enabled: false` + a security-policy + docs contact link). **Editor config:** **`.editorconfig`** aligned **exactly** to `biome.json` (space / width 2 / LF / utf-8 / final-newline / trim-trailing / max 100) so it can't fight Biome — Markdown overrides `trim_trailing_whitespace:false` (preserve hard-break spaces), `*.{bat,cmd}` → CRLF; **`.vscode/extensions.json`** (recommends biome, tailwindcss, playwright, markdownlint, editorconfig, docker); **`.vscode/settings.json`** (Biome default formatter + format-on-save + safe-fixes-on-save, markdownlint for `[markdown]`, Tailwind-v4 `classRegex` for `cva()`/`cn()`, search excludes, `files.eol:"\n"`). **The one required `.gitignore` deviation (user-confirmed):** removed the `.vscode/settings.json` ignore so the **shared** workspace settings file is now **tracked** — committing it is exactly what makes the Biome/Tailwind/markdownlint toolchain "work on first open"; `.idea/`/`.vs/` stay ignored. **Biome normalization note:** `biome check --write` rewrote `.vscode/settings.json`'s `editor.codeActionsOnSave` from the documented `source.organizeImports.biome`+`quickfix.biome` pair to its own canonical **`source.fixAll.biome`** — **kept as-is** (the Step-25 pre-commit `biome check --write` hook would reproduce it every commit; fighting it just churns the file), comment adjusted to match. **README:** added a "Contributing" section (→ CONTRIBUTING.md / CODE_OF_CONDUCT.md / `.github/SECURITY.md`) and linked the new `LICENSE` file from the License line. Docs: CLAUDE.md resume pointer → **Step 28**; PHASE_2_PLAN.md Step-27 ✅. **Fully verified on this machine:** full gate green — **lint** (Biome **132 files**, +2 vs Step 26 = the two new `.vscode/*.json`; YAML + Markdown aren't Biome-counted, and Biome left both JSON files clean after the single `codeActionsOnSave` normalization), **type-check** (6/6 cached), **build** (**`/` + every static demo + all 7 SEO routes still prerender `○`**; the `ƒ` routes — `/admin`,`/api/*`,`/billing/success`,`/profile` — are pre-existing; a docs/config-only change, so rendering is unaffected). **UNVERIFIED locally (documented, consistent with prior GitHub-only artifacts like the Renovate App / CodeQL upload):** the GitHub-side rendering — community-profile detection, Issue-Forms schema validation, the PR template, and `config.yml`'s contact links — only render/validate **on GitHub**; **no local YAML parser was available** (`node` `yaml`/`js-yaml` and `python` `yaml` all absent), so the three issue-template YAMLs were authored strictly to GitHub's Issue-Forms schema rather than machine-validated here. ━ Prior: **Step 26 complete (dependency & security automation).** Config + docs only — **no app code, no new runtime dependency** (Renovate/CodeQL are GitHub-side; nothing added to any `package.json` deps), so **no `allowBuilds`/lockfile change** and the static-generation posture is unchanged. **Renovate** (`.github/renovate.json`, validated by `renovate-config-validator` → exit 0): **`minimumReleaseAge: "7 days"`** + `internalChecksFilter: "strict"` codifies the manual "let a release age" rule at the **update layer**; **`rangeStrategy: "auto"`** preserves the repo's mixed posture (bumps the exact pins — stripe/@sentry/posthog-*/lucide/lint-staged — as new exact pins, widens carets in place); `semanticCommits: "disabled"` (history is intentionally mixed-style, same reason the Step-25 commit-msg hook isn't a Conventional-Commits enforcer); weekly `schedule` + `lockFileMaintenance`, `@types/*` grouped, **major bumps gated behind Dependency-Dashboard approval**, and **security PRs bypass the age gate** (`vulnerabilityAlerts.minimumReleaseAge: null`). Setup needs the **Renovate GitHub App** installed (documented). **Key verification discovery → plan deviation:** the approved plan said "make `minimumReleaseAge` explicit in `pnpm-workspace.yaml`", but testing showed pnpm validates the **WHOLE lockfile** against the gate on **every install, including `--frozen-lockfile`** — and this repo is only days old, so its own deliberate pins (stripe/@sentry/posthog) **and** fresh transitives (`@rollup/rollup-*` via vite, ~50 entries) are still <7 days old; a 7-day install-time gate **rejected the current lockfile** (`pnpm install --frozen-lockfile` exit 1: "lockfile contains entries that the active policies reject"), which would break CI + the Docker build. So the install-time gate is **left commented** in `pnpm-workspace.yaml` with the rationale + how/when to enable it; Renovate (update-time, zero build friction) owns the policy instead — the right layer anyway. **Supply-chain audit:** new **`audit`** CI job runs `pnpm audit --audit-level high --ignore-registry-errors` (green on the status quo, red on a NEW high/critical). Three **known unfixable transitive** advisories are explicitly acknowledged in `pnpm-workspace.yaml` **`auditConfig.ignoreGhsas`**, each with its path + low-risk rationale: **`effect`** GHSA-38f7-945m-qr2g (via uploadthing — not on a path we exercise), **`esbuild`** GHSA-67mh-4wv8-2f99 (dev-server only, via drizzle-kit, never run here), **`postcss`** GHSA-qx2v-qp2m-jg93 (stringify XSS, via next's bundled copy). **CodeQL** (`.github/workflows/codeql.yml`): `javascript-typescript`, `build-mode: none` (no compile for JS/TS), push/PR-to-`main` + weekly cron, least-priv `permissions` (`security-events: write`); surfaces under Security→Code-scanning only on a public repo or with GHAS (workflow valid regardless — documented). **Coverage:** each test-bearing package's `vitest.config.ts` gained a `coverage` block (`provider:"v8"`, `all:true` so untested files count honestly, `reporter:["text","json","lcov"]`) + **enforced `thresholds`** — **`@repo/validators` 90%** (pure logic, actually 100%) and **`@repo/ui` a low regression floor** (lines/funcs/statements **10**, branches **35**) because the package is **~18% by design** (mostly shadcn presentational primitives the repo deliberately doesn't unit-test — TESTING.md). Coverage runs **only under `--coverage`** via a new **`test:coverage`** turbo task + per-package scripts, so plain `pnpm test` stays fast/warning-free; the `verify` CI job switched to **`pnpm test:coverage`** and now **uploads every `packages/*/coverage/` as an artifact** (always) + to **Codecov** when a `CODECOV_TOKEN` secret is set (skipped otherwise — self-contained). `coverage/` was already git-ignored. **Step 29 raises the bars** once real tests land. Docs: new **"Dependency & security automation"** section in DEPLOYMENT.md (Renovate, the audit allowlist, CodeQL, the pnpm-vs-Renovate `minimumReleaseAge` rationale, the GHAS/App-install caveats) + CI-job updates; TESTING.md coverage section rewritten (the per-package threshold table, `test:coverage`, the Step-29 note); a STACK.md automation note; PHASE_2_PLAN.md Step-26 ✅; CLAUDE.md resume pointer → Step 27. **Fully verified on this machine:** full gate green — lint (**130 files**, incl. the new `renovate.json`), type-check (6/6), build (**`/` + every static demo + all 7 SEO routes still prerender `○`**; the `ƒ` routes are pre-existing); **`pnpm test:coverage` exit 0** (validators 6/6 @ 100% > 90 gate; ui 6/6 @ ~18% > floor); **the "coverage gate fails below threshold" proof was captured live** — a transient ui threshold of 20% errored with `Coverage for lines (17.64%) does not meet global threshold (20%)` (×4) + exit 1, then reverted to the passing floor; **`pnpm audit --audit-level high --ignore-registry-errors` → exit 0** ("Severity: 2 moderate (2 ignored) | 1 high (1 ignored)"); **`renovate-config-validator` → "Config validated successfully", exit 0**; both workflow YAMLs parse (`ci.yml` jobs verify/audit/e2e; `codeql.yml` job analyze). **GitHub-side runs are UNVERIFIED locally** (the Renovate App, the CodeQL scan upload, the Codecov upload) — documented, consistent with how prior CI-only changes were handled (some verified by simulation, the rest on push). ━ Prior: **Step 25 complete (Git hooks).** Added **husky `^9.1.7`** + **lint-staged `17.0.7`** (both **devDeps in the workspace root only**, pure-JS, **no native postinstall → no `allowBuilds` change**; husky is a caret on a >1.5-yr-aged release, lint-staged is **exact-pinned** at the ~24-day-aged `17.0.7` because the 4-day-old `17.0.8` trips the release-age gate and lint-staged publishes frequently — same exact-pin posture as `stripe`/`@sentry/nextjs`/`lucide-react`). Three committed hooks under **`.husky/`** (husky's generated `.husky/_/` internals are git-ignored, so only the three user hooks are tracked): **`pre-commit`** runs `pnpm lint-staged` → `biome check --write --no-errors-on-unmatched` on staged `*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,json,jsonc,css}` (formats + lints + sorts imports, **re-stages safe fixes**, blocks on an unfixable error); **`commit-msg`** is a **dependency-free POSIX-sh** check (rejects empty / `<10`-char / leftover `fixup!`/`squash!` subjects — a tunable floor, deliberately **not** a Conventional-Commits enforcer since the repo's own history is mixed-style); **`pre-push`** runs the **project-wide `pnpm type-check`** (turbo-cached), *not* a per-file `tsc` — which is unsound here because types cross packages and `type-check` `dependsOn ^build`. **Decision: type-check at pre-push, not pre-commit** — it's the heavier, project-wide gate, so it sits at the less-frequent push boundary while pre-commit stays fast (staged files only). lint-staged config in **`lint-staged.config.mjs`** (Markdown deliberately excluded — Biome doesn't lint it; markdownlint stays editor-only). Hooks auto-install via a root **`"prepare": "husky"`** script; **verified husky 9.1.7 prints a notice and exits 0 when there's no `.git`**, so the Docker build (`.dockerignore` excludes `.git`) and CI installs stay green with **no `|| true` guard needed**. **No app code touched; static-generation posture unchanged.** Docs: a new **"Git hooks"** section in CONVENTIONS.md (the three-hook table, the pre-push rationale, `--no-verify` escape hatch, the husky-internals/no-`.git` notes); CLAUDE.md resume pointer → Step 26. **Fully verified on this machine:** full gate green — lint (**129 files**), type-check (6/6), build (**`/` + every static demo + all 7 SEO routes still prerender `○`**; the `ƒ` routes are pre-existing); `pnpm install` printed **"✓ Lockfile passes supply-chain policies"** with **no ignored builds**. **Live (throwaway scratch branch + local bare remote, all deleted after):** (T1) a mis-formatted staged file → pre-commit Biome-reformatted + re-staged + committed (`{foo:'bar',baz : 1}` → `{ foo: "bar", baz: 1 }`); (T2) a staged unused-variable → pre-commit **blocked** (HEAD unchanged); (T3) `commit-msg` **blocked** empty / `"short"` / `fixup!…` and **allowed** a descriptive subject; (T4) a committed `TS2322` type error → **pre-push blocked the push** (`pnpm type-check` exit 2); (T5) `git commit`/`git push --no-verify` **bypassed** pre-commit + commit-msg + pre-push. All scratch files/commits/branch/remote removed; working tree clean. ━ Prior: **Step 24 complete (dark mode).** Activated the already-shipped `.dark` tokens with **`next-themes`** + a shadcn-style theme toggle — the step where **`lucide-react` finally lands** (deferred since Step 17). Two new deps in **`@repo/ui` only** (the toggle's home; the app imports the toggle, not icons directly): **`next-themes@^0.4.6`** (caret — >1yr aged, pure-JS) and **`lucide-react@1.18.0`** (**exact-pinned** to a ~12-day-aged release, *not* a caret — lucide publishes near-daily and the latest `1.21.0` was only 6 days old, so a caret would just re-resolve to it; exact-pin matches the `stripe`/`posthog`/`sentry` posture). Both pure-JS with no postinstall → **no `allowBuilds` change** (install passed the supply-chain policy with no ignored builds). Three new `@repo/ui` components: **`theme-provider.tsx`** (thin `"use client"` wrapper over next-themes — the **app** supplies the config in `layout.tsx`, so theme behavior lives with the app, not the lib), **`theme-toggle.tsx`** (a `DropdownMenu` Light/Dark/System using Lucide `Sun`/`Moon`/`Monitor`; it **only calls `setTheme`, never reads `theme` at render** — the Sun/Moon swap is pure CSS via the `dark:` variant, so server HTML and first client paint are identical → **no hydration mismatch**), and the **`dropdown-menu.tsx`** shadcn primitive it needed (built on the unified **`radix-ui`** — already a dep, so **no new npm dep** for the dropdown; full standard component, `data-slot` + repo style). **`layout.tsx`:** wrapped the tree in `<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>` (outermost of the now-**three** client providers — Theme > PostHog > tRPC — preserving the "providers only" layout convention) and added **`suppressHydrationWarning` to `<html>`** (next-themes' pre-paint script adds the class the server didn't render — a deliberate one-element mismatch). `<ThemeToggle />` dropped into the **real `/` landing page** (top-right) — permanent, not scaffold. **No CSP / SECURITY.md change:** next-themes injects an **inline** pre-paint script (the no-FOUC mechanism), already covered by the Step-18 `script-src 'self' 'unsafe-inline'` (static CSP, no nonce); the nonce-migration path (next-themes `nonce` prop) is noted in UI.md. Docs: a new **"Dark mode (`next-themes`)"** section in UI.md (provider/toggle, the no-render-read rationale, why next-themes over a store, the CSP note) + the Lucide/dark-mode stack lines; STATE.md now documents **three** root providers and a **"Theme — client preference, but NOT a Zustand store"** note (it's ephemeral client state by the rule, but next-themes owns it because a persisted theme hits the exact SSR-flash problem the `persist` note warns about); CLAUDE.md resume pointer → Step 25. Added a **`matchMedia` mock** to `@repo/ui`'s test `setup.ts` (jsdom lacks it; next-themes calls it with `enableSystem`) + a `theme-toggle.test.tsx` render smoke. **Fully verified on this machine:** full gate green — lint (**127 files**), type-check, build (**`/` + every static demo + all 7 SEO routes still prerender `○`** — the client `ThemeProvider` did **not** force dynamic rendering; the `ƒ` routes `/admin`,`/profile`,`/billing/success`,APIs are pre-existing), Vitest **6/6** (`@repo/ui`: 3 button + 2 empty-state + 1 theme-toggle). **Live (Playwright/chromium):** on the running **`:3000` dev server** (hot-reloaded) the toggle flips `<html>` `light`→`dark`→`light`, **persists across reload** (`localStorage theme=dark`, no flash), the **body bg/fg actually swap** (`lab(100 0 0)` white ⇄ near-black `lab(1.77 …)`), and the console shows **zero hydration warnings + zero errors** (dev mode, where React *would* surface a mismatch); on a **fresh prod build (`:3100`, strict CSP — no `unsafe-eval`)** the same toggle/persist works with **zero CSP violations** — and the inline pre-paint script is confirmed present in the prod `<head>` (reads `localStorage`/`matchMedia`), proving it passes the Step-18 CSP unchanged. `:3100` stopped, throwaway `theme-check.mjs`/`theme-bg.mjs` removed, `:3000` left running (the standing carry-over). ━ Prior: **Step 23 complete (SEO / PWA scaffolding).** Expanded the root metadata and added the App Router metadata-route files — **dependency-free** (`next/og` `ImageResponse` is built into Next; **no `lucide-react`** — still deferred to Step 24 — and **no binary asset blobs**, so the build stays Windows-safe). New **`apps/web/src/lib/site.ts`** (`server-only`) is the single source of truth: **`siteUrl`** reuses the validated **`BETTER_AUTH_URL`** (the canonical public origin — metadata renders server-side, so a server var is correct; **no new `NEXT_PUBLIC_APP_URL`**) with a **`?? "http://localhost:3000"` fallback** because under `SKIP_ENV_VALIDATION` (CI **and** the Docker build) `@t3-oss/env` returns raw `process.env` *without* applying the schema default, so `new URL(undefined)` would throw — the fallback keeps those builds green (real deploys set `BETTER_AUTH_URL` at build time; `metadataBase` + the sitemap bake into the static output), plus `siteConfig` (name/description/url). **`layout.tsx` metadata** grew from two lines to: `metadataBase: new URL(siteUrl)`, a **title template** (`{ default: "next-web-boilerplate", template: "%s · next-web-boilerplate" }`), `applicationName`, **OpenGraph** (type/siteName/title/description/url/locale) and **Twitter** (`summary_large_image`) cards — the manifest/icon/OG `<link>`/`<meta>` tags are injected automatically by their file conventions, so they are deliberately **not** repeated in the metadata object. Seven new app-root files: **`robots.ts`** (allow-all + `Sitemap:` + `Host:` pointer), **`sitemap.ts`** (lists **only `/`** — the demo routes are throwaway scaffold, so the sitemap deliberately doesn't advertise them; commented example for real routes), **`manifest.ts`** (PWA manifest: `display:"standalone"`, slate `theme_color:"#0f172a"`, icon refs), **`opengraph-image.tsx`** (a 1200×630 `ImageResponse` slate card — slate-900 bg / slate-50 monogram+title / slate-400 description, using next/og's built-in default font so there's no font file to ship), **`twitter-image.tsx`** (a one-line **re-export** of the OG image — Next emits `og:image` and `twitter:image` from *separate* files and does not derive one from the other, so the re-export serves the same design at `/twitter-image`), and **`icon.tsx`** (32×32) + **`apple-icon.tsx`** (180×180) generated favicon/touch-icon monograms. **No CSP change** — the manifest + icons are same-origin (covered by `default-src`/`img-src 'self'`; the webmanifest falls back to `default-src` since there's no `manifest-src` directive), and OG/Twitter images are crawler-fetched server-side (no browser CSP) — so **SECURITY.md is untouched** (as the plan predicted). **No new dependency, no env var, no lockfile/`allowBuilds` change.** Docs: ARCHITECTURE.md gained the SEO/metadata files in the `apps/web` structure listing + a note that the sitemap lists only `/`; CLAUDE.md resume pointer → Step 24. **Fully verified on this machine:** full gate green — lint (**124 files**), type-check, build (the **seven SEO routes all prerender `○`** — `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, `/opengraph-image`, `/twitter-image`, `/icon`, `/apple-icon` — and `/` + the static demos stay `○`, so the new metadata did **not** force dynamic rendering; `/profile` is `ƒ` as before — it reads `headers()`, unrelated to this step). **Live against the running `:3000` dev server:** all eight endpoints **200** with correct content-types (`text/plain`, `application/xml`, `application/manifest+json`, `image/png` × the real PNG bytes — OG 42 KB, icon 527 B, apple-icon 3.2 KB); robots body = `Allow: /` + sitemap/host; sitemap body lists only `<loc>http://localhost:3000</loc>`; the rendered `/` `<head>` carries the full set — `<title>next-web-boilerplate</title>`, `og:title`/`og:description`/`og:url`/`og:image` (absolute, via `metadataBase`, with width/height/alt/type)/`og:site_name`/`og:type`, `twitter:card=summary_large_image`/`twitter:image` (absolute, → `/twitter-image`), and `<link rel="manifest">`/`<link rel="icon" sizes="32x32">`/`<link rel="apple-touch-icon" sizes="180x180">`. **CSP proof on a fresh prod build (`:3100`, strict prod CSP — no `'unsafe-eval'`, with `upgrade-insecure-requests` + HSTS):** a throwaway Playwright/chromium pass on `/` reported **zero CSP violations**, and an in-browser exercise of the assets loaded `/icon` (32×32 `<img>`, img-src), `/apple-icon` (180×180), and `fetch('/manifest.webmanifest')` (200 `application/manifest+json`, connect-src) with no block — confirming the webmanifest + icons pass the Step-18 CSP. The `:3100` server was stopped after and the throwaway `csp-check.mjs` removed; the `:3000` dev server was left running (the standing carry-over). ━ Prior: **Step 22 complete (health endpoint + request telemetry).** Added a **liveness+readiness probe at `/api/health`** (`apps/web/src/app/api/health/route.ts`) — a **Route Handler, not a tRPC procedure** (a probe needs a real HTTP status it can act on; tRPC resolves success as 200 and wraps failures in a JSON-RPC envelope mapping a `TRPCError` to 500, never a clean 503), pinned **`runtime="nodejs"`** (node-postgres isn't Edge-safe) + **`dynamic="force-dynamic"`** (never prerender; the DB ping runs at request time, never at build — the build is green with the DB down because `@repo/db`'s pg `Pool` connects lazily and the module never throws at import). It runs a **`SELECT 1`** ping **raced against a 2.5s timeout** (a hung connection returns 503 fast — the losing query is `.catch`-swallowed so no unhandled rejection, and the timer is `clearTimeout`'d when the ping wins); DB reachable → **200** `{status:"ok",uptime,timestamp,checks:{database:"up"}}`, unreachable/timeout → **503** `database:"down"`. **One endpoint reports both signals:** liveness (uptime/timestamp, always present) + readiness (the DB ping), with the **HTTP status = readiness** — which is what the Docker `HEALTHCHECK`, compose `condition: service_healthy`, and PaaS gates actually consume; a k8s liveness/readiness split is a documented one-liner (`?check=live` → 200 whenever the process is up). Added a **`HEALTHCHECK` to `docker/Dockerfile`** (`node -e "fetch('http://127.0.0.1:3000/api/health')→process.exit(r.ok?0:1)"` — node is always present, whereas the alpine runtime has no `curl` and busybox `wget --spider` sends a HEAD the GET-only route 405s; `--start-period=40s` covers Next's cold boot, a 503 flips the container `unhealthy`) and an **explicit `healthcheck` on `docker-compose.prod.yml`'s `web` service** (mirrors the image's, declared for visibility/tunability). **The dev `docker-compose.yml` is intentionally unchanged** — it runs only Postgres+Meilisearch (local dev runs `pnpm dev` on the host, so there's no app container to probe); the reasoning is written into DEPLOYMENT.md per the working agreement. Added a **global tRPC timing/error middleware** (`apps/web/src/server/trpc/trpc.ts`): a `timingMiddleware` applied to a new **`baseProcedure`** that **every** procedure now derives from (public / protected / rateLimited / admin — it's outermost, so it also captures the auth + rate-limit rejections thrown by the inner middlewares), emitting one structured line per call — **BetterStack** via `@logtail/next` `log` (`info` on success, `warn` on an expected client error, `error` on a server fault; fields `path`,`type`,`durationMs`,`ok`,`code`) and **Sentry** `captureException` **only on `INTERNAL_SERVER_ERROR`** (expected UNAUTHORIZED/FORBIDDEN/TOO_MANY_REQUESTS rejections are normal traffic, not exceptions — and this is also the ONLY path tRPC faults reach Sentry, since tRPC catches errors internally before `instrumentation.ts`'s `onRequestError` can see them). Success logs batch (no per-request BetterStack round-trip on the hot path); the **error branch `await log.flush()`** so faults survive a serverless teardown (guaranteed all-log delivery on serverless is a documented `waitUntil`/log-drain option). **No new dependency and no new env var** (reuses `@repo/db` + the existing BetterStack/Sentry env) → nothing to version-check, no `allowBuilds`/lockfile change, cross-platform safe. **Graceful degradation intact:** `/api/health` and the middleware run with all observability env UNSET (the `log` API falls back to console, `Sentry.captureException` no-ops without a DSN). Docs: new **"Health checks & probes"** + **"Request telemetry"** sections in DEPLOYMENT.md (the 200/503 contract, probe `curl`, the liveness-vs-readiness merge + k8s split, the Dockerfile/`node`-probe rationale, **and the explicit "why the dev compose has no web healthcheck" note**), CLAUDE.md resume pointer → Step 23. **Fully verified on this machine:** full gate green — lint (**116 files**), type-check, build (now lists **`/api/health` as `ƒ`** dynamic while `/` + every demo still prerender `○`); **live `/api/health` against the running `:3000` dev server → 200 `database:"up"`, then stopped `nwb-postgres` → 503 `database:"down"`, then restarted → 200 recovered** (~2s); **also 200 on a fresh prod build (`:3100`)**; **tRPC telemetry live** (`:3100`, BetterStack UNSET → console fallback): `user.health` → `info - trpc.request { path:'user.health', type:'query', durationMs, ok:true }` (×2, printed without a flush), logged-out `admin.listUsers` → **401** + `warn - trpc.request { path:'admin.listUsers', type:'query', durationMs:0, ok:false, code:'UNAUTHORIZED' }`; **Docker HEALTHCHECK live** — `docker build` then `docker run` (DATABASE_URL → host Postgres via `host.docker.internal`) → container reports **`healthy`** (in-container `node` probe `exit=0`) within ~30s; `docker compose -f docker/docker-compose.prod.yml config` valid. **The Sentry `INTERNAL_SERVER_ERROR` branch is wired/type-checked but a live 500 wasn't force-triggered** (no DSN on this machine, consistent with Steps 13/17 — the `warn` branch live-proves the error-classification path). Throwaway `nwb-health-test` container + `nwb-web` image removed; the `:3100` server was stopped; the `:3000` dev server was left running (the standing carry-over). ━ Prior: **Step 21 complete (RBAC).** Added a minimal, hand-rolled role model (deliberately **not** the Better Auth `admin()` plugin). New **`role` column on `user`** (`packages/db/src/schema/auth.ts`): plain `text` (not a pg enum) typed to a new `Role` union, **`NOT NULL DEFAULT 'user'`**; canonical `ROLES = ["user","admin"]` lives there (the import-pure `@repo/db`), with `@repo/validators` keeping a matching `z.enum` (`setUserRoleSchema`) since it can't import db. Migration **`0001_mature_infant_terrible.sql`** (`ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL`) generated + **applied to local Postgres**. **Authoritative role read, never the session:** a new `server-only` **`apps/web/src/lib/rbac.ts`** (`getUserRole(userId)` = fresh DB read; `requireAdmin()` = session for identity + DB for authority) — because the Step-19 `cookieCache` can make a session-borne role up to 5 min stale. Consequently **`role` is NOT in Better Auth `additionalFields`** (no auth API can read/write it), so the only role writers are direct DB access + the admin-gated action, and **`packages/auth` is untouched**. Three guard layers: **tRPC `adminProcedure`** (builds on `protectedProcedure`, DB role check → `FORBIDDEN`; example `admin.listUsers` router), a **role-aware Server Action** (`server/actions/admin.ts` `setUserRole`, `requireAdmin()`-gated → typed `{error:"Forbidden"}`, validates with `setUserRoleSchema`; also the documented promotion path for *subsequent* admins), and the **`/admin` page guard** (`app/admin/page.tsx` Server Component → `requireAdmin()` → `notFound()` for non-admins) composed with the existing **optimistic `proxy.ts`** (now also cookie-gates `/admin` → `/login`; authoritative check stays in the page). **No new dependency** (nothing to version-check) and no lockfile/`allowBuilds` change; cross-platform safe. Docs: a new "RBAC (Step 21)" section in AUTH.md (role model, authoritative-read rationale, the three guard layers, manual-SQL promotion `UPDATE "user" SET role='admin'…`, graceful degradation, `admin()`-plugin upgrade note), `adminProcedure`/`setUserRole` notes in API.md, an `/admin` row in ARCHITECTURE.md's demo-routes table, CLAUDE.md resume pointer → Step 22. **Fully verified on this machine:** full gate green — lint (115 files), type-check, build (now lists **`/admin` as `ƒ`** dynamic — it reads the session — while `/` + every demo still prerender `○`), Vitest **11/11** (validators 6 incl. 3 new `setUserRoleSchema` cases + ui 5); migration confirmed in Postgres (`role text NOT NULL DEFAULT 'user'`). **Live against a fresh prod build on `:3100`** (a prior `next dev` holds `:3000`): two throwaway sign-ups both defaulted to `role='user'` (proving Better Auth never sets it); **logged-out tRPC `admin.listUsers` → 401 UNAUTHORIZED, non-admin → 403 FORBIDDEN**; after an SQL promotion, **the SAME pre-promotion cookie → 200 + user list** (proving the authoritative DB read beats the 5-min `cookieCache`); `/admin` logged-out → **307 → /login** (optimistic proxy), non-admin → custom **"Page not found"** with **zero admin data leaked** (the `findMany` runs only after `requireAdmin()` passes — `notFound()` throws first; the streamed **200** status is the known Next behavior for programmatic `notFound()` under the root `loading.tsx` Suspense shell, while the hard-status guards are the tRPC **401/403**), admin → **200 "Admin area"**; control unmatched path → **404**. Throwaway `step21-*@example.com` users cascade-deleted; `:3100` stopped. ━ Prior: **Step 20 complete (app-level rate limiting).** Added a shared, standalone app-level rate limiter at **`apps/web/src/lib/rate-limit.ts`** — `rateLimit(identifier, { limit, windowSec })` (always async) + `clientKeyFromHeaders()` (x-forwarded-for / x-real-ip → IP key) + `isDistributedRateLimitConfigured()`. **In-memory fixed-window store by default** (per-instance Map, prunes expired buckets, resets on restart); **switches to a distributed Upstash sliding-window limiter when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are both set** (`@upstash/ratelimit@^2.0.8` + peer `@upstash/redis@^1.38.0`, both npm-version-checked + well past the release-age gate → carets; pulled via **lazy `import()` gated on the env**, so the deps never load/construct when unconfigured — same posture as `lib/stripe.ts`/`lib/search.ts`). Applied at the three surfaces the plan names: the **Stripe webhook** (`app/api/stripe/webhook/route.ts`, keyed by client IP, **100/min**, HTTP **429** + `Retry-After`, checked **before** the signature/config work so a flood can't burn CPU on crypto), one **sample Server Action** (`createCheckoutSession`, keyed by `session.user.id`, **5/min**, returns a typed `{ error }` since a Server Action can't set a 429 status, checked before the Stripe-config gate so it's exercisable without keys), and **tRPC** via a new **`rateLimitedProcedure`** middleware (`server/trpc/trpc.ts`, keyed by `trpc:${path}:${ip}`, **20/min**, throws `TRPCError TOO_MANY_REQUESTS` → HTTP **429**) applied to `user.health`. **This is the BROADER app-level limiter — Step 19's Better Auth limiter still owns `/api/auth/*`; no duplication.** Two new optional env vars (`UPSTASH_REDIS_REST_URL` url + `UPSTASH_REDIS_REST_TOKEN` string) in `env.ts` (the exact names `Redis.fromEnv()` reads). **No CSP / SECURITY.md allowlist change** — the Upstash REST calls are server-to-server (`server-only`), never browser fetches, so the CSP (which governs only browser content sources) is untouched. **Failure mode: fail-open** (a transient Redis blip allows + logs rather than locking everyone out; one-line flip to fail-closed is documented). Docs: a new "Rate limiting (app-level)" section in SECURITY.md (utility API, per-surface limits table, in-memory-vs-Upstash storage, the no-CSP rationale, fail-open + multi-instance caveats) + a `rateLimitedProcedure`/action note in API.md; CLAUDE.md resume pointer advanced to Step 21. **No new `allowBuilds`** — the Upstash packages have no native postinstall (install printed the supply-chain pass with no ignored builds). **Fully verified on this machine with Upstash env UNSET (the in-memory path):** full gate green — lint (111 files), type-check, build (still prerenders `/` + every demo as `○`, so the limiter did NOT force dynamic rendering); **live against a fresh prod build on `:3100`** (a prior `next dev` holds `:3000`): tRPC `user.health` → **20×200 then 429** with body `{code:"TOO_MANY_REQUESTS", httpStatus:429, path:"user.health"}`; webhook flood → **100×503** (each passed the limiter, then hit the Stripe-unconfigured gate) **then 429 with `Retry-After: 40`** — proving the limit runs **before** the config gate; **window reset confirmed** (a fresh call after the 60s window → back to 200 / 503). **The Upstash distributed path is built/type-checked but its live round-trip is UNVERIFIED (no Upstash creds on this machine), consistent with the Stripe/Resend/Sentry steps;** the in-memory default IS live-verified, which is the graceful-degradation posture. **The Server Action's limit is the same proven `rateLimit()` call** wired in + build/type-checked; a Server Action can't be curled directly (encrypted action id), so it's covered by the shared code path (proven twice over via tRPC + webhook) rather than a separate HTTP probe. ━ Prior: **Step 19 complete (auth hardening, wired to `@repo/email`).** Enabled **email verification** + **password reset** in Better Auth (`packages/auth/src/auth.ts`) and wired both — plus the dangling Step-9 **welcome email** — to `@repo/email`. New templates `verify-email.tsx` + `reset-password.tsx`; a new server-only `@repo/email/send.tsx` centralizes render+send behind `isEmailConfigured()` (`sendVerificationEmail`/`sendPasswordResetEmail`/`sendWelcomeEmail`), and the app's `sendWelcomeEmail` Server Action now delegates to it. Better Auth callbacks: `emailVerification.sendVerificationEmail` (+ `sendOnSignUp:true`, `autoSignInAfterVerification:true`), `emailAndPassword.sendResetPassword`, and **welcome on `afterEmailVerification`** (closes the Step-9 thread; OAuth sign-ups skip it — documented alt is `databaseHooks.user.create.after`). **Graceful-degradation lynchpin:** `requireEmailVerification: isEmailConfigured()` — verification is required ONLY when `RESEND_API_KEY`+`EMAIL_FROM` are set, so the app still fully signs up/in with email UNSET. Also added `trustedOrigins()` (always `BETTER_AUTH_URL` + optional comma-sep `AUTH_TRUSTED_ORIGINS`), a **session `cookieCache`** (5-min signed-cookie cache; `disableCookieCache` for authoritative reads), and an **explicit `rateLimit`** (on in all envs; tight `customRules` for `/sign-in/email` `/sign-up/email` `/request-password-reset` `/reset-password` `/send-verification-email`; in-memory → use secondary storage for multi-instance). **Build caught a real graceful-degradation regression:** `@repo/auth`→`@repo/email` pulls the Resend client into the `/api/auth` route graph, and `new Resend(undefined)` **throws** in resend v6 — so `client.ts` is now a **lazy guarded singleton `getResend()`** (was an eager `export const resend`), matching `lib/stripe.ts`. **No new external dependency** — all built-in Better Auth + existing React Email; only a new workspace edge (`@repo/auth` → `@repo/email`, added to ARCHITECTURE.md import rules). `AUTH_TRUSTED_ORIGINS` added to `env.ts`. **CSP/SECURITY.md unchanged** — `trustedOrigins` gates request origins, not browser content sources, and auth is same-origin. **Fully verified on this machine with email env UNSET:** full gate green (lint 110 files, type-check, build — still prerenders `/` + demos as `○`); `email export` renders `verify-email`/`reset-password` to valid HTML (heading + button + link); **live against a fresh prod build on `:3100`** (a prior `next dev` held `:3000`): sign-up → 200 `emailVerified:false` (verification off, email unset); **password reset round-trips** — `request-password-reset` (relative `redirectTo`) → 200, token read from the `verification` table, `reset-password` → 200, old password → **401**, new password → **200**; **`trustedOrigins` live** — an absolute `:3100` `redirectTo` → **403 `INVALID_REDIRECT_URL`** (server is `:3100`, `BETTER_AUTH_URL` is `:3000`); **rate limit live** — `/sign-in/email` → **429** after the rule's max of 5/window; the server log shows **both** the verification (on sign-up) and reset callbacks fired and **skipped without leaking the token** (production-unconfigured branch). Throwaway `step19-*@example.com` user cascade-deleted; `:3100` server stopped. **Real Resend sends remain unverified (no key), consistent with Steps 9-13** — the welcome-on-verify path is wired/built but needs a verify token (email creds or dev-mode logging) to exercise end-to-end. ━ Prior: **Step 18 complete (HTTP security headers + CSP).** Added security headers to **`apps/web/next.config.ts`** via `async headers()` (applied to every route, `source: "/:path*"`): a **Content-Security-Policy**, **HSTS**, **X-Frame-Options: DENY**, **X-Content-Type-Options: nosniff**, **Referrer-Policy: strict-origin-when-cross-origin**, and a locked-down **Permissions-Policy** (`camera=(), microphone=(), geolocation=(), browsing-topics=()`). **Decision: STATIC (config-level) CSP, not nonce-based** — a nonce needs middleware, which would force dynamic rendering and regress the repo's static-generation posture (the build still prerenders `/` + every demo route as `○`). The cost is `script-src 'self' 'unsafe-inline'` (Next's inline RSC/hydration scripts can't be hash-pinned without a nonce); **the nonce/middleware upgrade path is documented in the new SECURITY.md** at the user's explicit request. **Dev-vs-prod variance** keyed off `process.env.NODE_ENV` (headers() is evaluated at server start, so `next dev` vs `build`/`start` pick the right variant): dev adds `'unsafe-eval'` (script-src) + `ws:` (connect-src) for Turbopack/React-Refresh HMR; prod adds **HSTS** + `upgrade-insecure-requests` and drops both (HSTS over http://localhost would pin the whole machine to https). **CSP allowlists exactly the wired SaaS:** PostHog is same-origin via the `/ingest` proxy (`connect-src 'self'`; `https://*.posthog.com` also listed for toolbar/surveys), **Sentry** `connect-src https://*.sentry.io`, **Uploadthing** `connect-src https://*.uploadthing.com https://*.ingest.uploadthing.com` (+ `img-src https:` for served files), **Stripe** `script-src`/`frame-src https://js.stripe.com` + `frame-src https://hooks.stripe.com` + `connect-src https://api.stripe.com` (pre-allowlisted for a future client SDK — the hosted-checkout redirect is a top-level navigation CSP never restricts). Plus `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`, `worker-src 'self' blob:`. **No new dependency** (pure config + one doc). New **`docs/context/SECURITY.md`** (header table, full CSP directive table, per-SaaS origin rationale, dev/prod variance, the static-vs-nonce tradeoff + concrete upgrade steps, local `curl` verify commands); linked from CLAUDE.md's context-docs table (and CLAUDE.md's resume pointer advanced to Step 19). **Fully verified on this machine:** full gate green — `pnpm lint` (107 files), `pnpm type-check`, `pnpm build` (still prerenders `/` + demos as `○`, proving the static CSP did NOT force dynamic rendering); **live:** `curl -I` on a prod build (`next start` on `:3100`, since a prior `next dev` held `:3000`) shows all six headers with the prod CSP (HSTS + `upgrade-insecure-requests`, no eval), `curl -I` on the running dev `:3000` shows the dev CSP variant (`'unsafe-eval'` + `ws:`, no HSTS); the PostHog `/ingest/static/array.js` proxy still returns **200** (212 KB real PostHog JS) with the CSP on; `/`, `/billing`, `/uploads`, `/observability`, `/search`, `/state` all **200**, unknown path **404**; and a throwaway **Playwright** pass (chromium against `:3100`, deleted after) reported **zero CSP/script violations** on `/`, `/observability`, `/billing`, `/uploads` — proving the CSP doesn't block Next's own inline/bundled scripts. **Stripe/Uploadthing real cross-origin round-trips remain unverified (no keys), consistent with prior steps;** the Stripe redirect is navigation-based and unaffected by CSP regardless. **Next: Step 19 — Auth hardening** (email verification + password reset wired to `@repo/email`, `trustedOrigins`, session cookie cache, documented Better Auth `rateLimit`; see [PHASE_2_PLAN.md](PHASE_2_PLAN.md)). ━ Prior: **Step 17 complete (App Router resilience files).** Added the four App Router boundary files to `apps/web/src/app/` plus a shared UI primitive: **`error.tsx`** (client route-segment boundary; `useEffect` → `Sentry.captureException`; "Try again" `reset()` + "Go home" link; default export renamed **`ErrorBoundary`** because Biome `noShadowRestrictedNames` rejects shadowing the global `Error` — Next only needs *a* default export), **`global-error.tsx`** (catches root-layout errors → ships its own `<html>/<body>`, imports `./globals.css`, Sentry capture, "Reload" via `window.location.reload()`), **`not-found.tsx`** (Server Component; unmatched URLs + `notFound()` → "Page not found" + Go home), and a root **`loading.tsx`** (Suspense-streamed; Tailwind `animate-spin` ring, no dep). New **`@repo/ui` `EmptyState`** primitive (`packages/ui/src/components/empty-state.tsx`) — presentational/provider-free so `global-error` can use it **outside** the provider tree; props `{ icon?, title, description?, action? }`; `data-slot="empty-state"`, matches `card.tsx` shape; all three pages render through it. **Closes a Step-13 hole:** server render errors were already captured via `instrumentation.ts` `onRequestError`, but **client render errors reached no Sentry path** — `error.tsx`/`global-error.tsx` now report them (no-op without a DSN). **Decision: Step 17 stayed dependency-free** — `lucide-react` is named as the shadcn icon default in UI.md but isn't installed; `EmptyState.icon` is an optional `ReactNode` so the primitive carries no icon dep. **Lucide deferred to Step 24** (theme toggle genuinely needs sun/moon icons) under the usual npm version-check. **Verify scaffold:** added a 4th button to the `/observability` demo — "Throw a render error (test boundary)" — which flips state to throw **during render** (handler throws are swallowed by React) so it propagates to `error.tsx`. Clearly scaffold; delete with the rest of the demo routes. **Test:** `packages/ui/src/components/empty-state.test.tsx` (2 cases — heading+description, action node) mirrors `button.test.tsx`'s jsdom convention. **Fully verified on this machine:** full gate green — `pnpm lint` (107 files), `pnpm type-check`, `pnpm build` (now prerenders `/_not-found` ○ from the custom page), `@repo/ui` tests **5/5** (3 button + 2 EmptyState); **live (Playwright/chromium against the running dev server on :3000):** throw button → styled `error.tsx` ("Something went wrong" + Try again + Go home), `reset()` recovers the demo, unknown path → **HTTP 404** + custom "Page not found". Sentry capture runs in `useEffect` (exercised; no-op, no DSN on this machine). Aside: needed `pnpm exec playwright install chromium` (browser bumped to v1228); the throwaway verify script ran from `apps/web` then was deleted. **`global-error.tsx` is unverified live** (only triggers on a root-layout crash — documented, not forced). **Next: Step 18 — HTTP security headers + CSP** (see [PHASE_2_PLAN.md](PHASE_2_PLAN.md); present detailed plan → wait for sign-off → build). ━ Prior: Step 16 complete (Documentation finalize + markdown normalization) — **the FINAL Phase-1 step. Docs-only; no app code changed; full gate green (lint/type-check/build all FULL-TURBO cache hits, i.e. nothing in `apps/`/`packages/` was touched).** **Markdown lint:** added **`.markdownlint.jsonc`** tuned to the repo's actual style — it disables exactly the **six** rules the docs intentionally trip (**MD013** line-length, **MD049** emphasis-style `*`/`**`, **MD022** blanks-around-headings, **MD031** blanks-around-fences, **MD032** blanks-around-lists, **MD040** fence-language), leaving every other rule at its default for future docs. Result: **0 markdownlint errors across all 14 markdown files** with **zero prose churn** (the decision was "config to match style," not reflow). It's **editor-only** — Biome doesn't lint markdown, so `pnpm lint`/CI are unaffected; the file is JSONC so `biome check` *does* format it (ran `biome check --write` → single-space-before-comment fix), and it passes `pnpm lint` (101 files). **README refresh:** the stale status line ("Steps 1–7 of 16 complete") → **all 16 steps done**; folded the now-built services (Resend/Stripe/Sentry+BetterStack+PostHog/Uploadthing/Meilisearch/Docker) out of the "Planned (later steps)" note into the stack table; added `packages/email/` to the layout and `STATE.md` to the docs list. **Context-docs accuracy audit:** read all 11 `docs/context/*` end-to-end — confirmed current (prior sessions kept them reconciled); **one drift fixed** — ARCHITECTURE.md described `stores/` as a future-tense "placeholder; populated in Step 8" → now "client UI state, e.g. ui-store.ts (see STATE.md)". **Demo-scaffold inventory:** added a consolidated **"Demo / scaffold routes (delete these)"** table to ARCHITECTURE.md listing all six public demo routes (`/profile` 7, `/state` 8, `/billing`(+`/success`) 10, `/uploads` 11, `/search` 12, `/observability` 13) by step + what each demonstrates, and noting the root `/` is the real landing page (not scaffold, and the Playwright smoke target). **CLAUDE.md:** `docker/` structure line precision fix (`prod Dockerfile + docker-compose (dev + prod)` — there are two compose files). Throwaway local test data (`forms-demo@example.com`) and `.gitkeep` placeholders left as-is (harmless, documented). ━ Prior: impl `ed612a2` — Step 15 complete (Docker prod Dockerfile + Deployment). **Production image builds + runs; standalone output is now opt-in.** `docker/Dockerfile` is multi-stage on `node:24-alpine` (corepack-pinned pnpm 11.7.0 + `libc6-compat`): **base** → **deps** (`pnpm fetch` lockfile-only, then `pnpm install --frozen-lockfile --offline`) → **builder** (`pnpm build` with `SKIP_ENV_VALIDATION=1` + `NEXT_TELEMETRY_DISABLED=1` + **`BUILD_STANDALONE=1`**) → **runner** (non-root `nextjs` uid 1001; copies `.next/standalone` → `/app`, `.next/static` → `apps/web/.next/static`, `public` → `apps/web/public`; `CMD ["node","apps/web/server.js"]`, `PORT`/`HOSTNAME=0.0.0.0`, `EXPOSE 3000`). Build from repo root: `docker build -f docker/Dockerfile -t nwb-web .`. **Two design fixes shipped with this step:** (1) **Standalone output is now opt-in via `BUILD_STANDALONE`** — `next.config.ts` only sets `output:"standalone"` + `outputFileTracingRoot`(=repo root) when that env is set, which **only the Docker build does**. Reason: standalone file-tracing recreates the pnpm symlink farm with `fs.symlink`, which fails **`EPERM` on Windows** without admin/Developer Mode (reproduced: local `pnpm build` failed at "Finalizing page optimization" on `@swc/helpers`/`@opentelemetry/api` symlinks — **with or without** `outputFileTracingRoot`, so it's the standalone copier, not the root). Gating it keeps local + CI `next build` cross-platform and lets `next start` (the Playwright E2E lane) avoid the "does not work with output: standalone" warning. Standalone is consumed **only** by the Docker image (Vercel/`next start` don't need it). (2) **Turbo strict-env passthrough** — `turbo.json` gained `globalPassThroughEnv` (`SKIP_ENV_VALIDATION`, `BUILD_STANDALONE`, `NEXT_TELEMETRY_DISABLED`, `CI`, `PORT`, `HOSTNAME`) + a `build`-task `env` list (the app's validated server vars + `NEXT_PUBLIC_*`). Turborepo 2.x defaults to **strict** env mode and was **filtering `SKIP_ENV_VALIDATION` out before `next build`** → the first Docker build failed exactly like a missing-secret build (`DATABASE_URL`/`BETTER_AUTH_SECRET` invalid). This was also a **latent CI bug**: the `verify` job's `SKIP_ENV_VALIDATION` and the `e2e` job's ambient `DATABASE_URL`/`BETTER_AUTH_SECRET` were being stripped too — it only ever worked locally because `dotenv-cli` feeds the root `.env` to `next build` directly, bypassing turbo. Also added: **`.dockerignore`** (excludes node_modules/`.next`/`.turbo`/`.git`/`.env`/tests/docs), **`apps/web/public/.gitkeep`** (so the runner `COPY public` is valid — no public dir existed), **`.vs/` gitignored** (Visual Studio workspace-state JSON was tripping `biome check .`). **`docker/docker-compose.prod.yml`** runs the built image + Postgres (`nwb-postgres-prod`) + Meilisearch (`nwb-meilisearch-prod`) on one network: `web` builds from the Dockerfile (`SKIP_ENV_VALIDATION=1` build arg), `env_file: ../.env`, with service-internal `DATABASE_URL`(`@postgres`)/`MEILISEARCH_HOST`(`http://meilisearch:7700`) overriding the file's localhost values; publishes `:3000`. **Migrations: documented, run OUTSIDE the image** (runtime image has no `drizzle-kit`) — `pnpm --filter @repo/db db:migrate` from CI/one-off, as the `e2e` job already does. **Fully verified on this machine:** local `pnpm lint`+`type-check`+`build` green with standalone OFF (Windows-safe); `docker build` green (multi-stage, **294 MB**); `docker run` → `/`,`/search`,`/observability` all **200**, container `id` = `nextjs` uid 1001 (non-root), a hashed `/_next/static/*.js` asset **200** (validates the static copy), standalone server logs "✓ Ready"; `docker compose -f docker/docker-compose.prod.yml config` valid. DEPLOYMENT.md reconciled to all of the above. ━ Prior: impl `3b193ea` — Step 14 complete (Testing — Vitest + Playwright + CI). **Scaffold + example, monorepo-wide.** **Vitest 4.x** runs **per package**, orchestrated by `turbo test` (each test-bearing package owns a `vitest.config.ts` + `"test": "vitest run"`; root `pnpm test` fans out): `@repo/validators` uses the **node** env (`src/index.test.ts`, the `updateNameSchema` schema), `@repo/ui` uses **jsdom** (`src/components/button.test.tsx`, renders the `Button`; `@testing-library/react` + a `src/test/setup.ts` that imports `@testing-library/jest-dom/vitest`; a `@repo/ui`→`./src` resolve alias for the package's own subpath imports). **Vitest 4 uses its built-in oxc transformer** — the automatic JSX runtime works with **no `@vitejs/plugin-react`** (a leftover `esbuild.jsx` option is ignored with a warning, so it was removed). `apps/web` has **no Vitest project** (its modules import `@/env`, which validates at import) — it owns the **Playwright** E2E instead (`apps/web/e2e/*.spec.ts`; `playwright.config.ts` `webServer` boots the prod build via `pnpm start` on :3000; one DB-free `home.spec.ts` landing smoke). Convention: **Vitest = `*.test.*`, Playwright = `*.spec.*`**. **CI** (`.github/workflows/ci.yml`, two jobs): **`verify`** on every PR/push (`install --frozen-lockfile` → `type-check` → `lint` → `test` → `build` with **`SKIP_ENV_VALIDATION: "1"`**, no secrets); **`e2e`** on push to `main` only (`postgres:16` service + throwaway `DATABASE_URL`/`BETTER_AUTH_SECRET` → `db:migrate` → `playwright install --with-deps chromium` → `test:e2e`, report uploaded). **`env.ts` now honors `SKIP_ENV_VALIDATION`** (`skipValidation: !!process.env.SKIP_ENV_VALIDATION`) — the documented flag was previously a no-op. **Deps (npm-verified 2026-06-23):** `vitest`/`@vitest/coverage-v8` `^4.1.9`, `@playwright/test` `^1.61.0`, `jsdom` `^29.1.1`, `@testing-library/react` `^16.3.2` + `/dom` `^10.4.1` (required peer) + `/jest-dom` `^6.9.1` (all aged → carets). **`vite` pinned `8.0.16` via `pnpm-workspace.yaml` `overrides`** — it's vitest's transitive dep and `latest` `8.1.0` was published hours earlier; `@vitejs/plugin-react` (`6.0.3`, also hours-old) was **not installed**. No new `allowBuilds` (Playwright has no npm postinstall — browsers install via the CLI). **Fully verified on this machine:** install clean (supply-chain policy passed, no ignored builds); `pnpm test` 6/6 (validators node + ui jsdom); `type-check` + `lint` + `build` green; CI-build sim (`next build` with no env file + `SKIP_ENV_VALIDATION=1`) green; `pnpm test:e2e` 1/1 (chromium home smoke); `--coverage` (v8) prints a report. ━ Prior: impl `88d35fa` — Step 13 complete (Observability — Sentry + BetterStack + PostHog). **Scaffold + example, app-local, graceful when unconfigured** — `pnpm lint`+`type-check`+`build` all pass with every observability env var UNSET. **Sentry** (`@sentry/nextjs` `10.59.0`, exact-pinned): the v10 instrumentation pattern (`src/instrumentation.ts` `register()`+`onRequestError`; `src/instrumentation-client.ts` browser init + `onRouterTransitionStart`; `src/sentry.{server,edge}.config.ts`), `next.config.ts` wrapped with `withSentryConfig` (org/project/authToken only when present). `Sentry.init({ dsn, enabled: Boolean(dsn) })` → no-op without a DSN, so no guarded singleton needed. **BetterStack** (`@logtail/next` `^0.3.1`): structured `log` used in `server/actions/observability.ts` (`logExampleEvent`), console fallback when unset; reads **`BETTER_STACK_SOURCE_TOKEN` + `BETTER_STACK_INGESTING_URL`** (verified against the installed source — **not** `BETTERSTACK_API_KEY` as the old docs claimed). **PostHog** (`posthog-js` `1.391.2` + `posthog-node` `5.38.2`, exact-pinned): `apps/web/src/lib/posthog.ts` server-only lazy guarded singleton (`getPostHogServer`/`isPostHogConfigured`, same posture as `lib/stripe.ts`/`lib/search.ts`) for server-side feature-flag checks; client `PostHogProvider` (`components/observability/posthog-provider.tsx`) mounted in the root layout as the 2nd client provider (children passthrough → RSC boundary unchanged; no-op without a key); same-origin `/ingest` reverse-proxy rewrite in `next.config.ts`. Public `/observability` demo (error capture + structured-log action + analytics event + server flag). All env **optional**; `NEXT_PUBLIC_*` also in `experimental__runtimeEnv`. `pnpm-workspace.yaml` `allowBuilds`: **`@sentry/cli: false`** (source-map upload binary; flip to true in CI) + **`core-js: false`** (funding-banner postinstall via posthog-js). **Verified on this machine:** the full gate with creds unset, plus live — `/observability` → 200 with the server flag degrading to "unconfigured" without throwing, and the `/ingest` proxy forwarding `/ingest/static/array.js` → real PostHog JS (200, 212 KB). Real SaaS ingestion to the three dashboards is **UNVERIFIED** (no keys on this machine), documented like the Stripe/Resend/Uploadthing steps. ━ Prior: impl `14d394f` — Step 12 complete (Search — Meilisearch): server-only lazy guarded singleton (`apps/web/src/lib/search.ts`, `getSearchClient`/`isSearchConfigured`) mirroring `lib/stripe.ts` — keeps the `meilisearch` dep out of `@repo/db`. Read/write split per API.md: searching = a **public tRPC query** (`server/trpc/routers/search.ts`, returns `{ configured, hits }`, degrades to empty hits when unconfigured or the index is missing); indexing = an **auth-gated Server Action** (`server/actions/search.ts`, `addDocuments().waitTask()`). Public `/search` demo (search box + "Index sample documents" button). `getmeili/meilisearch:v1.48.1` added to docker-compose (`nwb-meilisearch`, dev `MEILI_MASTER_KEY`). `MEILISEARCH_HOST`/`MEILISEARCH_API_KEY` optional. Dep `meilisearch@^0.58.0` (caret — dependency-free, no native build, past the release-age gate; client class is `Meilisearch`, not the old `MeiliSearch`). **Fully verified on this machine:** lint + type-check + build with search env unset, plus a live round-trip against the container (indexed 5 docs; exact + typo-tolerant search returned correct hits) and the real app read path (live tRPC `search.search` → seeded hits; `/search` renders 200)._

---

## Per-step notes / carry-overs (Steps 25 → 1)

### Step 25 notes / carry-overs

- **husky + lint-staged, both root devDeps only.** Pure-JS, no native postinstall, so the
  `pnpm install` supply-chain check passed with **no new ignored builds** — no
  `pnpm-workspace.yaml` `allowBuilds` change. husky is `^9.1.7` (caret; >1.5 yr aged).
  lint-staged is **exact-pinned `17.0.7`** (the latest `17.0.8` was only 4 days old and trips
  the release-age gate; lint-staged publishes frequently, so it gets the exact-pin treatment
  like `stripe`/`@sentry/nextjs`/`lucide-react`). Bump once newer releases age out.
- **`prepare: husky` is safe with no `.git` — confirmed, no `|| true` guard.** Ran the husky
  binary from a dir with no `.git`: it prints "`.git can't be found`" and **exits 0**. So the
  Docker build (`.dockerignore` excludes `.git`; the `deps` stage runs `pnpm install` after
  `COPY . .`) and CI installs run `prepare` without breaking. If a future husky major changes
  this, add `husky || true`.
- **Only three hook files are tracked.** husky generates `.husky/_/` (wrappers + a `*`
  `.gitignore`) on install; that dir is git-ignored. The committed hooks are
  `.husky/{pre-commit,commit-msg,pre-push}` — verified `git check-ignore` skips `.husky/_`.
- **type-check runs at pre-push, not pre-commit — deliberate.** The repo's `type-check` is a
  project-wide turbo task (`dependsOn ^build`; types cross package boundaries), so a per-file
  `tsc` would be unsound. It's the heavier gate, so it sits at the less-frequent push boundary;
  pre-commit stays fast by running Biome on staged files only. Turbo caches type-check, so a
  push with unchanged types is near-instant.
- **The `commit-msg` hook is a deliberate non-enforcer.** Dependency-free POSIX sh; rejects
  only empty / `<10`-char / leftover `fixup!`/`squash!` subjects. The `min_subject_length` is a
  variable at the top of `.husky/commit-msg` — raise/lower or delete the `fixup!` `case` to
  taste. It is **not** Conventional-Commits (the repo's own history is mixed-style on purpose).
- **Biome (`ignoreUnknown: false`) does not choke on the extensionless hook scripts** — `pnpm
  lint` reports 129 files clean with `.husky/{pre-commit,commit-msg,pre-push}` present. (The
  pre-commit lint-staged glob also doesn't match them, so they're never re-formatted.)
- **Markdown is intentionally outside the hooks** — Biome doesn't lint Markdown and markdownlint
  stays editor-only (Step 16), so the pre-commit glob is `*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,json,jsonc,css}` only.
- **Live verification used a throwaway scratch branch + a local bare remote**, both deleted
  afterward (the bare repo lived in the scratchpad). Push-blocking can't be exercised against
  `origin`, so a bare remote was the clean way to prove `pre-push`. All five tests
  (T1–T5) passed; the working tree was left containing only the real Step-25 changes.
- **CI is unchanged.** The hooks are a *local* fast gate; CI still runs the full `pnpm lint`/
  `type-check`/`test`/`build`. husky installs hooks in CI too (harmless — CI never commits), so
  no `HUSKY=0` skip was added. Step 26 (dependency/security automation) is where CI grows.

### Step 24 notes / carry-overs

- **`next-themes` owns the theme, not a Zustand store** — by the STATE.md rule the active
  theme is ephemeral client state (each tab can differ, never hits the DB), which would
  default to a store. It deliberately doesn't: a persisted theme hits the exact SSR
  hydration-flash problem the `persist` note warns about, and next-themes already solves it
  with a pre-paint inline script. Documented as the one client-preference exception in both
  UI.md and STATE.md.
- **The toggle never reads `theme` at render** — the trigger renders *both* Sun and Moon and
  swaps them with the `dark:` CSS variant, so the server HTML and first client paint are
  identical (no hydration mismatch). Only `setTheme(...)` is called. If you build a toggle
  that branches on the current theme value, gate it behind a `mounted` flag (next-themes'
  documented pattern) or you'll reintroduce a mismatch.
- **`suppressHydrationWarning` on `<html>` is load-bearing, not cosmetic** — the server
  renders `<html>` with no theme class; next-themes' pre-paint script adds `class="light|dark"`
  + `style="color-scheme"` before React hydrates. The flag scopes the suppression to that one
  element. Removing it brings back a console hydration warning on every load.
- **No CSP change was needed (SECURITY.md untouched).** next-themes' pre-paint script is
  **inline**, already allowed by the Step-18 static CSP (`script-src 'self' 'unsafe-inline'`).
  **Live-proven** on the strict prod build (`:3100`): toggle + persist worked with **0 CSP
  violations**, and the inline script is confirmed in the prod `<head>`. If a future step
  migrates to a nonce-based CSP, pass the nonce to next-themes via its `nonce` prop (noted in
  UI.md) — the inline script would otherwise be blocked.
- **`lucide-react` is exact-pinned (`1.18.0`), not caret.** Lucide publishes near-daily; the
  latest `1.21.0` was 6 days old at build time, so a caret would re-resolve to it. The exact
  pin holds an aged release (matches the `stripe`/`posthog-js`/`@sentry/nextjs` posture). Bump
  deliberately as newer releases age out. `next-themes@^0.4.6` is a caret (>1yr aged, stable).
- **Both new deps live in `@repo/ui` only**, not `apps/web` — the toggle is the only icon
  consumer and it lives in `@repo/ui`; the app imports `ThemeToggle`/`ThemeProvider`, never an
  icon directly. The `dropdown-menu` primitive uses the **already-present** unified `radix-ui`
  dep, so it added **no** new npm dependency. **No `allowBuilds`/lockfile-policy change.**
- **The client `ThemeProvider` did NOT regress static generation.** It's the outermost of
  three root providers but renders `children` straight through (no dynamic API), so the build
  still prerenders `/`, every static demo, and all 7 SEO routes as `○`. If it had widened the
  RSC boundary or forced dynamic rendering, those would have flipped to `ƒ`.
- **The full `dropdown-menu.tsx` was shipped** (not just the 4 parts the toggle uses) so it's a
  reusable shadcn primitive for later steps — Group/CheckboxItem/RadioItem/Label/Separator/
  Shortcut/Sub*, all standard. Unused-in-repo exports are public API, not lint errors.
- **Live test reused the running `:3000` dev server** (hot-reloaded the new files; dev is where
  React emits hydration warnings) for the toggle/persist/no-warning check, and a fresh prod
  build on `:3100` for the strict-CSP check; `:3100` was stopped after, the throwaway
  `theme-check.mjs`/`theme-bg.mjs` removed, and `:3000` left running (the standing carry-over).
- **Not committed at write time.** Per the working agreement: impl commit
  (`@repo/ui/{package.json,components/{dropdown-menu,theme-provider,theme-toggle}.tsx,
  components/theme-toggle.test.tsx,test/setup.ts}` + `apps/web/src/app/{layout,page}.tsx` +
  `pnpm-lock.yaml` + UI.md + STATE.md + CLAUDE.md) then a separate
  `docs: checkpoint PROJECT_STATUS` commit (this file + `PHASE_2_PLAN.md`), then push.

### Step 23 notes / carry-overs

- **`lib/site.ts` is the single source of truth** for the public origin + brand strings, so
  `layout.tsx`, the metadata routes (robots/sitemap/manifest), and the OG/icon images all
  read one place. It's `server-only` (every consumer is a server context: the root layout, the
  metadata route handlers, the `next/og` image routes).
- **metadataBase reuses `BETTER_AUTH_URL`, not a new `NEXT_PUBLIC_APP_URL`** — it's already the
  validated canonical public origin and metadata renders server-side. The **`?? "http://localhost:3000"`
  fallback is load-bearing**: under `SKIP_ENV_VALIDATION` (CI **and** the Docker image build)
  `@t3-oss/env` returns raw `process.env` *without* applying the schema's `.default()`, so
  `env.BETTER_AUTH_URL` can be `undefined` and `new URL(undefined)` throws at build. The fallback
  keeps those builds green. **`metadataBase` + the sitemap bake into the static output at build
  time**, so set `BETTER_AUTH_URL` at build time for correct absolute production URLs (local
  `pnpm build` gets it from the real `.env` via dotenv-cli; Docker/CI need it passed explicitly).
  TS types `BETTER_AUTH_URL` as `string` (it has a `.default`), so the `??` looks redundant but
  isn't at runtime under skip-validation — hence the comment in `lib/site.ts`.
- **Icons + OG image are generated via `next/og` `ImageResponse`, not static binary files** —
  dependency-free (built into Next), cross-platform (no font file or PNG blob to ship, no native
  tooling), and the pattern a boilerplate should demonstrate. Real projects drop in a brand
  `favicon.ico` / artwork (+ maskable 192/512 PWA icons) — noted in the file comments. The OG card
  uses next/og's built-in default font (no `fetch`/font-loading), so it's deterministic on Windows.
- **`twitter-image.tsx` re-exports `opengraph-image.tsx`** (`export { alt, contentType, default, size }`).
  Next's file convention emits `og:image` and `twitter:image` from **separate** files and does
  **not** derive the Twitter image from the OpenGraph one — the re-export serves the same design at
  `/twitter-image` and wires the `twitter:image:*` tags with zero JSX duplication. (Biome's
  `organizeImports` sorts the re-export names alphabetically — `default` sorts as a keyword among
  them; the first lint run flagged it, fixed in place.)
- **The metadata object does NOT repeat the manifest/icon/OG `<link>`/`<meta>` tags** — the file
  conventions (`manifest.ts`, `icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`) inject those
  automatically. `layout.tsx` only sets `metadataBase`, the title template, `applicationName`,
  `openGraph`, and `twitter`. Setting `metadata.icons`/`metadata.manifest` too would duplicate.
- **The sitemap lists only `/`** by design. The demo routes (`/profile`,`/state`,`/billing`,
  `/uploads`,`/search`,`/observability`,`/admin`) are throwaway scaffold (ARCHITECTURE.md "Demo /
  scaffold routes"), so the sitemap deliberately doesn't advertise them; `sitemap.ts` carries a
  commented example for adding real routes as they land.
- **No CSP change was needed (SECURITY.md untouched).** The manifest + icons are same-origin —
  the webmanifest is covered by `default-src 'self'` (there's no `manifest-src` directive, so it
  falls back to default-src), and the icons by `img-src 'self'`. OG/Twitter images are fetched by
  crawlers **server-side**, never by the browser, so no browser CSP applies. **Live-proven** on the
  strict prod CSP (`:3100`): Playwright reported **0 violations** on `/`, and an in-browser exercise
  loaded `/icon` + `/apple-icon` as `<img>` and `fetch`ed `/manifest.webmanifest` (200) with no block.
- **`/profile` shows `ƒ` (dynamic) in the build — that's pre-existing, not a Step-23 regression.**
  It awaits `headers()` + `auth.api.getSession`, which opts it into dynamic rendering. The shared
  `layout.tsx` change did **not** force dynamic rendering: every genuinely-static route (`/`, the
  static demos, `/_not-found`, and all 7 SEO routes) still prerenders `○`. If the layout edit had
  regressed, those would have flipped to `ƒ` too.
- **No dependency, no env var, no `allowBuilds`/lockfile change.** `next/og` ships with Next; nothing
  to version-check. `lucide-react` is **still not installed** (deferred to Step 24's theme toggle).
- **Live test reused the running `:3000` dev server** for the serve/head-tag curls (it hot-reloaded
  the new files) and a fresh prod build on `:3100` for the strict-CSP Playwright check; `:3100` was
  stopped after, the throwaway `apps/web/csp-check.mjs` removed, and `:3000` left running (the
  standing carry-over).
- **Not committed at write time.** Per the working agreement: impl commit (`lib/site.ts` +
  `app/{robots.ts,sitemap.ts,manifest.ts,opengraph-image.tsx,twitter-image.tsx,icon.tsx,apple-icon.tsx}`
  + `layout.tsx` + ARCHITECTURE.md + CLAUDE.md) then a separate `docs: checkpoint PROJECT_STATUS`
  commit (this file + `PHASE_2_PLAN.md`), then push.

### Step 22 notes / carry-overs

- **Health is a Route Handler at `/api/health`, deliberately not a tRPC procedure.** Probes
  (Docker `HEALTHCHECK`, LB/PaaS gates) speak plain HTTP and act on the status code — a Route
  Handler returns a bare `Response` with **200/503**. tRPC resolves successful calls as 200 and
  wraps failures in a JSON-RPC envelope (a `TRPCError` maps to 500, never a clean 503), and would
  drag in superjson/context the probe shouldn't need. Confirmed in the build: `/api/health` is `ƒ`.
- **`runtime="nodejs"` + `dynamic="force-dynamic"` are both load-bearing.** node-postgres isn't
  Edge-safe (runtime), and force-dynamic stops any prerender so the DB ping runs at request time,
  not build time. The build stays green with the DB down because `@repo/db`'s pg `Pool` connects
  lazily and the module never throws at import — the ping lives only inside `GET`.
- **The `SELECT 1` is raced against a 2.5s timeout.** A partitioned/hung DB returns 503 fast
  instead of holding the probe open. Two correctness details: the losing `db.execute` promise is
  `.catch`-swallowed (so a late rejection isn't an unhandled rejection), and the timer is
  `clearTimeout`'d in a `finally` when the ping wins.
- **One endpoint, both signals; HTTP status = readiness.** Body always carries liveness
  (`uptime`/`timestamp`) + the readiness `checks.database`. A strict k8s split (liveness shouldn't
  depend on the DB) is a documented one-liner: add `?check=live` → 200 whenever the process is up,
  point `livenessProbe` at it, leave `readinessProbe` on the default. Not built now — YAGNI for the
  Docker/PaaS story this step serves.
- **Docker probe uses `node -e "fetch(...)"`, not curl/wget.** The `node:24-alpine` runtime ships
  no `curl`, and busybox `wget --spider` sends a **HEAD** the GET-only route would **405**. node is
  always present and Node 24 has global `fetch`; the probe checks `r.ok` and exits 0/1.
  `--start-period=40s` covers Next's cold boot. **Live-proven:** `docker run` (DATABASE_URL → host
  Postgres) → container `healthy`, in-container probe `exit=0`.
- **`docker-compose.yml` (dev) intentionally has NO web healthcheck** — it runs only Postgres +
  Meilisearch; local dev runs `pnpm dev` on the host, so there's no app container to probe. Adding a
  `web` service there would change the dev workflow. The Dockerfile HEALTHCHECK + the explicit one on
  `docker-compose.prod.yml`'s `web` cover every place the app actually runs in a container. (This was
  the flagged decision; the user said "do what you recommend + document it" — reasoning is in
  DEPLOYMENT.md's health section.)
- **Telemetry is GLOBAL, not opt-in.** A `timingMiddleware` wraps a new `baseProcedure`, and every
  procedure derives from it (`publicProcedure = baseProcedure`; `protectedProcedure` /
  `rateLimitedProcedure` build on it; `adminProcedure` builds on `protectedProcedure`). Because it's
  outermost it also logs the UNAUTHORIZED/FORBIDDEN/TOO_MANY_REQUESTS rejections the inner middlewares
  throw — no router can forget to opt in. This is the create-t3-app convention.
- **Sentry only sees `INTERNAL_SERVER_ERROR`.** Expected client errors are normal traffic, not
  exceptions — sending them to Sentry would be alert noise. They go to BetterStack as `warn`. Note:
  this middleware is the **only** path tRPC faults reach Sentry, because tRPC catches errors
  internally and formats them into the response, so `instrumentation.ts`'s `onRequestError` never
  observes them. The 500 branch is wired + type-checked but **a live 500 wasn't force-triggered** (no
  DSN; the `warn`/`UNAUTHORIZED` path live-proves the classification logic).
- **Flush policy: success batches, errors flush.** `log.info` on success without an `await
  log.flush()` (no BetterStack round-trip on the hot path); the error branch flushes so faults aren't
  lost on serverless teardown. For guaranteed delivery of *all* logs on serverless, wrap in
  `waitUntil` or use a platform log drain (documented in DEPLOYMENT.md). The console-fallback path
  (BetterStack unset) prints immediately regardless of flush — verified (the two `user.health` `info`
  lines appeared with no flush).
- **No dependency, no env var.** Reuses `@repo/db`, the existing `@logtail/next` `log`, `@sentry/nextjs`,
  and the existing BetterStack/Sentry env — so nothing to version-check, no `allowBuilds`/lockfile
  change, cross-platform safe.
- **Live test reused the running `:3000` dev server for the 200/503/recover cycle** (it hot-reloaded
  the new route) and a fresh prod build on `:3100` for the tRPC console-log capture (a prior `next dev`
  holds `:3000` — the standing carry-over). The `:3100` server was stopped after; the throwaway
  `nwb-health-test` container + `nwb-web` image were removed; `:3000` left running.
- **Not committed at write time.** Per the working agreement: impl commit (`app/api/health/route.ts` +
  `server/trpc/trpc.ts` + `docker/Dockerfile` + `docker/docker-compose.prod.yml` + `DEPLOYMENT.md` +
  `CLAUDE.md`) then a separate `docs: checkpoint PROJECT_STATUS` commit (this file + `PHASE_2_PLAN.md`),
  then push.

### Step 21 notes / carry-overs

- **Minimal hand-rolled RBAC, not the Better Auth `admin()` plugin.** The plugin bundles
  ban/impersonation/access-control + extra schema fields + a client plugin + public admin
  endpoints — well past the AUTH.md promise (role + adminProcedure + role-aware action + page
  guard). We shipped the smaller surface with **no new dependency**; `admin()` stays the
  documented upgrade path (AUTH.md "Available Auth Plugins").
- **`role` is plain `text` (typed `Role`), not a `pgEnum`** — `NOT NULL DEFAULT 'user'`. Adding
  a role later is a one-line edit, no `ALTER TYPE`. Canonical `ROLES`/`Role` live in
  `packages/db/src/schema/auth.ts` (the import-pure `@repo/db`); `@repo/validators` duplicates the
  literal in a `z.enum` (`setUserRoleSchema`) with a sync comment because it **can't import db**
  (ARCHITECTURE import rule: `packages/db` has no `@repo/*` imports).
- **Authoritative role read = DB, never the session.** `lib/rbac.ts` `getUserRole()` reads
  `user.role` fresh; the (Step-19 cookie-cached, up to 5 min stale) session is trusted only for
  *identity*. **Live-proven:** an admin's pre-promotion cookie immediately passed `adminProcedure`
  after an SQL promotion — no 5-min wait.
- **`role` is deliberately NOT in Better Auth `additionalFields`.** That keeps every auth API
  surface unable to read/write it, so the only writers are direct DB access (manual SQL / the
  Step-28 `db:seed`) and the admin-gated `setUserRole` action — i.e. **roles are never
  self-service**, and `packages/auth` needed no change at all.
- **Three guard layers, one helper:** tRPC `adminProcedure` (→ `FORBIDDEN`), `requireAdmin()` for
  Server Actions (→ typed `{error}`), and the `/admin` Server Component (→ `notFound()`); all
  funnel through `getUserRole`. The `proxy.ts` gate for `/admin` is **optimistic cookie-only** (no
  role at the edge) — authorization is *always* the DB-backed check, never the proxy.
- **`/admin` page status nuance (documented, not a bug):** a non-admin gets the custom not-found
  page with **no data leak** (the `db.findMany` runs only after `requireAdmin()` passes — the
  `notFound()` throw short-circuits it), but the streamed HTTP status is **200**, not 404:
  programmatic `notFound()` can't change the already-flushed shell status under the root
  `loading.tsx` Suspense boundary. The hard-status guards are the tRPC layer (**401/403**). For a
  hard 404/redirect on the page, move the guard above the streaming boundary — `redirect()` under
  streaming becomes a soft client redirect *and* reveals existence, which is why `notFound()` was
  chosen.
- **Promotion is manual SQL for the FIRST admin:** `UPDATE "user" SET role='admin' WHERE
  email='you@example.com';` (a `db:seed` helper lands in Step 28). Subsequent admins via the
  `setUserRole` action. Default is always `user`.
- **No login/dashboard/admin UI still** (auth is API-only via `[...all]`), so live RBAC ran against
  the Better Auth HTTP API + tRPC with curl cookie jars (like Steps 4/19/20). Throwaway
  `step21-*@example.com` users were cascade-deleted; the `:3100` prod server (a prior `next dev`
  holds `:3000`, the standing carry-over) was stopped after.
- **No new `allowBuilds` / lockfile change** — no dependency added, so nothing to version-check.
- **Not committed at write time.** Per the working agreement: impl commit (schema + migration +
  `trpc.ts`/`routers/admin.ts`/`root.ts` + `lib/rbac.ts` + `actions/admin.ts` + validators (+ test)
  + `app/admin/page.tsx` + `proxy.ts` + AUTH/API/ARCHITECTURE + CLAUDE.md) then a separate
  `docs: checkpoint PROJECT_STATUS` commit (this file + `PHASE_2_PLAN.md`), then push.

### Step 20 notes / carry-overs

- **Standalone utility, not "reuse Better Auth."** Better Auth's limiter is internal to its
  request handler — there's no exported `checkRateLimit()` to call from a webhook / action /
  tRPC procedure. So Step 20 is a standalone `lib/rate-limit.ts` that *mirrors* Better Auth's
  posture (window/max, in-memory default, graceful degradation) for the non-auth surfaces. It
  does **not** touch `/api/auth/*` — Step 19's Better Auth `rateLimit` still owns those. Two
  layers, no overlap.
- **Lives app-local at `apps/web/src/lib/rate-limit.ts`** (like `lib/stripe.ts`/`lib/search.ts`)
  because all three consumers are in `apps/web` and `packages/*` can't import app code. Public
  API: `rateLimit(identifier, { limit, windowSec })` (always async so in-memory and Upstash
  share one signature), `clientKeyFromHeaders(headers)`, `isDistributedRateLimitConfigured()`.
  **Prefix identifiers per surface** (`webhook:${ip}`, `checkout:${userId}`, `trpc:${path}:${ip}`)
  so call sites don't share a bucket.
- **In-memory by default; Upstash is opt-in and lazy.** With `UPSTASH_REDIS_REST_URL` +
  `UPSTASH_REDIS_REST_TOKEN` UNSET (this machine's default), it uses a per-instance fixed-window
  Map (prunes expired buckets at most once/min). Set both → a distributed Upstash sliding-window
  limiter via `@upstash/ratelimit` + `@upstash/redis`, pulled through **`await import()` gated on
  the env** so the deps never load/construct when unconfigured. One `Ratelimit` instance is cached
  per `(limit, windowSec)` combo (each Upstash limiter is bound to a fixed algorithm/limit).
- **Deps: `@upstash/ratelimit@^2.0.8` + `@upstash/redis@^1.38.0`** (npm-verified 2026-06-23:
  ratelimit 2.0.8 published 2026-01-12 ~5mo, redis 1.38.0 published 2026-05-05 ~7wk — both well
  past the release-age gate → carets, consistent with prior aged deps). `@upstash/ratelimit`
  peer-depends on `@upstash/redis ^1.34.3`, so both are direct deps; `Redis.fromEnv()` reads the
  two `UPSTASH_*` env names exactly. **No new `allowBuilds`** — neither has a native postinstall
  (install printed "Lockfile passes supply-chain policies" with no ignored builds).
- **The Upstash distributed path is built/type-checked but NOT live-verified** — no Upstash creds
  on this machine, same caveat as Stripe/Resend/Sentry. The **in-memory default IS live-verified**
  (that's the graceful-degradation default a fresh clone runs).
- **Per-surface limits + behavior** (all live-verified except the action's HTTP probe):
  webhook IP-keyed **100/min** → 429 + `Retry-After`, **checked before the signature/config gate**
  (so a flood can't burn crypto CPU; verified: 100×503 from the unconfigured gate, then 429);
  `createCheckoutSession` user-keyed **5/min** → typed `{ error }` (actions can't set a 429
  status); tRPC `rateLimitedProcedure` IP+path-keyed **20/min** → `TRPCError TOO_MANY_REQUESTS`
  (HTTP 429), applied to `user.health`.
- **Server Actions can't be curled directly** (encrypted action id + `Next-Action` header), so the
  action's limit is verified **through the shared `rateLimit()` code path** — the exact same
  function proven live twice over (tRPC + webhook) — plus build/type-check, rather than a separate
  HTTP probe. To exercise it end-to-end, drive `/billing` with an authed Playwright session
  (6 rapid Subscribe clicks → "Too many requests").
- **No CSP / SECURITY.md allowlist change.** The Upstash REST calls are server-to-server (the
  module is `server-only`), never browser fetches — CSP governs only browser content sources. If a
  future limiter ran in the browser, you'd add its origin to `connect-src` + the per-SaaS table.
- **Fail-open on Upstash error** (logs + allows) so a transient Redis blip doesn't lock everyone
  out; one-line flip to fail-closed is noted in `lib/rate-limit.ts` and SECURITY.md.
- **Multi-instance caveat** (same as Step 19's auth limiter): the in-memory store is per-instance
  and resets on restart — set the Upstash env for any multi-instance / serverless deploy.
- **Live test ran on a fresh prod build on `:3100`** (a prior `next dev` holds `:3000`, the
  standing carry-over). Verified the **window reset** too (a fresh call after the 60s window → back
  to 200 / 503). The `:3100` server was stopped after; no throwaway data created.
- **Not committed at write time.** Per the working agreement: impl commit (`lib/rate-limit.ts` +
  the 3 integration files + `env.ts` + `SECURITY.md`/`API.md`/`CLAUDE.md` + `package.json` +
  `pnpm-lock.yaml`) then a separate `docs: checkpoint PROJECT_STATUS` commit (this file +
  `PHASE_2_PLAN.md`), then push.

### Step 19 notes / carry-overs

- **The build caught a graceful-degradation regression — keep it in mind.** `@repo/email`'s
  client was an eager `export const resend = new Resend(process.env.RESEND_API_KEY)`. That was
  fine while nothing in a route's import graph evaluated it (the old welcome action was dead
  scaffold). The moment `@repo/auth` imported `@repo/email`, the auth route `/api/auth/[...all]`
  pulled it in, and `new Resend(undefined)` **throws "Missing API key" in resend v6** → `next
  build` failed at "Collecting page data". Fix: `client.ts` is now a **lazy guarded singleton
  `getResend()`** (constructs on first use, only ever reached past an `isEmailConfigured()`
  gate) — same posture as `lib/stripe.ts`/`lib/search.ts`. The old `resend` export is gone;
  use `getResend()` or (better) the `send*` helpers.
- **`@repo/auth` now depends on `@repo/email`** — a new workspace edge (one-directional; email
  never imports auth, so no cycle). Documented in ARCHITECTURE.md's import-rules list. Required
  `pnpm install` to create the symlink before type-check/build saw it.
- **The graceful-degradation lynchpin is `requireEmailVerification: isEmailConfigured()`.**
  Verification is required ONLY when both `RESEND_API_KEY` + `EMAIL_FROM` are set. With email
  unset (this machine's default), verification is OFF so sign-up/sign-in work normally — never
  lock users out when there's no way to send them a link. The verification/reset callbacks
  still fire but no-op gracefully.
- **Token-leak safety in the unconfigured path:** when email is unconfigured, the send helper
  logs the action link **only outside production** (dev convenience to complete verify/reset
  locally); in production it logs a skip notice **without** the URL/token. Verified live: the
  prod `:3100` server's log showed both callbacks firing with no token.
- **Welcome email fires on `afterEmailVerification`** (sign-up → verify → welcome), the "real
  flow" that closes Step 9. Trade-off: OAuth sign-ups (email already verified) don't trigger
  it — documented alt for welcome-on-signup / OAuth coverage is `databaseHooks.user.create.after`.
- **No login/signup/dashboard UI exists** (auth is API-only via `[...all]`), so live checks ran
  against the Better Auth HTTP API (curl), exactly like Step 4. The reset **token is stored in
  the `verification` table** (`identifier = 'reset-password:<token>'`, `value = userId`) and was
  read from Postgres to complete the round-trip; **email-verification tokens are stateless**
  (signed, not in the DB), so the welcome-on-verify path needs email creds or dev-mode logging
  to exercise end-to-end (wired/built/type-checked, real send unverified like Steps 9–13).
- **`trustedOrigins` is live and bit during testing** — a password-reset `redirectTo` of
  `http://localhost:3100/...` was **403 `INVALID_REDIRECT_URL`** because the canonical
  `BETTER_AUTH_URL` is `:3000`. Use a relative `redirectTo` (e.g. `/reset`) or add the origin to
  `AUTH_TRUSTED_ORIGINS`. Good reminder that the redirect allowlist is enforced.
- **`rateLimit` is ON in all envs** (Better Auth's default is prod-only) so it's testable
  locally; storage is **in-memory** (per-instance) — a multi-instance deploy needs Better Auth
  `secondaryStorage` or `rateLimit.storage:"database"` (a migration). This covers **auth routes
  only**; app-level limiting (webhook / Server Actions / tRPC) is **Step 20** (the next step).
- **No CSP / SECURITY.md change.** `trustedOrigins` gates inbound request origins, not browser
  content sources, and auth is same-origin — nothing new for the CSP allowlist to cover.
- **No new external dependency** (like Step 18) — all built-in Better Auth + existing React
  Email, so nothing to npm-version-check. Only the workspace edge was added.
- **Live test ran on a fresh prod build on `:3100`** (a prior-session `next dev` held `:3000`,
  the documented carry-over). The throwaway `step19-*@example.com` user was cascade-deleted and
  the `:3100` server stopped after.
- **Not committed at write time.** Per the working agreement (mirroring Step 18): impl commit
  (the `@repo/email` / `@repo/auth` / `apps/web` changes + the context docs `AUTH.md` /
  `ARCHITECTURE.md` / `SERVICES.md` + `CLAUDE.md` + `pnpm-lock.yaml`) then a separate
  `docs: checkpoint PROJECT_STATUS` commit (this file + `PHASE_2_PLAN.md`), then push.

### Step 18 notes / carry-overs

- **All headers live in `apps/web/next.config.ts` `headers()`** (`source: "/:path*"`, every
  route). No `middleware.ts` was added — that's the whole point of the static-CSP choice (a
  nonce CSP needs middleware → forces dynamic rendering). The `withSentryConfig` wrapper is
  untouched; `headers()` sits alongside the existing `/ingest` `rewrites()`.
- **Why static CSP with `script-src 'unsafe-inline'` (deliberate, not an oversight):** Next's
  App Router injects per-render inline `<script>` tags (RSC flight data / hydration) that can't
  be hash-pinned, and a nonce requires middleware that opts routes into dynamic rendering. The
  user explicitly asked to **keep the nonce upgrade documented** — it's a full section in
  SECURITY.md (middleware shape, drop `'unsafe-inline'` for scripts, keep it for `style-src`
  since inline `style=` attrs still need it, accept dynamic rendering).
- **Dev vs prod is real and verified, not theoretical.** `const isDev = process.env.NODE_ENV
  !== "production"` drives it; `headers()` is evaluated at server start so `next dev` →
  development, `next build`/`start` → production. Confirmed both variants over the wire:
  prod CSP has `upgrade-insecure-requests` + HSTS and **no** eval/ws; dev CSP has
  `'unsafe-eval'` + `ws:` and **no** HSTS. **HSTS is prod-only on purpose** — sending it over
  http://localhost pins the browser to https for localhost across every project on the machine.
- **CSP allowlist ↔ wired SaaS must move together.** SECURITY.md has a per-SaaS origin table;
  when a future step adds/removes an integration, update the CSP and that table in lockstep.
  PostHog needs nothing beyond `'self'` because it's proxied through `/ingest` (the `*.posthog.com`
  entry is only for non-proxied toolbar/surveys). Sentry needs `connect-src https://*.sentry.io`.
  Stripe's checkout works with **no** CSP entry (top-level redirect); its origins are pre-listed
  for the future client SDK / Elements that `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is reserved for.
- **No dependency added** — pure config + one doc, so nothing to version-check this step.
- **Live verification needed a prod build on an alt port.** A prior-session `next dev` held
  `:3000` (the documented Step-17 carry-over), so `next start` ran on `:3100` for the prod-CSP
  `curl -I`; the dev-CSP variant was curled from the live `:3000` dev server (it had already
  picked up the new config). The Playwright CSP-violation script lived at
  `apps/web/scratch-csp-verify.mjs` and was deleted; the `:3100` server was stopped after.
- **Not committed at write time.** Per the working agreement: impl commit (`next.config.ts` +
  `docs/context/SECURITY.md` + `CLAUDE.md`) then a separate `docs: checkpoint PROJECT_STATUS`
  commit (this file + `PHASE_2_PLAN.md`), then push — done on sign-off, mirroring Step 17.

### Step 17 notes / carry-overs

- **First Phase 2 step.** Files added: `apps/web/src/app/{error,global-error,not-found,loading}.tsx`
  + `packages/ui/src/components/empty-state.tsx` (+ its `.test.tsx`); one scaffold edit to
  `apps/web/src/components/observability/observability-demo.tsx`.
- **`error.tsx`'s default export is `ErrorBoundary`, not `Error`.** Biome's
  `lint/suspicious/noShadowRestrictedNames` fails on a function literally named `Error`. Next.js
  only requires *a* default export from `error.tsx`, so the name is free — renamed and the gate
  passed. Same trap will hit any future boundary file; don't name the export after a global.
- **The Sentry hole this closes:** server-side render errors were already captured
  (`instrumentation.ts` `onRequestError` from Step 13), but **client render errors had no path to
  Sentry**. `error.tsx` + `global-error.tsx` `useEffect(() => Sentry.captureException(error))` fix
  that. Both are no-ops without `NEXT_PUBLIC_SENTRY_DSN` (the SDK initialized `enabled:false`).
- **`EmptyState` is deliberately provider-free** (no hooks, no context) so `global-error.tsx` — which
  mounts **outside** the root layout / providers — can render it. It's the shared surface for
  error boundaries, the 404, and future "no data" states. Icon is an optional `ReactNode`.
- **Step 17 added no dependency.** `lucide-react` is the shadcn icon default (named in UI.md) but
  was never installed; rather than add it for decorative 404/error icons, `EmptyState.icon` takes a
  `ReactNode` and the pages pass none. **Add Lucide at Step 24** (the theme toggle needs sun/moon
  icons) — version-check it against npm then, like every Phase 1 dep.
- **How the error boundary is demonstrated:** the `/observability` demo got a 4th button, "Throw a
  render error (test boundary)", that sets state to throw **during render** (a throw inside the
  click handler would be swallowed by React and never reach the boundary). It's scaffold — it goes
  when the demo routes are deleted. `global-error.tsx` was **not** force-triggered (it only fires on
  a root-layout crash); it's wired and type-checked but unverified live.
- **Live verification used Playwright against the already-running dev server on :3000** (a `next dev`
  from a prior session was occupying the port; `pnpm --filter web start` failed `EADDRINUSE`, but the
  dev server recompiles from source so it already reflected the new files — confirmed via `curl` to
  `/observability` + `/nope`). Had to `pnpm exec playwright install chromium` (browser version bumped
  to **1228** since Step 14). The verify script lived at `apps/web/scratch-verify.mjs` and was deleted.
- **Not committed.** Per the working agreement the changes sit in the working tree; on sign-off,
  follow the Phase 1 pattern — an impl commit (the 6 new/edited files) + a separate
  `docs: checkpoint PROJECT_STATUS` commit.

### Step 16 notes / carry-overs

- **Markdown lint is config, not reflow.** The user chose "config to match the repo's
  style" over reformatting ~1,700 doc lines. `.markdownlint.jsonc` disables exactly the
  six rules the docs trip (enumerated by running `markdownlint-cli2` first: MD013 514×,
  MD032 17×, MD031 15×, MD049 12×, MD022 7×, MD040 3×) and keeps `"default": true` so
  every other rule still guards new docs. Verified `0 errors across 14 files` after.
- **It's `.markdownlint.jsonc`, not `.json`** — JSONC so the rule choices can be
  commented, and the VS Code markdownlint extension + `markdownlint-cli2` both read it.
  **Biome lints/formats JSONC**, so `biome check .` (in `pnpm lint`) *does* check this
  file — it flagged a double-space-before-comment; fixed with `biome check --write`. Keep
  it Biome-clean (2-space indent, single space before `//`, no trailing comma) or `pnpm
  lint` fails. There is **no markdownlint step in CI** — it stays editor-only by design.
- **No markdown CLI dep was added** — `markdownlint-cli2` was run via `pnpm dlx`
  (ephemeral), so nothing entered the lockfile or `package.json`. The repo's only markdown
  tooling artifact is the config file itself.
- **Context docs were already accurate.** The end-to-end read-through of all 11
  `docs/context/*` found them current (the prior "stale snippets" watch-item is resolved
  — API/UI/TESTING/DEPLOYMENT all reconciled at their steps). Only **one** real drift:
  ARCHITECTURE.md `stores/` line still read "placeholder; populated in Step 8" (future
  tense for a done step) → fixed.
- **Demo-scaffold inventory now lives in one place** (ARCHITECTURE.md "Demo / scaffold
  routes" table) rather than only scattered per-route mentions in SERVICES.md/STATE.md
  (those per-route notes were left in place — they're still correct and locally useful).
- **This is the last step.** PROJECT_STATUS's "Next session" section was replaced with a
  "Project complete" on-ramp (delete scaffold, wire TODOs, verify SaaS/deploy with creds).
  When committing: same pattern as prior steps — an impl commit (the doc/config changes)
  plus a `docs: checkpoint PROJECT_STATUS` commit — done on user sign-off.

### Step 15 notes / carry-overs

- **Standalone output is opt-in via `BUILD_STANDALONE`** (set only by `docker/Dockerfile`).
  `next.config.ts` spreads `{ output:"standalone", outputFileTracingRoot: repoRoot }` only
  when `process.env.BUILD_STANDALONE` is set. **Why:** Next's standalone file-tracing copies
  the traced `node_modules` and recreates pnpm's symlinks via `fs.symlink`, which throws
  **`EPERM` on Windows** without admin/Developer Mode (reproduced locally on the
  `@swc/helpers` and `@opentelemetry/api` symlinks). It fails **with or without**
  `outputFileTracingRoot`, so the root
  setting was **not** the cause — it's the standalone copier itself. Gating keeps local + CI
  `next build` cross-platform; only the Linux Docker build emits standalone. Bonus: `next start`
  (Playwright E2E) no longer hits the "does not work with output: standalone" warning.
- **Turbo 2.x strict env mode filters undeclared env vars before tasks run.** The first
  Docker build failed identically to a missing-secret build because `SKIP_ENV_VALIDATION`
  (set as an `ENV`) never reached `next build`. Fix in `turbo.json`: `globalPassThroughEnv`
  for the operational toggles (`SKIP_ENV_VALIDATION`, `BUILD_STANDALONE`, `NEXT_TELEMETRY_DISABLED`,
  `CI`, `PORT`, `HOSTNAME`) + the `build` task's `env` for the app's validated vars
  (`DATABASE_URL`/`BETTER_AUTH_*`/feature server vars/`NEXT_PUBLIC_*`). **This also fixed a
  latent CI bug** — the `verify` and `e2e` jobs pass env via the job environment, which turbo
  was stripping; they only ever worked locally because `dotenv-cli` injects the root `.env`
  into `next build` directly (bypassing turbo's filter). Passthrough vars don't affect the
  cache hash; `env` vars do (correct — changing `NEXT_PUBLIC_*` should bust the build cache).
- **Dockerfile shape:** `node:24-alpine`, `corepack enable` (pnpm from `packageManager`),
  `apk add libc6-compat`. **deps** uses **`pnpm fetch`** (needs only the lockfile → cacheable
  layer) then `pnpm install --frozen-lockfile --offline`. **builder** copies the whole
  installed workspace from deps and runs `pnpm build`. **runner** copies the three standalone
  pieces and runs as **non-root `nextjs` (uid 1001)**. `sharp` (image opt) is traced in and
  works on musl/alpine. Image is **294 MB**.
- **Alpine `adduser`/`addgroup` use BusyBox short flags** (`-S -g`/`-S -u -G`), **not** the
  GNU long flags (`--system`/`--uid`) some Next sample Dockerfiles use — those silently differ
  on BusyBox. Verified the container runs as uid 1001.
- **`.dockerignore` matters because the deps stage does `COPY . .`** — it excludes
  `node_modules`/`.next`/`.turbo`/`.git`/`.env`/tests/docs to keep the context small and avoid
  baking secrets. Source + all manifests + tooling configs are kept (needed for the build).
- **`apps/web/public/` didn't exist** — added a `.gitkeep` so the runner's `COPY public` is
  valid (and gives future static assets a home). Remove it when real assets land.
- **`.vs/` was gitignored** (Visual Studio workspace-state JSON). `biome check .` honors
  `.gitignore` (`vcs.useIgnoreFile: true`), so once ignored it stops scanning those files —
  they were the only thing failing `pnpm lint` this session. Not app work, but it unblocks the gate.
- **Prod compose** (`docker/docker-compose.prod.yml`) is separate from the dev one; distinct
  container names (`-prod` suffix) so both can't collide. Validated with `docker compose config`.
  Running it builds the image + starts all three; the landing page is DB-free so it serves
  before migrations, but DB-backed routes need a one-off `db:migrate` first (documented).
- **Real PaaS/host deploys are UNVERIFIED** (no Vercel/Railway/Fly/VPS used) — documented like
  the SaaS-key steps. What *is* verified here is the image building + running + serving locally.
- **Not committed.** Per the working agreement, this session left the changes in the working
  tree (the user hadn't asked to commit). The prior pattern was an impl commit + a separate
  `docs: checkpoint PROJECT_STATUS` commit — do that when the user signs off.

### Step 14 notes / carry-overs

- **Vitest runs per package, via `turbo test`** (not a single root config). The decision: the repo
  is turbo-first, so each test-bearing package owns a `vitest.config.ts` + `"test": "vitest run"`
  and `turbo test` fans out. `@repo/validators` = **node** env; `@repo/ui` = **jsdom**. Co-located
  `*.test.ts(x)`. This also cleanly shows the node-vs-jsdom split.
- **`apps/web` has NO Vitest project** — importing app modules pulls in `@/env`, which validates
  env at import and throws without `DATABASE_URL`/`BETTER_AUTH_SECRET`. App-level unit tests are
  documented (TESTING.md) as addable with a jsdom config mirroring `@repo/ui` + a test env / mocked
  `@/env`. The app owns the **Playwright** E2E instead.
- **Vitest 4 uses the built-in oxc transformer, not esbuild.** The automatic JSX runtime works with
  **no `@vitejs/plugin-react`** (which would've added the hours-old `6.0.3` + `babel-plugin-react-
  compiler`/`@rolldown/plugin-babel` peers). An initial `esbuild: { jsx: "automatic" }` was ignored
  with a warning (`Both esbuild and oxc options were set…`) and removed. The `@repo/ui` component
  test renders fine, confirming oxc's automatic runtime.
- **`@repo/ui` vitest config** needs `resolve.alias` `@repo/ui` → `./src` (so a component's own
  `@repo/ui/lib/utils` import resolves to source) and `setupFiles: ["./src/test/setup.ts"]`
  (`import "@testing-library/jest-dom/vitest"` — registers matchers AND augments their types, which
  `tsc --noEmit` picks up because the setup file is in the tsconfig `include`).
- **`@testing-library/react` 16 requires `@testing-library/dom` as an explicit peer** — installed
  alongside it. `@types/react`/`react`/`react-dom` peers were already present in `@repo/ui`.
- **`vite` is vitest's TRANSITIVE dep** (`vitest@4` deps `vite ^6||^7||^8` → newest = the hours-old
  `8.1.0`). We never import vite directly, so it's pinned to the aged **`8.0.16`** via a
  `pnpm-workspace.yaml` **`overrides`** entry (first use of overrides in the repo). Honors the
  no-fresh-deps policy without adding vite as a fake direct dep. Bump as newer 8.x ages out.
- **The `minimumReleaseAge` gate is real but not configured in-repo** (`pnpm config get
  minimumReleaseAge` → `undefined`; no `.npmrc`/yaml key). Install still printed "✓ Lockfile passes
  supply-chain policies", so the policy check runs (likely a pnpm 11 default / global). Either way
  the policy was honored by pinning the two hours-old releases (vite, plugin-react→dropped) to aged
  versions; the rest (vitest/playwright 8 days, jsdom ~8 wk, TL months) are normal carets.
- **Playwright has no npm postinstall** (`scripts: {}`) — browsers download via the
  `playwright install chromium` CLI, **not** a build script, so **no `allowBuilds` change**. Install
  stayed clean (no `ERR_PNPM_IGNORED_BUILDS`). Browser is a machine-local cache, not a repo dep.
- **`env.ts` now honors `SKIP_ENV_VALIDATION`** (`skipValidation: !!process.env.SKIP_ENV_VALIDATION`)
  — it was a documented flag that did nothing until now. The CI `verify` job's build sets it, so
  `next build` runs without secrets (verified via a local sim: `next build` with no env file +
  `SKIP_ENV_VALIDATION=1`, both DB vars empty, prerendered all pages). `dotenv-cli` no-ops on a
  missing `../../.env` (verified), so CI needs no root `.env`.
- **Playwright `webServer` uses `pnpm start`** (prod build on :3000). `turbo`'s `test:e2e` task
  `dependsOn build`, so the app is built first; `reuseExistingServer: !CI`. `next start` prints the
  pre-existing `output: standalone` warning but **serves fine** (the smoke passed). The E2E target is
  the DB-free landing page `/` — DB-touching flows (auth) wait for an auth UI and the push-to-main
  lane (which has a `postgres:16` service + `db:migrate`).
- **Coverage** (`@vitest/coverage-v8`) is installed but **not** wired into the default `test` task
  (kept `pnpm test` fast/warning-free). Run `pnpm --filter <pkg> exec vitest run --coverage` (the
  `pnpm test -- --coverage` form mangles the flag through the npm-script `--`). No threshold enforced
  in the scaffold; TESTING.md documents adding `coverage.thresholds`.
- **TESTING.md's "stale `db.query.users`" watch-item was already resolved** — the Integration Test
  Pattern already used the singular `user` table. TESTING.md was instead rewritten to match the
  *implemented* setup (per-package projects, oxc, coverage, the real home smoke); the integration
  pattern (DB-backed) is kept but documented as running where a DB exists, not in the unit lane.

### Step 13 notes / carry-overs

- **Observability is app-local, not a `@repo/*` package.** Sentry instrumentation files are a
  Next.js convention (must live in the app, under `src/`); PostHog's server client is a thin
  config singleton (`apps/web/src/lib/posthog.ts`, same posture as `lib/stripe.ts`/`lib/search.ts`);
  the PostHog client provider is an app component; BetterStack's `log` is imported directly from
  `@logtail/next` where needed. Nothing landed in a package.
- **Sentry uses the v10 instrumentation pattern, NOT the bare `sentry.client.config.ts` trio**
  the old SERVICES.md sketched (corrected). Files (all `apps/web/src/`): `instrumentation.ts`
  (`register()` dynamic-imports server/edge config by `NEXT_RUNTIME`; exports
  `onRequestError = Sentry.captureRequestError`), `instrumentation-client.ts` (browser
  `Sentry.init` + `onRouterTransitionStart`), `sentry.server.config.ts`, `sentry.edge.config.ts`.
  `next.config.ts` wrapped with `withSentryConfig`. **No guarded singleton** (unlike stripe/posthog):
  `Sentry.init({ dsn, enabled: Boolean(dsn) })` is a no-op when the DSN is unset and never throws.
- **`@sentry/nextjs` exact-pinned `10.59.0`** — `latest` `10.60.0` was published *hours* before
  Step 13 (gate trip), `10.59.0` (4 days) cleared. `^` resolves to newest → re-trips, so exact.
  Same story for **`posthog-js` `1.391.2`** (latest `1.392.0` was a day old) and **`posthog-node`
  `5.38.2`** (exact for determinism). **`@logtail/next` `^0.3.1`** (~5 months old) is a normal caret.
- **`allowBuilds` gained two entries (both `false`):** `@sentry/cli` (via `@sentry/nextjs` →
  `@sentry/bundler-plugin-core`) postinstalls the source-map-**upload** binary — only needed when
  `SENTRY_AUTH_TOKEN` is set, which the default doesn't ship, so the no-creds build never invokes
  it; **flip to `true` when wiring real upload in CI.** `core-js` (via `posthog-js`) postinstall is
  only a funding banner. Don't blanket-approve — both set explicitly.
- **BetterStack env vars are `BETTER_STACK_SOURCE_TOKEN` + `BETTER_STACK_INGESTING_URL`** (legacy
  `LOGTAIL_SOURCE_TOKEN`/`LOGTAIL_URL` also read), **NOT `BETTERSTACK_API_KEY`** — verified against
  the installed `@logtail/next@0.3.1` source (`platform/generic.js`). The old docs were wrong;
  corrected in SERVICES.md/DEPLOYMENT.md/env.ts. `log` needs **both** token + URL to ship; without
  them it falls back to console (never throws) → graceful.
- **PostHog client provider is the 2nd root-layout client provider** (outside `TRPCReactProvider`).
  It renders `children` straight through, so Server Components stay server-rendered — the **RSC
  boundary does not widen** (documented in STATE.md). It's also a no-op passthrough (returns
  `children`, never mounts) when `NEXT_PUBLIC_POSTHOG_KEY` is unset. PostHog server flags are
  checked in the RSC (`/observability` page) to avoid client flicker.
- **`/ingest` same-origin reverse proxy** lives in `next.config.ts` `rewrites()` (+
  `skipTrailingSlashRedirect`): `/ingest/static/*` → `*-assets.i.posthog.com`, `/ingest/*` →
  `NEXT_PUBLIC_POSTHOG_HOST` (default `https://us.i.posthog.com`), derived so EU = one env change.
  The client SDK uses `api_host: "/ingest"`. **Verified live** even without a key:
  `GET /ingest/static/array.js` → 200, real PostHog JS.
- **Next 16 `next build` uses Turbopack.** Sentry's *runtime* instrumentation works regardless,
  but source-map upload is a webpack-plugin feature → confirm Sentry's Turbopack support before
  relying on it. `disableLogger` is deprecated/unsupported under Turbopack — **omitted** from
  `withSentryConfig` (it warned twice until removed).
- **`/observability` is public demo scaffold** (like `/search`, `/uploads`, `/billing`, `/profile`,
  `/state`): a Sentry error-capture button, a BetterStack structured-log button (the Server Action),
  a PostHog capture-event button, and the server-evaluated flag. Delete when real instrumentation lands.
- **Real SaaS ingestion is UNVERIFIED** — no Sentry/BetterStack/PostHog keys on this machine (these
  are hosted products, no local backend unlike Postgres/Meilisearch). To verify: set the DSN/tokens/
  key in root `.env`, hit `/observability`, and confirm events land in each dashboard. The
  build-without-creds gate, the provider mount, the graceful flag check, and the `/ingest` proxy
  *are* verified locally. No secrets committed.
- **`next start` warns under `output: standalone`** (`"next start" does not work with output: standalone`)
  — pre-existing config (Step 2); prod runs `node .next/standalone/server.js`. The Step-13 live check
  used `next start` anyway and it served the routes fine for verification.

### Step 12 notes / carry-overs

- **Search client lives in the app, not a package:** `apps/web/src/lib/search.ts`
  (`import "server-only"`) is a thin config singleton used only by `apps/web` (the search tRPC
  router + the index action), so no `@repo/*` package — same posture as `lib/stripe.ts` /
  `lib/uploadthing.ts`. Deliberately **kept out of `@repo/db`** (which stays pure Drizzle/Postgres
  with no other deps); SERVICES.md's "via a utility in `packages/db/`" option was not taken.
- **Lazy guarded singleton** (`getSearchClient()` + `isSearchConfigured()`): `new Meilisearch({ host })`
  _validates the host and throws_ on empty/invalid (like `new Stripe("")`, unlike Resend which only
  warns), so the client constructs on first use, not at import — the app builds without creds.
  `isSearchConfigured()` gates on `MEILISEARCH_HOST`.
- **Client class is `Meilisearch`** (one capital), **not** the old `MeiliSearch` casing the SERVICES.md
  snippet used (now corrected). Error class `MeilisearchApiError` carries `cause?.code` (e.g.
  `index_not_found`).
- **Read/write split (API.md):** searching = `searchRouter.search` **publicProcedure** query
  (`server/trpc/routers/search.ts`) returning `{ configured, hits }`; it degrades to empty hits — never
  a 500 — when unconfigured, and treats `index_not_found` (nothing indexed yet) as an expected empty
  state (any other engine error → `TRPCError`). Indexing = **auth-gated** `indexExampleDocuments`
  Server Action (`server/actions/search.ts`), returning `{ error } | { data }` and `await`ing the
  enqueued task via `.addDocuments(docs).waitTask()` so an immediate search sees the docs.
- **No `@repo/db` change, no migration.** The example indexes a hardcoded `EXAMPLE_DOCUMENTS` constant
  (sample "posts"). Documented pattern for real apps: index your own rows on DB write (the same
  `addDocuments` flow inside the Server Action / `@repo/db` util that creates/updates the record).
- **`/search` is public demo scaffold** (like `/uploads`, `/billing`, `/profile`, `/state`): a search
  box (the tRPC query) + an "Index sample documents" button (the action). Logged-out indexing shows
  "Unauthorized"; unset env shows "not configured". Delete when a real search surface lands.
- **`meilisearch@^0.58.0`** (normal caret, not exact-pin): `latest` `0.58.0` was published 2026-04-29
  (~8 weeks before Step 12), well clear of pnpm's `minimumReleaseAge` gate — install reported "Lockfile
  passes supply-chain policies". Dependency-free, **no native build script** → no `allowBuilds` change.
  0.x caret resolves to the patch range.
- **docker-compose:** `getmeili/meilisearch:v1.48.1` (current stable), container `nwb-meilisearch`, port
  7700, named volume `meilisearch_data`. `MEILI_ENV=development` (keeps the :7700 search-preview UI,
  lenient key length) + `MEILI_NO_ANALYTICS=true`. `MEILI_MASTER_KEY: ${MEILI_MASTER_KEY:-dev_meili_master_key_change_me}`
  — a clearly-local dev default, overridable via a root-`.env` `MEILI_MASTER_KEY`; **not a real secret**.
  Healthcheck uses `curl -f .../health` (the image ships curl; container reports `healthy`).
- **Root `.env` now has `MEILISEARCH_HOST` + `MEILISEARCH_API_KEY`** (gitignored, local only; the key
  equals the compose default) so `/search` works out of the box next session. The build-without-creds
  gate ran _before_ these were added (still valid). No secrets committed.
- **Fully verified end-to-end on this machine** (unlike the SaaS-key steps): (1) lint+type-check+build
  with search env unset; (2) container `/health` → `available`; (3) live client round-trip — indexed 5
  docs, `search("meilisearch")` → the right doc, typo `search("postgers")` → the Postgres doc (typo
  tolerance); (4) the real app read path — live tRPC `search.search` returned `{configured:true, hits:[…]}`
  for both exact + typo queries, and `GET /search` → 200. The index *action* (auth-gated) shares the exact
  client call exercised in (3) and is type-checked/built; exercising the index _action_ in-browser needs sign-in (like `/billing`).

### Step 11 notes / carry-overs

- **Uploadthing server client lives in the app, not a package:** `apps/web/src/lib/uploadthing.ts`
  (`import "server-only"`) is the file router (auth-gated `imageUploader`, 4 MB, max 1 file); both
  it and the route handler live in `apps/web`, so no `@repo/*` package (same posture as
  `lib/stripe.ts`). `uploadthing`/`@uploadthing/react` are normal compiled npm deps (NOT in
  `transpilePackages`, unlike raw-`.tsx` `@repo/ui`/`@repo/email`).
- **Three-file split:** server file router (`lib/uploadthing.ts`) → route handler
  (`app/api/uploadthing/route.ts`, `createRouteHandler` GET/POST) → client helpers
  (`lib/uploadthing-client.ts`, `generateUploadButton`/`generateUploadDropzone`). The client file
  imports `OurFileRouter` **type-only**, so the server-only router never enters the client bundle.
- **`UPLOADTHING_TOKEN` is optional.** `createRouteHandler` reads it at request time, not module
  load, so the route mounts and the app builds without it (verified: build with token unset; live
  `GET /api/uploadthing` → config JSON; malformed `POST` → 400, not a 500). Upload auth is gated in
  the router's `.middleware()` via Better Auth. **`onUploadComplete` persistence is a documented
  TODO** — store `file.ufsUrl` against `metadata.userId` via `@repo/db` (see DATABASE.md). No migration.
- **`/uploads` is public demo scaffold** (like `/billing`, `/profile`, `/state`). It imports the
  **prebuilt** `@uploadthing/react/styles.css` (NOT the `withUt` Tailwind plugin, which targets a
  v3-style JS config — this repo is Tailwind v4 CSS-config). Delete when a real upload surface lands.
- **Two toolchain fixes shipped with this step** (both recorded in the toolchain-gotcha notes, now in STACK.md/CONVENTIONS.md):
  - `pnpm-workspace.yaml` `allowBuilds: msgpackr-extract: false` — a new transitive native
    accelerator (via `uploadthing`→`msgpackr`) with a pure-JS fallback; the unresolved pnpm
    placeholder was making `pnpm install`/lint/type-check/build fail with `ERR_PNPM_IGNORED_BUILDS`.
  - `tooling/typescript/nextjs.json` `declaration:false` + `declarationMap:false` — the shared
    base sets `declaration:true` (for the libs), so the app's `tsc --noEmit` did declaration
    checking and hit **TS2883** ("inferred type … cannot be named without a reference to
    `@uploadthing/shared` … not portable") on uploadthing's generated helpers + `satisfies
    FileRouter`. A Next app emits no `.d.ts`, so disabling declaration in the nextjs preset (libs
    keep `true`) is the correct fix.
- **Deps `uploadthing@^7.7.4` + `@uploadthing/react@^7.3.3` use caret ranges** (not exact pins):
  both latest were published Aug 2025, well past pnpm's `minimumReleaseAge` gate — the exact-pin
  workaround was only for the hours-old `react-email`/`stripe` releases at Steps 9–10.
- **Real end-to-end upload unverified** — no `UPLOADTHING_TOKEN` on this machine. To verify: set
  `UPLOADTHING_TOKEN` in root `.env`, sign in, open `/uploads`, and upload an image; confirm the
  `onUploadComplete` server log fires. The route-mount + auth-gate + graceful-degradation paths
  _are_ verified (build + live dev). No secrets committed.

### Step 10 notes / carry-overs

- **Stripe server client lives in the app, not a package:** `apps/web/src/lib/stripe.ts`
  (`import "server-only"`). It's app-only (the action + webhook both live in `apps/web`) and a
  thin config singleton, so no `@repo/stripe` package — same posture as `lib/uploadthing.ts`.
  `stripe` is a normal npm dep (NOT in `transpilePackages`, unlike raw-`.tsx` `@repo/email`/`ui`).
- **Lazy guarded singleton** (`getStripe()` + `isStripeConfigured()`): `new Stripe("")` _throws_
  (Resend only warns), so the client constructs on first use, not at import. Callers gate on
  `isStripeConfigured()` and return the typed not-configured result. `apiVersion` pinned to the
  SDK major's target string (`2026-05-27.dahlia`, from `stripe/cjs/apiVersion.js`) — bump with the major.
- **`createCheckoutSession`** (`server/actions/billing.ts`) is example scaffold: auth-gated, returns
  `{ error } | { data: { url } }`, `mode: "subscription"` with **inline `price_data`** ($10/mo
  "Example Pro Plan") so it needs no pre-created Stripe Dashboard Price. Client redirects to
  `data.url` (hosted Checkout — no client SDK). Delete/rewire when real billing lands.
- **Webhook** (`api/stripe/webhook/route.ts`): `runtime = "nodejs"`, raw body via `req.text()`,
  `constructEvent` signature verify. **DB persistence is a documented TODO** — recommended
  `subscriptions` schema is in DATABASE.md; the route only verifies + routes events. No migration.
- **No client SDK installed.** `@stripe/stripe-js` 9.8.0 / `@stripe/react-stripe-js` 6.6.0 were
  confirmed-latest but skipped — the hosted-redirect flow needs none. Install for future Elements.
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` env var is reserved (optional, currently unused).
- **`stripe` exact-pinned `22.2.2`** (not `^`): `latest` `22.2.3` was published hours earlier
  (same risk class as the Step-9 `react-email` trip); `22.2.2` (4 days) cleared pnpm's
  `minimumReleaseAge` gate. `^`-ranges resolve to newest → re-trigger the gate, so the pin is
  exact. Bump once `22.2.3`+ ages out. No `minimumReleaseAgeExclude` was added.
- **`/billing` (+ `/billing/success`) is public demo scaffold** like `/profile`, `/state`. The
  Subscribe button shows the action's graceful errors when unconfigured (logged-out →
  "Unauthorized"; no keys → "Stripe is not configured"). Delete when a real billing surface lands.
- **Real Stripe-CLI flow unverified** — no test keys on this machine. To verify: set
  `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in root `.env`, run `stripe listen --forward-to
  localhost:3000/api/stripe/webhook` (copy the `whsec_…` it prints) and `stripe trigger
  checkout.session.completed`. The signature-verification path _is_ verified (offline +
  self-signed live POST to the running route: valid→200, tampered/no-sig→400). No secrets committed.

### Step 9 notes / carry-overs

- **`@repo/email` is the email scaffold** (server-only): `client.ts` (Resend) + `index.ts`
  (re-exports `resend`) + `templates/welcome.tsx` (`WelcomeEmail`). Ships raw `.tsx`, so it's in
  `next.config.ts` `transpilePackages`; exports `.` + `./templates/*`. See SERVICES.md.
- **Templates need a default export** for the `email` preview CLI (named export for app use) —
  a documented framework exception to named-exports-only, like Next.js page files.
- **Dev preview is opt-in**, not part of `pnpm dev`: `pnpm --filter @repo/email preview`
  (`email dev` on :3001). The CLI's generated `.react-email/` dir is gitignored.
- **`sendWelcomeEmail` (`apps/web/src/server/actions/email.tsx`) is example scaffold** — not
  wired to any route; it returns the typed `{ error } | { data }` shape and no-ops gracefully
  when `RESEND_API_KEY`/`EMAIL_FROM` are unset. Delete or wire it when a real email flow lands.
- **Real send is unverified** — no `RESEND_API_KEY` on this machine. To verify: set
  `RESEND_API_KEY` + `EMAIL_FROM` (e.g. `onboarding@resend.dev`) in root `.env` and invoke the
  action, or use the dev preview. The HTML render path _is_ verified end-to-end.

### Step 8 notes / carry-overs

- **State boundary is doc'd in new `docs/context/STATE.md`** (linked from the CLAUDE.md context
  table): server/async state → TanStack Query; ephemeral client/UI state → Zustand; never copy
  server data into a store. See locked decisions below for the middleware call.
- The `/state` route (like `/profile`) is **public scaffold** — `UiStoreDemo` mounted twice to
  prove a shared global store. Delete both demo routes when real features/pages land.
- **Verified live via Playwright-driven Chromium** (Playwright isn't a repo dep until Step 14, so
  it was installed in a throwaway temp dir, not the workspace — nothing leaked into the repo).
  Gotcha logged: a failed `Set-Location` left an earlier `npm init`/`npm install` running in the
  repo root, polluting root `package.json` + dropping `*.log`; both were reverted/removed before
  the commit (the `pnpm-lock.yaml` change is zustand-only). If driving a browser again, install
  Playwright in a temp dir and double-check `cwd` first.

### Older carry-overs (still true)

- A throwaway demo user `forms-demo@example.com` (name now "Ada Lovelace") exists in the local
  `appdb` from the Step-7 live form verification. Harmless local test data; delete for a clean DB.
- The `/profile` page is a **public demo** (see locked decisions). When auth UI lands, the
  "real" protected profile page moves under `app/(dashboard)` behind the proxy gate.
- **Context docs are current as of Step 8** (`docs/context/*` reconciled at the Step-7 audit,
  commit `f3138a9`; STATE.md added at Step 8). Repo-wide markdown-lint normalization (code-fence
  languages, blank-line spacing) is still intentionally deferred to **Step 16**.
- **Only uncommitted file is `.claude/settings.json`** — an auto-accumulated Claude Code
  permissions allowlist, intentionally left out of commits (local tooling, not project work).
  It persists in the working tree across sessions; commit it only if you want shared perms.

---

## Phase 3 — feature depth (post-Step 29)

> Detailed per-step record for Phase 3, moved here from `docs/PROJECT_STATUS.md` (which
> keeps the compact one-line-per-step build-progress table) so the resume file stays lean.
> The cross-cutting "why" is in [../context/DECISIONS.md](../context/DECISIONS.md); the
> forward backlog is [../BACKLOG.md](../BACKLOG.md). A read-only **Phase B
> 100/100 audit** confirmed a green baseline with no must-fix bugs
> ([PHASE_B_AUDIT.md](PHASE_B_AUDIT.md)).

- **Tier 0 (doc-drift + cleanup) shipped** — B1/B2/B3/B5 doc-honesty fixes, A1 deletes the
  dead `/ingest/decide` rewrite, A2 moves the tRPC rate-limiter off trivial `user.health`
  onto the abusable public `post.list` / `search.search` reads.
- **C1 (auth/dashboard UI) shipped** — the `(auth)` login/signup/forgot-password/reset
  pages + the `(dashboard)` shell (nav, user menu, sign-out); `e2e/auth.spec.ts` converted
  from HTTP-API to real UI steps; B4 doc-drift folded in. **Closed the "proxy redirects to
  a `/login` that 404s" gap** — verified by the auth E2E suite passing against a fresh prod
  build. Email/password only + thin shell by design; OAuth buttons + dashboard depth are
  documented deferred options (see AUTH.md / ARCHITECTURE.md).
- **C2 (`apps/web` Vitest) shipped** — a `node`-env Vitest project for the app, unblocked
  by aliasing `@/env` → a test stub and `server-only` → an empty module. 40 unit tests
  cover the auth-gate / rate-limit-block / validation-failure branches of
  `server/actions/{post,admin}.ts` + `lib/{rate-limit,rbac}.ts`; coverage is scoped to
  those four files (100% statements/lines/functions, ~93% branches) and gated in CI.
- **C3 (DB-backed checks on PRs) shipped** — the `e2e` lane's
  `if: push && ref==main` gate was dropped so the lane runs on **every PR and push to
  main**. The `@repo/db` integration tests + the Playwright/a11y suite (against a
  `postgres:16` service) now gate PRs, so a broken auth/posts flow is caught **before**
  merge instead of after. Reused the existing job wholesale (no second lane); Meilisearch
  stays absent (the suite degrades gracefully — `createPost` indexes best-effort); no new
  actions or deps.
- **C4 (Stripe webhook → DB persistence) shipped** — a `subscriptions` table
  (`packages/db`, FK → `user` cascade) + the webhook handler's writes: an **upsert**
  on `checkout.session.completed` (mapped to the user via the Checkout Session
  `metadata.userId`) and an **update-by-id** on `customer.subscription.updated`/
  `deleted`. `stripeCustomerId` stays on `subscriptions` only — the Better-Auth-owned
  `user` table is untouched. Behind the existing `503` gate, so the build/run stays
  green with Stripe env unset. Proven by a `@repo/db` integration test (real Postgres,
  runs in the C3 lane) + an `apps/web` webhook unit test; **no new deps**, no
  `billing.ts` change.
- **D1 (posts depth) shipped** — the `/posts` copy-me entity fleshed out to a full
  CRUD showcase: a `updatePost` author-only edit Server Action (re-validates +
  re-indexes, same row-level authz as delete); `post.list` converted from a flat
  `limit(50)` to **keyset cursor pagination** (`{ cursor, limit }` → `{ items,
  nextCursor }`) driven by `useInfiniteQuery` + a "Load more" button; and
  **optimistic create/edit/delete** (TanStack `useMutation` with
  `onMutate`/`onError`/`onSettled` rollback over the infinite cache). Inline per-row
  edit (no new `@repo/ui` component, no new route, **no new deps**); seed bumped to 8
  staggered rows so "Load more" is exercised. `updatePostSchema` added to
  `@repo/validators`; **no schema/migration change** (`updatedAt` + `$onUpdate`
  already existed). Verified by the full gate + 8 new `apps/web` unit tests
  (`updatePost`) + 2 new `@repo/db` integration tests (update-by-id, keyset
  pagination) + a create→edit→delete E2E.
- **D2 (admin UI depth) shipped** — `/admin` (a read-only user list before) moved into
  the `(dashboard)` shell (inherits the C1 header/nav; URL unchanged) with an
  **admin-only nav link** (authoritative `getUserRole` read in the layout) and a real
  **write surface**: a client `RoleControl` per row drives the existing `setUserRole`
  Server Action — **optimistic** via React 19 `useOptimistic` (the button flips
  immediately; `revalidatePath("/admin")` reconciles, reverting on a typed error), the
  Server-Action flavour of optimistic UI vs D1's tRPC cache-patching. Added a
  **self-demotion anti-lockout guard** (`setUserRole`
  refuses to change the caller's own role; the UI shows "(you)" there). **No schema/
  migration change, no new deps.** Verified by the full gate + a new self-demotion unit
  test (`admin.test.ts`, 5 tests now) + a promote/demote + non-admin-404 E2E
  (`e2e/admin.spec.ts`, bootstrapping the admin via a direct-DB-write helper).
- **D3 (React Compiler) shipped** — `reactCompiler: true` (stable top-level config in
  Next 16) enabled as a modern default, so React auto-memoizes components/hooks and
  manual `useMemo`/`useCallback` becomes the exception. One **exact-pinned** devDep
  (`babel-plugin-react-compiler@1.0.0`); React 19 needs no `react-compiler-runtime`.
  **Turbopack-compatible** — Next gates the Babel pass behind an SWC analysis (JSX/Hook
  files only), so dev + build stay on Turbopack at a small, one-time cost (busts the
  `web:build` cache once). **No runtime/env/CSP surface** (a pure build transform — always
  on, nothing to degrade); **no `eslint-plugin-react-hooks`** added (keeps the "ESLint =
  Next-only" boundary; Biome already lints hooks). Opt a component out with `"use no memo"`.
  Verified by the full gate + a live run of the optimistic `/posts` + `/admin` surfaces.
- **D4 (Cache Components) shipped** — top-level `cacheComponents: true` (dynamic-by-default
  + `"use cache"` opt-in; all dynamic routes Partial-Prerendered). Removed the route-segment
  configs it bans (health/webhook → Next 16 Node-default runtime + `connection()`; signup
  `searchParams`). `/posts` reworked into a PPR showcase — a synchronous static shell +
  streamed `<Suspense>` boundaries + a `"use cache"` `<PostStats>` count
  (`cacheLife("minutes")`/`cacheTag("posts")`, with a try/catch that keeps the build green
  with the DB down) busted by `updateTag("posts")` (read-your-own-writes). `next/after`
  log-flush (tRPC telemetry + observability action). No new deps, no schema change.
- **D5 (`siteUrl`/`SITE_URL` decoupling) shipped** — decouple the public/SEO origin from the
  auth origin: an optional `SITE_URL` server var → `siteUrl = SITE_URL ?? BETTER_AUTH_URL ??
  localhost` (`lib/site.ts`). Server-only (metadata renders server-side); `turbo.json`
  `build.env` passthrough; auth/Stripe-redirect/SSR stay on `BETTER_AUTH_URL`.
  Backward-compatible (unset = identical). No new deps.
- **D6 (Storybook gallery + `init-app` scaffold) shipped** — a component gallery (Storybook)
  for `@repo/ui` + a scaffold. `@storybook/react-vite` (ui is a standalone React lib, zero
  `next/*`); Tailwind v4 via `@tailwindcss/vite` + a `.storybook/tailwind.css` mirroring the
  app's layers; class-based dark-mode toolbar (`withThemeByClassName`); 8 stories
  (button/card/input/label/textarea/dropdown-menu/empty-state/theme-toggle). **Dev-only, zero
  app-bundle cost** (not in `turbo`/CI; `@source not …stories.tsx` keeps story classes out of
  the app CSS). Scaffold: cross-platform `scripts/init-app.mjs` (`pnpm init-app`) seeds
  `.env`/renames + a README "Use this template" (degit). Storybook pkgs exact-pinned `10.4.6`.
- **D7 (pg-boss background jobs) shipped** — a new **`@repo/jobs`** (pg-boss `12.20.0`,
  exact-pinned) on the **existing Postgres** — no new service. Enqueue/worker split (the web
  app's `enqueue()` = a graceful no-op-on-failure INSERT; a standalone worker `pnpm --filter
  @repo/jobs start` drains queues). pg-boss owns its `pgboss` schema (Drizzle doesn't).
  Example: `@repo/auth`'s `afterEmailVerification` → `enqueue(welcomeEmail)` → the worker calls
  `@repo/email`. The worker runs `@repo/email` (server-only + JSX) as plain Node via `tsx` +
  `tsconfig.worker.json` (maps `server-only`→stub; pulls `../email/src` into scope for the
  automatic JSX runtime). Docker `worker` target + a `prod` compose service; unit (verify) +
  DB integration (e2e) tests. **+1 worker process = the one real runtime cost.**
- **D8 (built-in Turbopack bundle analyzer) shipped** — `analyze`/`analyze:output` scripts
  wired to Next's built-in `next experimental-analyze` (Turbopack module graph; compiles
  internally; writes `.next/diagnostics/analyze`). Chosen over the webpack-bound
  `@next/bundle-analyzer`. **No new dep**, no `next.config`/`env`/CSP change (docs-only
  footprint).
- **D9 (Uploadthing → DB persistence) shipped** — an `uploads` table (surrogate `uuid` id +
  unique `key`, FK → `user`, migration `0004`); an idempotent `onUploadComplete` upsert keyed
  by the storage `key`; a DB-backed integration test. No new deps, no CSP surface.
- **D10 (rate-limit IP-fallback hardening) shipped** — audit A3: `clientIpFromHeaders` →
  a `string | null` primitive (`clientKeyFromHeaders` is now its `?? "unknown"` wrapper); the
  webhook routes IP-less hits to a tighter shared `noip` bucket (20/min) rather than the
  100/min per-IP one; a trusted-proxy + spoofing deploy note (SECURITY/DEPLOYMENT). No new deps.
- **D11 (observability dashboards-as-code) shipped** — a new **`@repo/observability`**
  (private, dev/CI-only, never imported by the app): a BetterStack monitor (`/api/health`) +
  heartbeat (the jobs worker) defined as **typed TS validated by Zod** (no YAML/parser dep —
  **zero new deps**). Graceful `sync` (idempotent upsert; no-op when `BETTER_STACK_API_TOKEN`
  unset) + a creds-free `check` wired into CI's verify lane. BetterStack over Grafana (composes
  with the existing Logtail; no metrics pipeline); Node sync over Terraform (no new
  binary/state; matches the `enqueue()` posture). The one runtime touch = the worker's opt-in,
  env-gated heartbeat ping (`packages/jobs/src/heartbeat.ts`, no-op when unset). Trivially
  deletable.

### Maintenance audit (2026-06-26→27) — M1–M7 + the Tier-2 Turbo remote-cache note

> The full per-item prose, moved here verbatim from `docs/PROJECT_STATUS.md`'s build-progress
> table (which keeps a one-line-per-item record). A read-only re-audit found **no must-fix
> correctness bugs** and the stack current; these are the completeness/accuracy-polish items it
> shipped. The "why" for cross-cutting ones (CSP nonce recipe) is in
> [../context/DECISIONS.md](../context/DECISIONS.md).

- **M1 (OAuth social-login UI) + M2 (Sentry/Turbopack source-map doc fix) shipped** —
  **M1:** OAuth social-login buttons on the `(auth)` forms (server-detected configured
  providers → one `authClient.signIn.social({ provider })` button each; graceful — no dead
  buttons, no new CSP origin; closed the C1 "deferred: OAuth social buttons" note). **M2:**
  corrected stale Sentry/Turbopack source-map docs (upload is supported + automatic since
  `@sentry/nextjs@10.13`/`next@15.4.1` via `runAfterProductionCompile`).
- **M3 (real `/account` settings page) shipped** — a real `/account` settings page in the
  `(dashboard)` shell (editable display name via `updateUserName`; password change via Better
  Auth `changePassword` for credential users only, `revokeOtherSessions`) · `Account` link in
  the user menu · **deleted** the throwaway `/profile` demo (form moved to `components/account/`).
- **M5 (editable email on `/account`, single-hop) shipped** — editable sign-in email on
  `/account` (`ChangeEmailForm` → `authClient.changeEmail`, shared `changeEmailSchema`) ·
  verified current email → emails a confirmation link (see M6); unverified/email-unset → applies
  immediately (`updateEmailWithoutVerification`) so it works email-unconfigured · `/change-email`
  rate-limited.
- **M6 (two-hop email-change confirmation) shipped** — upgraded the verified email-change to
  **two-hop** (`user.changeEmail.sendChangeEmailConfirmation`): **hop 1** emails the **old/current**
  address a confirmation link (new `ChangeEmail` template → `sendChangeEmailConfirmationEmail`);
  approving it makes Better Auth email the **new** address its own verification (**hop 2**, reuses
  `VerifyEmail`) which applies the change — so the move needs control of **both** addresses
  (defends a hijacked session) · `ChangeEmailForm` copy points at the current inbox · graceful:
  fires only for a *verified* current email, so email-unset keeps the immediate path.
- **M4 (CSP nonce upgrade as a verified recipe) shipped** — **a reversal of D4, not a flip.**
  Shipped the gold-standard `script-src 'nonce-…' 'strict-dynamic'` upgrade in-repo as
  **`apps/web/src/proxy.csp-nonce.ts.example`** — a drop-in replacement for `proxy.ts` (keeps the
  auth-cookie gate; adds per-request nonce, forwarded request CSP/`x-nonce` so Next auto-nonces
  its scripts, response CSP, broadened matcher). The `.ts.example` is **inert** (Next never loads
  it; out of lint/type-check), so the default static-CSP / PPR posture is byte-for-byte unchanged.
  **Key finding (verified):** a per-request nonce lives in the document shell's inline scripts, so
  it can't coexist with `cacheComponents: true` — the layout `headers()` read *fails the build* on
  `/_not-found`. Adopting the recipe therefore **reverses D4** (cacheComponents off + remove the
  `post-stats.tsx` `"use cache"` + the `post.ts` `updateTag` calls); the `.example`, SECURITY.md,
  and a new DECISIONS.md entry (with the (B) document-only / (C) Suspense-coexistence alternatives)
  all spell that out. Also corrected SECURITY.md's stale "there is no middleware" claim (a
  narrow-matched auth `proxy.ts` exists). **Verified end-to-end** on a prod `:3100` build (recipe +
  D4 unwind temporarily applied): per-request `'nonce-…' 'strict-dynamic'` CSP, no script
  `'unsafe-inline'`, all 27 `<script>` tags carried the matching nonce, `/` flipped static→dynamic;
  all temp edits reverted, default build unchanged. **Live Resend send N/A** (no browser-render
  check needed — header/HTML asserted via curl).
- **Tier-2 D8 (Turbo remote cache, opt-in, document-only) shipped** — closed the lone remaining
  Tier 2 item. New [DEPLOYMENT.md → Remote caching](../context/DEPLOYMENT.md#remote-caching-turborepo-opt-in)
  documents the Vercel-hosted (`turbo login`/`link`) + self-hosted (`TURBO_API`/`TURBO_TOKEN`/
  `TURBO_TEAM`) + CI-wiring + HMAC-signing (`TURBO_REMOTE_CACHE_SIGNATURE_KEY`) paths, all **off by
  default**. `turbo.json` unchanged (its per-task `inputs`/`outputs` are the prerequisite, already
  present); `.turbo/` already gitignored. STACK.md `turbo` row cross-links it. Verified against
  turbo **2.9.18** (`login`/`link`/`run --help`); no runtime surface, so no `:3100` check — full
  gate (lint·type-check·build) green.
- **M7 (email-change defense-in-depth) shipped** — on top of M6. `auth.ts` base64url-decodes the
  verification token's `requestType` (`getEmailChangeFromToken`; JWT already Better-Auth-verified,
  no new dep) to tell a change-verify from a sign-up verify, then: **(b)** hop-2 uses a dedicated
  **`VerifyNewEmail`** template ("confirm your new address") instead of reusing `VerifyEmail`;
  **(a)** on completion the **old** address gets an out-of-band **`EmailChangedNotice`** ("your
  email was changed"); **(c)** completion revokes the account's **other sessions**
  (`auth.api.revokeOtherSessions`, like `changePassword`). A change completion **skips the Welcome
  email** (welcome stays sign-up-only). All graceful (sends no-op email-unset, revoke best-effort,
  `allSettled`). Verified live: full two-hop click-through on a dev server (hop-2 → new-address
  template, old-address notice, sessions 3→1) + prod-`:3100` no-regression on the immediate path.
  **Live Resend send unverified** (no creds — same tracked gap as M6).

## Audit backlog — 100/100 pass (P0–P3, 2026-07-02 → 05) — archived record

> Archived 2026-07-06 (doc audit): the completed backlog checklist from the former
> `docs/PHASE_3_IDEAS.md` (since renamed [../BACKLOG.md](../BACKLOG.md)) and the
> pre-slim Backlog rows from [../PROJECT_STATUS.md](../PROJECT_STATUS.md)'s
> build-progress table — both preserved verbatim below. The living compact record is
> the one-line Backlog rows that remain in PROJECT_STATUS.

> Work top-down; tick items as they ship. Sizes: **S** < 1h · **M** ~half-day · **L** day+.
> P0 = real defects; P1 = small, sharp hardening; P2 = production-starter feature gaps;
> P3 = test depth + demo polish. Each item is scoped to be one plan → sign-off → build step
> (batch the two P0s into one step).

### P0 — Fix first (real defects)

- [x] **P0-1 (S) Account-page copy bug (verified-user email change).** The static helper
  under `ChangeEmailForm` says the confirmation link goes to the **new** address — but
  hop-1 of the M6 two-hop goes to the **current/old** address, and the change applies on
  hop-2, not on opening hop-1. Fix the ternary copy
  (`apps/web/src/app/(dashboard)/account/page.tsx` ~L62–66). The form's own
  `confirmation-sent` success copy is already correct — mirror it.
- [x] **P0-2 (S) Open-redirect hardening in `safeRedirectPath`.** A crafted
  `?redirectTo=/\evil.com` passes the current `startsWith("/") && !startsWith("//")`
  checks, and WHATWG URL parsing normalizes `\` → `/` (→ protocol-relative → off-origin
  navigation after login). Also reject a backslash second char
  (`apps/web/src/lib/auth-redirect.ts`), add unit tests (incl. the `%5C`-encoded form),
  and add the module to the web coverage `include`.

### P1 — High-value hardening (small, sharp)

- [x] **P1-1 (S/M) DB indexes migration.** The keyset-paginated `post.list` orders by
  `(created_at desc, id desc)` with no matching composite index, and Postgres does
  **not** auto-index FK referencing columns — cascades/joins scan. One migration:
  composite `posts(created_at desc, id desc)` + FK indexes on `posts.author_id`,
  `session.user_id`, `account.user_id`, `uploads.user_id`, `subscriptions.user_id`.
  The copy-me template should teach that keyset pagination needs its index (DATABASE.md).
- [x] **P1-2 (S) Rate-limit `reindexPosts` (and decide: admin-gate?).** It's a full-table
  scan + bulk index write, currently unlimited for **any** signed-in user
  (`apps/web/src/server/actions/post.ts`). Add the same per-user `rateLimit` the other
  write actions use; consider `requireAdmin()` for a real app (document the choice).
  _Decision (2026-07-02): kept any-signed-in-user, capped 3/min per user (tighter than
  create/update's 10/min) — the `/search` demo + `db:seed` flow depend on the button and
  the op is an idempotent upsert repair; the real-app `requireAdmin()` swap is documented
  in SERVICES.md._
- [x] **P1-3 (S) Plain-text email part.** `send()` passes only `react`; add a `text`
  fallback via `@react-email/render`'s `plainText` for deliverability/spam scoring
  (`packages/email/src/send.tsx`).
  _Shipped 2026-07-02: every send is multipart (best-effort — falls back to HTML-only if
  the text render throws). Verified via `email export --plainText` (all 6 templates) and
  a live Resend send whose delivered text/plain part carried the untracked raw link._
- [x] **P1-4 (S) Env-schema polish.** `EMAIL_FROM` → `z.email().optional()`; consider
  validating `AUTH_TRUSTED_ORIGINS` entries as URLs after splitting
  (`apps/web/src/env.ts`).
  _Shipped 2026-07-02, three deliberate deviations from the literal wording:
  `EMAIL_FROM` accepts a bare address **or** `Name <address>` (Resend's canonical
  example form — strict `z.email()` would reject a value the provider takes);
  `AUTH_TRUSTED_ORIGINS` entries strict-fail at boot unless URL-parseable or
  `*`-wildcard (Better Auth matches wildcards/deep links itself — never false-reject
  them; a silently dropped typo'd origin would be an invisible CSRF misconfig, so
  fail > warn); `NEXT_PUBLIC_SENTRY_DSN` → `z.url()` folded in (same defect class).
  Both stay `.optional()` — graceful degradation covers unset, not garbage. Schemas
  live in `lib/env-schema.ts` (env.ts runs `createEnv()` at import → untestable),
  unit-tested + added to the web coverage gate._
- [x] **P1-5 (S) SHA-pin GitHub Actions.** Workflow actions are tag-pinned (`@v4`/`@v5`
  — mutable refs); pin to full commit SHAs and add Renovate's
  `helpers:pinGitHubActionDigests` preset so they stay updated under the same 7-day age
  gate. Matches the repo's supply-chain discipline (`.github/workflows/*`,
  `.github/renovate.json`).
  _Shipped 2026-07-02: all 6 actions pinned to the newest ≥7-day-old release per
  major line, resolved + cross-checked via the GitHub API (`git ls-remote` peeled
  tags), `# vX.Y.Z` comments in Renovate's convention. Notes: the age rule put
  `github/codeql-action` at v3.36.2 (v3.36.3 published same-day); pnpm/codecov
  moving major tags had drifted off any release tag, so those pin the latest
  release anchor. Verified by CI running green on the pinned digests +
  `renovate-config-validator`._
- [x] **P1-6 (S) COOP header.** Add `Cross-Origin-Opener-Policy: same-origin` to
  `securityHeaders` — safe here (OAuth + Stripe hosted checkout are full redirects, no
  cross-origin popups). Evaluate CORP/COEP and document why they're omitted
  (`apps/web/next.config.ts` + SECURITY.md).
  _Shipped 2026-07-02: plain `same-origin`, dev + prod (code-verified: zero
  `window.open`/`opener`/`target="_blank"` in the repo; both hand-offs are same-tab
  top-level redirects, which COOP doesn't touch — PostHog's toolbar uses a URL
  fragment, so it survives too). CORP + COEP documented as deliberate omissions in
  SECURITY.md (COEP would break Stripe frames/`ufs.sh` images for an isolation
  capability nothing needs; blanket CORP would invisibly break the common
  logo-in-email fork move — documented as a one-line opt-in instead). Header set now
  regression-guarded by `e2e/security-headers.spec.ts`; live-verified on a fresh
  :3100 prod build (header on `/`, `/login`, `/billing`; `/ingest` proxy still 200 —
  Next doesn't stamp custom headers on externally-rewritten responses, harmless since
  COOP governs documents only; full E2E lane green under COOP)._
- [x] **P1-7 (S) Audit-log admin mutations.** `setUserRole` emits no structured log; add
  a `log.info` with actor/target/old→new role so role changes are traceable in the
  existing BetterStack/console pipeline (`apps/web/src/server/actions/admin.ts`).
  _Shipped 2026-07-02: `log.info("admin.setUserRole", { actorId, targetId, oldRole,
  newRole })` on every applied change — IDs only (no email PII in the sink), success-only
  (deny paths stay log-free; documented as a one-line fork add in AUTH.md). The old-role
  read needed for old→new also fixed a latent quirk: a nonexistent target now returns
  `{ error: "User not found" }` instead of silently "succeeding" on a zero-row update.
  Unit tests extended 5→6 (log fires with exact fields on success, never on deny/not-found
  paths); live-verified by clicking the real `/admin` role-change UI (Playwright-driven)
  against a fresh prod build and observing the structured line — all four fields — in the
  captured server console._

### P2 — Feature completeness (production-starter gaps)

- [x] **P2-1 (M) Account: active-sessions list + revoke.** A sessions card on `/account`
  via `auth.api.listSessions` / `revokeSession` — pairs with the M7
  revoke-on-email-change posture and makes the session model visible/controllable.
  _Shipped 2026-07-03, one deviation from the literal wording: the LIST is a direct
  `session`-table read in the page, NOT `auth.api.listSessions` — that endpoint 403s
  for sessions older than `freshAge` (24h default), which would break the card for
  anyone signed in longer; revokes stay on `authClient.revokeSession`/
  `revokeOtherSessions` (ownership-checked, cookie-cache-proof). Includes a
  "Sign out all other sessions" button, "Current session" badge (token nulled
  client-bound), `describeUserAgent` device labels (in-repo helper, unit-tested +
  coverage-gated), and optimistic row removal — the UI must not gate on
  `router.refresh()` committing (Next 16.2.9 race, documented in AUTH.md). Live-verified
  with two signed-in contexts against a fresh :3100 prod build (both revoke paths:
  authoritative get-session null + re-gate to /login + DB rows gone) and
  regression-guarded by `e2e/account-sessions.spec.ts`._
- [x] **P2-2 (M) Account deletion.** Better Auth `user.deleteUser` flow —
  verification-gated when email is configured, immediate when not (mirrors
  `changeEmail`'s graceful split). DB rows already cascade; document the Stripe caveat
  (cancel/ignore the subscription row) in AUTH.md/SERVICES.md.
  _Shipped 2026-07-03: `/account` danger-zone `DeleteAccountCard` → `authClient.deleteUser`
  (`/delete-user` rate-limited 3/min). The split is config-time (per-deployment, not
  per-user): `sendDeleteAccountVerification` is registered only when `isEmailConfigured()`
  — verified in the 1.6.20 dist that when registered it ALWAYS wins (even a valid password
  only gates the email send, it never deletes in place), and when email is unset it must
  NOT be registered or deletion needs an undeliverable link. Intent gates: credential
  users type their password (verified server-side FIRST, so a hijacked session can't even
  trigger the email; also skips the no-password session-freshness gate, `freshAge` 24h →
  `SESSION_EXPIRED`, mapped to friendly copy for the OAuth-only phrase variant). Emailed
  link = one-time token (24h), completes via `/delete-user/callback` which requires an
  active session in the clicking browser, then redirects to `/goodbye` (new public page);
  the immediate path does a full `window.location.assign` (never gate on router.refresh).
  `afterDelete` logs `[auth] account.deleted` (P1-7 posture). Stripe caveat documented in
  SERVICES.md + an analogous NEW Uploadthing caveat (files persist at `ufs.sh`; wire
  `UTApi.deleteFiles` into `beforeDelete` after P2-3). Live-verified on a fresh :3100 prod
  build, both paths: immediate (API + UI via the spec against :3100 — wrong password 400s,
  right password deletes; authoritative get-session null; psql proved user + seeded bait
  rows in posts/uploads/subscriptions all cascade-deleted; sign-in with deleted creds
  401s; audit line in stdout) and verification-gated (real Resend send to a real inbox,
  multipart; user + token intact until the link was opened with the session cookie → 302
  `/goodbye`, rows gone, token consumed, reuse 404s). Regression-guarded by
  `e2e/account-deletion.spec.ts`._
- [x] **P2-3 (M) Uploads read-path + delete.** `/uploads` writes to the `uploads` table
  (D9) but never reads it: list the signed-in user's uploads, add delete
  (`UTApi.deleteFiles` + row delete), and a per-user `rateLimit` in the upload
  middleware — completes the D9 loop.
  _Shipped 2026-07-03: signed-in `/uploads` gets a server-rendered "Your uploads" card
  (direct table read, P2-1 sessions pattern; `image/*` thumbnails) with per-row Delete via
  `deleteUpload` (`server/actions/uploads.ts` — session gate → 10/min per-user rateLimit →
  ownership check → REMOTE-FIRST, fail-closed when configured: the row only goes after
  `UTApi.deleteFiles` succeeds, so storage errors never orphan a served file; token unset →
  row-only delete). `UTApi` behind `getUTApi()`/`isUploadthingConfigured()`
  (`lib/uploadthing-api.ts`, the lazy getStripe pattern — 7.7.4 resolves the token per
  request, not at construction). Upload middleware rate-limited 10/min per user. BONUS —
  closes the P2-2 Uploadthing caveat: account deletion now cleans up remote files via a new
  `delete-uploads` `@repo/jobs` job (D7 pattern; `beforeDelete` captures keys while rows
  exist → `afterDelete` enqueues only once the account is really gone → worker
  `deleteFiles`, idempotent under retries, graceful "skipped" no-op when unconfigured).
  Unit-tested (8 action tests, coverage-gated at 100% lines; 4 job-handler tests). No live
  `UPLOADTHING_TOKEN` on this box (Phase 4 pending), so live-verified at the degraded
  depth on a fresh :3100 prod build: psql-seeded rows → real-UI list (thumbnail + file
  chip) → row-only delete (optimistic removal + reload truth) → account deletion enqueued
  exactly the surviving key into `pgboss.job` → worker drained it with the graceful-skip
  log, job `completed`. The configured full loop (upload → list → delete with the file
  actually leaving `ufs.sh`) is a pending row for VERIFICATION.md Phase 4._
- [x] **P2-4 (M) Stripe depth.** (a) Reuse the recorded `stripeCustomerId` as `customer`
  on repeat checkouts instead of `customer_email` (avoids duplicate Stripe customers);
  (b) billing-portal Server Action (`billingPortal.sessions.create`) + a "Manage
  billing" button; (c) handle `invoice.payment_failed` → status sync on the
  `subscriptions` row.
  _Shipped 2026-07-03: (a) `createCheckoutSession` reads the user's **latest-created**
  `subscriptions` row (any recorded id prevents duplicate customers; latest ≈ active,
  simple + deterministic) → `customer: stripeCustomerId`, else `customer_email` — the
  two are mutually exclusive on the API, exactly one is sent; the Stripe call is now
  try/caught → typed error (a reused customer deleted in the Dashboard would otherwise
  surface as a masked action failure). (b) `createBillingPortalSession` mirrors the
  checkout action (session gate → 5/min per-user rateLimit → config gate → latest row,
  **no row → typed "No billing history"** since actions are public endpoints) →
  `billingPortal.sessions.create({ customer, return_url: /billing })`; `/billing` gets
  the /uploads server-read pattern — signed-in + row exists renders a "Your
  subscription" card (status + renewal date from the row already in hand) with a
  `ManageBillingButton` (SubscribeButton clone). Portal needs a saved Dashboard
  portal configuration (test mode ships a default) — SERVICES.md. (c) verified against
  the INSTALLED stripe 22.2.2 types: the pinned API version has **no top-level
  `invoice.subscription`** — the ref is `invoice.parent.subscription_details
  .subscription`; handler extracts it via the existing `idOf` (skips subscription-less
  invoices), `subscriptions.retrieve()`s for the authoritative post-dunning status
  (`past_due`/`canceled`/`unpaid` per settings — never hardcoded) and updates by id
  (no-op if unrecorded). `payment_failed` only — `customer.subscription.updated`
  already syncs the status transition (documented as belt-and-braces + the dunning
  hook a real app extends). 13 new `billing.test.ts` action tests + billing.ts into
  the coverage gate (partially completes P3-4; remainder = `user.ts`), 3 new webhook
  tests (string/object parent ref + non-subscription no-op). No Stripe keys on this
  box → live-verified at the degraded depth on a fresh :3100 prod build (Playwright:
  signed-out no card + "Unauthorized"; signed-in no row no card + typed unconfigured;
  psql-seeded row → card + "Status: active · renews …" + Manage billing → typed
  unconfigured; user delete re-confirmed the row cascade). Full configured loop
  (portal round-trip, `stripe trigger invoice.payment_failed`, no-duplicate-customer)
  → VERIFICATION.md Phase 5 rows._
- [x] **P2-5 (S/M) PostHog user identification.** Wire `posthog.identify(user.id, { email })`
  after sign-in and `posthog.reset()` on sign-out so client events tie to users
  (server-side flag checks already take a `distinctId`).
  _Shipped 2026-07-03, one structural deviation from the literal wording: a **session
  watcher** (`PostHogAuthSync` inside the provider's configured branch, subscribed to
  `useSession`), NOT calls in the sign-in forms — OAuth sign-in returns via a top-level
  redirect whose success path never runs a client callback (Google/GitHub users would
  stay anonymous forever), and sessions also end outside the sign-out button (remote
  revoke P2-1, account deletion P2-2). Identify fires when a session appears while
  PostHog holds an anonymous id (merges pre-login events; id = the server flags'
  `distinctId`, one person profile) with `{ email, name }` (name omitted when empty);
  reset fires on a sign-out transition only — an expired-session reopen deliberately
  doesn't reset (PostHog ties reset to explicit logout); a direct user-A→B swap resets
  before re-identifying so profiles never merge. Decision logic extracted to
  `lib/posthog-identity.ts` (7 unit tests, coverage-gated — the user-agent.ts pattern);
  unconfigured → watcher never mounts, zero cost. API surface verified in the installed
  posthog-js 1.391.2 (`_isIdentified` is `@internal` — avoided; ref-tracked state
  instead). No PostHog key on this box → degraded-depth live-verified on a fresh :3100
  prod build (full signed-out→in→out loop via real pages, auth POSTs API-driven per the
  :3100 origin recipe; ZERO analytics-shaped requests, flows intact). The configured
  identify/reset loop is a new VERIFICATION.md Phase-4 PostHog row._
- [x] **P2-6 (S) Resend-verification affordance.** The signup "check your inbox" state
  has no resend button; add one via `authClient.sendVerificationEmail` (the endpoint is
  already rate-limited 3/min in `auth.ts`).
  _Shipped 2026-07-03: a "Resend verification email" button in the signup form's `sentTo`
  branch (pending → transient "Sent" → auto-revert; errors render inline). The endpoint is
  **email-keyed** (`{ email, callbackURL? }`, verified in the installed better-auth 1.6.20
  dist) — required, because in this state the user can't have a session
  (`requireEmailVerification` blocks sign-in); the sessionless path only sends to an
  existing unverified address (constant-time floor, no enumeration). The existing 3/min
  server cap surfaces inline on the 4th click — no server change. **callbackURL decision:**
  both `signUp.email` and the resend now pass `callbackURL: redirectTo` (default
  `/dashboard`) — pre-change links landed on `/` (confirmed empirically: an earlier
  delivered email carries `callbackURL=%2F`), and with `autoSignInAfterVerification` the
  click now lands **signed in on `/dashboard`**. **Non-goal (documented):** the login form's
  "email not verified" error gets no sibling resend affordance — an easy fork add via the
  same email-keyed call. Live-verified end-to-end on a fresh prod build served on **:3000**
  (origin-exact, so real button clicks pass Better Auth's origin check — :3100 would 403
  them): signup → sentTo state → resend → a second real Resend delivery in the real inbox
  → resent-link click → verified + signed-in `/dashboard` landing (session row created by
  the click; DB flag flipped) → 4 rapid clicks → `200,200,200,429` + inline "Too many
  requests" error. Gotcha for future live checks: the `onboarding@resend.dev` sandbox
  sender 403s **subaddressed** recipients (`+tag`) too, and the auth wiring swallows the
  typed send error — endpoint 200s, nothing delivered (noted in VERIFICATION.md). No new
  E2E: CI runs email-unconfigured, so the `sentTo` state never renders there._
- [x] **P2-7 (S/M) Meilisearch index settings as code.** The index is created with engine
  defaults (every attribute searchable, incl. `id`); pin
  `searchableAttributes`/`displayedAttributes`/ranking in `reindexPosts` (or a settings
  helper) so the index shape is deterministic (`apps/web/src/lib/search.ts` +
  `server/actions/post.ts`).
  _Shipped 2026-07-03: `POSTS_INDEX_SETTINGS` in `lib/search.ts` (typed against the
  installed SDK's `Settings`, meilisearch 0.58.0): `searchableAttributes: ["title",
  "content"]` — **order matters**, the attribute-order ranking rule scores title hits
  above content hits; `id` excluded (the named defect — a live id-fragment query matched
  documents pre-fix); `displayedAttributes: ["id","title","content"]` (the UI keys hits
  on `id`); `rankingRules` pinned to the engine defaults. One deviation from the carried
  plan, found live: the compose-pinned engine (v1.48.1) defaults to SEVEN rules —
  `words, typo, proximity, attributeRank, sort, wordPosition, exactness` — v1.48 split
  the legacy `attribute` rule into `attributeRank` + `wordPosition` (legacy name still
  accepted; the six-rule list in the plan was the historical default), verified against
  a fresh scratch index on the running engine. `reindexPosts` applies the settings
  UNCONDITIONALLY before `addDocuments` (`updateSettings(...).waitTask()`) — reindex is
  the idempotent repair path, so it also repairs a default-shaped index; settings
  failures surface through the existing try/catch → typed error. **Deliberate caveat:**
  an index first created by `createPost`'s single-doc write keeps engine defaults until
  the first reindex — no settings roundtrip on a user-facing write (documented in
  SERVICES.md). `createPost`/tRPC read unchanged. +3 unit tests (28 total in
  post.test.ts): settings passed by identity BEFORE documents (invocation order), pinned
  even on an empty DB, settings failure → typed error. Live-verified on a fresh :3000
  prod build (RESEND_API_KEY blanked — note `$env:X=""` DELETES the var in PowerShell,
  the blank must be set from bash): BEFORE `["*"]` (full id + 10-char prefix matched via
  the real UI), real Reindex click → "Reindexed 8 posts", AFTER = the pinned values
  exactly, id + fragment → 0 hits, title/content queries still render results. Gotcha:
  the app's 30s TanStack `staleTime` makes a repeated identical query render from the
  client cache — reload before re-asserting (a first run false-failed on this;
  Meilisearch direct confirmed 0 hits)._

### P3 — Test depth & demo polish

- [x] **P3-1 (M) `account.spec.ts` E2E.** The M3 surface has zero E2E coverage: name
  change, password change (+ re-login with the new password), immediate email change
  (email-unset path).
  _Shipped 2026-07-04: `e2e/account.spec.ts`, a **serial** one-user lifecycle
  (`test.describe.configure({ mode: "serial" })`, one shared browser context): a single
  sign-up keeps the file inside Better Auth's 5-per-60s sign-up limiter, and later tests
  build on earlier mutations — the final re-login uses the changed email AND the changed
  password. Four tests: name change; immediate email change (CI is email-unconfigured →
  `emailVerified=false` → Better Auth applies it in place; the Profile card renders
  `<new address> · unverified` after reload); wrong current password rejected inline
  (alert anchored INSIDE the password form — bare `role=alert` collides with Next's
  route announcer, and the message copy is Better Auth's); password change
  (`revokeOtherSessions`) → sign-out → old password rejected on /login → changed email +
  changed password land on /dashboard. Design finding that shaped the assertions:
  `updateUserName` writes the user table directly, so the Step-19 cookie cache (5 min)
  legitimately re-renders STALE session data on a plain reload — each mutation is
  asserted via `GET /api/auth/get-session?disableCookieCache=true` (the P2-1 probe),
  which reads the DB authoritatively and re-issues the cookie cache, making the
  subsequent reload deterministic; success is asserted on each form's `role=status`
  copy, never on `router.refresh()` committing (the Next 16.2.9 race). No app-code
  changes. Verified: full gate + a CI-mirroring local run (`CI=true`, blank
  `RESEND_API_KEY` from bash) — all 4 passed first-attempt inside the full 6.3m serial
  suite; the run's only red was the pre-existing admin.spec nav-click flake (untouched
  by this change; it reproduced 3-retries-deep even isolated on this Windows box — the
  known false-deterministic local signature — while the sibling admin test passed and
  the same spec is green on CI, the arbiter), plus a retry-absorbed posts.spec signup
  flake. Pattern documented in TESTING.md → "Cookie-cache staleness"._
- [x] **P3-2 (S) a11y expansion.** `a11y.spec.ts` scans only `/` and `/posts`; add
  `/login`, `/signup`, and signed-in `/account` + `/admin`.
  _Shipped 2026-07-04: four new scans reusing the existing `blockingViolations` helper
  unchanged (full-page goto + axe wcag2a/wcag2aa, critical+serious gate). `/login` and
  `/signup` are plain public scans; `/account` + `/admin` share ONE test and ONE signup
  — `makeTestUser("a11y")` + `promoteToAdmin` (the sanctioned direct-DB path;
  `requireAdmin` reads the role fresh from the DB on each request, so no re-login after
  promotion — same ordering admin.spec runs green with on CI) — keeping the file
  (first alphabetically, ahead of the account-\* signups, under CI's `workers: 1`) to a
  single hit on the 5/60s sign-up limiter; scanning /admin via the helper's full-page
  goto also sidesteps the known admin nav-click box-flake. **axe found zero
  critical/serious violations on all four pages** — no UI changes shipped. Verified:
  full gate + CI-mirror local E2E (`CI=true`, blank `RESEND_API_KEY` from bash): all 5
  a11y tests passed first-attempt; the run's only red was the known-noise admin.spec
  nav-click local flake plus a retry-absorbed posts.spec signup flake (both
  pre-existing, untouched by this change)._
- [x] **P3-3 (M) `packages/auth` unit tests.** The subtlest logic in the repo —
  `getEmailChangeFromToken` (JWT payload decode + `requestType` branch),
  `trustedOrigins`, `socialProviders` — is untested; extract to a testable module and
  cover the edge cases (garbled token, missing claims, extra origins parsing).
  _Shipped 2026-07-04: the four pure, env-driven helpers (`socialProviders`,
  `trustedOrigins`, `getEmailChangeFromToken`, `tokenFromRequest`) moved **verbatim**
  — doc comments included, zero behavior change — from `auth.ts` into
  `packages/auth/src/config.ts`: no `@repo/*` imports, no `server-only`; the module
  touches only `process.env`/`Buffer`/`URL` plus a type-only `BetterAuthOptions`
  import, so the new `vitest.config.ts` mirrors `@repo/jobs`' **minus** its
  server-only alias stub. 22 hermetic tests in `src/config.test.ts` (every
  env-reading test pins ALL the vars it touches via `vi.stubEnv`, incl. stubbing to
  undefined = unset): token decode — undefined/empty/garbled/truncated/non-JSON
  payload/sign-up-shaped/incomplete claims → `null`, valid change-email →
  `{oldEmail,newEmail}`; origins — default, base-alone, one/many extras, trim +
  empty-drop, dedupe-vs-base (order asserted exactly); providers —
  none/id-without-secret → not registered/one/both; `tokenFromRequest` — no
  request/unparseable url (Better Auth's callback types only promise a `url`, so the
  test passes a loose stub — the real `Request` constructor rejects malformed
  URLs)/no param/present. Coverage `include` = `src/config.ts` at the house
  90/90/80/90 thresholds — actual **100% on all four metrics**; turbo picked the new
  `test`/`test:coverage` scripts up automatically (5th package in `pnpm test`; CI's
  `pnpm test:coverage` + the `packages/*/coverage/` artifact glob both cover it with
  no workflow change). devDeps `vitest`/`@vitest/coverage-v8` `^4.1.9`
  (version-checked 2026-07-04: latest 4.1.9, published 2026-06-15, passes the 7-day
  rule; matches web + jobs). Verified: full gate green; live check = CI's E2E lane
  (every signup exercises the recomposed `auth.ts`)._
- [x] **P3-4 (S) Coverage-include expansion.** Add `server/actions/billing.ts`,
  `server/actions/user.ts`, `lib/auth-redirect.ts` (+ their tests) to the web coverage
  gate (`apps/web/vitest.config.ts` currently gates 4 modules).
  _Mostly absorbed en route: `lib/auth-redirect.ts` shipped with P0-2, `billing.ts`
  (+13 action tests) with P2-4 — remaining scope is `server/actions/user.ts` only._
  _Shipped 2026-07-04 (the remainder): `user.test.ts` — 5 tests mirroring the
  `admin.test.ts` mock pattern (`@repo/auth` getSession, `@repo/db` update chain,
  `next/headers`, `next/cache` mocked; the real `updateNameSchema` + `user` table stay
  unmocked): no session → Unauthorized with no write/revalidate; empty name → "Name is
  required"; missing field; 101-char name → the max message; success persists the
  **trimmed** name via one `db.update(user)` and revalidates BOTH `/dashboard` +
  `/account`. `src/server/actions/user.ts` added to the web coverage `include`
  (11 modules now) — 100% stmts/lines/funcs, 83.33% branches (user.ts:23's
  `?? "Invalid input"` right side is the documented unreachable defensive-fallback
  class); aggregate branches 94.08% over the 88 floor, no threshold change. Folded-in
  doc-drift fix: TESTING.md's web coverage row still said "the five tested modules" —
  now lists all eleven. No product-code change; full gate green, CI's verify-lane
  coverage step is the observable check._
- [x] **P3-5 (M) Admin pagination.** `/admin` caps at 50 users with no paging; reuse the
  D1 keyset pattern (docs already flag "a real admin panel would paginate").
  _Shipped 2026-07-05: `/admin` keyset-paginates at PAGE_SIZE 20 in the page's
  Server-Action flavour — a `?after=` URL cursor (`lib/keyset-cursor.ts`: `"<iso>_<id>"`,
  split at the FIRST `_` so ids may contain underscores; STRICT round-trip decode → any
  garbage yields null → page 1, never an error; 7 unit tests, the 12th module in the web
  coverage include) drives the same `or(lt, and(eq, lt))` predicate + limit+1 probe as
  post.list, with plain server-rendered "Older →"/"← Newest" `<Link>`s (zero client JS)
  and a graceful past-the-end empty page. Migration 0006 adds `user_created_at_id_idx`
  (`created_at DESC, id DESC` — same NULLS-FIRST form as 0005); live EXPLAIN showed the
  planner picking it (Index Scan, no Sort) at just 321 rows. `admin.listUsers` upgraded
  to post.list's `{items, nextCursor}` cursor shape (consumer grep first: zero code
  callers, so no breakage). New `e2e/admin-pagination.spec.ts` — separate from the
  flake-prone admin.spec, full-page gotos only, ONE signup + promoteToAdmin + 25
  direct-DB bait users (seed/cleanup helpers beside promoteToAdmin in e2e/support/db.ts);
  assertions are DB-population-independent (exact-20 full pages, cross-page
  email-uniqueness walk, garbled + past-the-end cursors), passed first-attempt against a
  347-user DB. Live loop on a fresh :3000 prod build: real-UI signup → psql promote +
  25-row seed → real Older/Newest clicks + degraded-cursor probes — 15/15 checks, and
  the page-1→2 boundary was the exact keyset continuation (ends bait-18, opens bait-19)._
- [x] **P3-6 (S) CSP violation reporting (opt-in recipe).** Document `report-uri` /
  `Report-To` → Sentry's security endpoint in SECURITY.md so CSP breakage is observable
  before it's user-reported.
  _Shipped 2026-07-05: new "CSP violation reporting (opt-in)" section in SECURITY.md —
  the M4-style recipe pattern. Sentry's security endpoint derived from
  `NEXT_PUBLIC_SENTRY_DSN` (`<origin>/api/<projectId>/security/?sentry_key=<key>`,
  verified against current Sentry docs; also ready-made under Project Settings →
  Security Headers), one copy-paste `next.config.ts` diff shipping BOTH mechanisms:
  legacy `report-uri` (deprecated, but the only directive pre-2026 Safari/Firefox
  understand; `application/csp-report`) AND `report-to` + `Reporting-Endpoints`
  (Baseline "newly available" only since March 2026; `application/reports+json`) —
  supporting browsers ignore report-uri, so nothing double-reports. Gated on the DSN
  env var: unset → both spreads contribute nothing, header set byte-identical
  (verified by `.next/routes-manifest.json` diff between builds). Reports are exempt
  from the page's own CSP by spec → zero `connect-src` change (observed live).
  Live-verified by applying the recipe ad hoc to a :3100 prod build against a local
  sink: real `fetch()` violation → the actual `application/csp-report` POST captured
  at the derived endpoint (body quoted in SECURITY.md); modern path CDP-verified to
  the browser's edge (`Network.enableReportingApi`: `csp-violation` queued for
  `csp-endpoint`) — found empirically that **Chromium's report uploader only
  delivers to trusted-https endpoints** (plain-http localhost refused; self-signed
  cert refused even with `--ignore-certificate-errors`/SPKI-list bypass flags —
  they don't apply to the uploader), which the real Sentry endpoint is; Sentry-side
  ingestion = a new VERIFICATION.md Phase-4 Sentry row. Fork gotcha documented:
  self-hosted/off-`*.sentry.io` DSNs need their host in `connect-src` for the SDK's
  own event POSTs (reports exempt, SDK fetches not — watched that exact violation
  fire). Commit ships docs only (ad-hoc config reverted; tmp drivers deleted);
  `e2e/security-headers.spec.ts` untouched (CI runs DSN-unset). **The audit backlog
  is COMPLETE.**_
>
> _History note: Tier 0 + C1–C4 + D1–D11, the 2026-06-26→27 maintenance audit (M1–M7), and the
> opt-in Turbo remote-cache note are **all shipped**. Their per-item tables (former Tiers 0–3 +
> "Shipped" list) were collapsed into PROJECT_STATUS + PHASE_HISTORY and removed from this file
> to keep the backlog forward-only — don't reintroduce the shipped-item log here._

### Pre-slim PROJECT_STATUS build-progress rows (verbatim)

| Steps | Area |
| --- | --- |
| Backlog · P0 | Account-page two-hop email-change copy fix (P0-1) · `safeRedirectPath` backslash open-redirect fix + unit tests + coverage gate (P0-2) |
| Backlog · P1 | DB indexes migration 0005: keyset composite `posts(created_at DESC, id DESC)` — NULLS FIRST to match plain `DESC`, or the planner ignores it — + 5 FK indexes; before/after EXPLAIN-verified (P1-1) · `reindexPosts` rate-limited 3/min per user, any-signed-in-user kept + real-app `requireAdmin()` swap documented, live-verified over-limit + index refresh (P1-2) · plain-text part on every `send()` via `render(..., { plainText: true })`, best-effort HTML-only fallback; verified via `email export --plainText` + a live send's delivered text/plain part (P1-3) · env-schema polish: `EMAIL_FROM` bare-or-`Name <address>`, `AUTH_TRUSTED_ORIGINS` entries URL-or-`*`-wildcard (strict-fail at boot), Sentry DSN `z.url()` — schemas in `lib/env-schema.ts`, unit-tested + coverage-gated; malformed-boot + unset-degradation live-verified (P1-4) · all 6 workflow actions SHA-pinned to the newest ≥7-day-old release per major (`# vX.Y.Z` comments), `helpers:pinGitHubActionDigests` added to Renovate; CI-green-on-digests + config-validator verified (P1-5) · `Cross-Origin-Opener-Policy: same-origin` added to `securityHeaders` (dev + prod) — safe as plain same-origin since OAuth + Stripe checkout are same-tab redirects and the repo opens no popups; CORP/COEP documented as deliberate omissions in SECURITY.md; unconditional header set regression-guarded by `e2e/security-headers.spec.ts`; live-verified on a fresh :3100 prod build (P1-6) · `setUserRole` audit log — `log.info("admin.setUserRole", { actorId, targetId, oldRole, newRole })` on every applied change (IDs only, success-only), pre-update role read returns typed "User not found" on a nonexistent target instead of a silent zero-row "success"; unit-tested + live-verified via the real `/admin` UI against a prod build (P1-7) |
| Backlog · P2 | `/account` **Sessions card** — active-sessions list (direct `session`-table read in the page; NOT `auth.api.listSessions`, which 403s past `freshAge` 24h) + per-session Revoke and "Sign out all other sessions" via `authClient.revokeSession`/`revokeOtherSessions` (ownership-checked, cookie-cache-proof); "Current session" badge (token nulled client-bound); `describeUserAgent` device labels (in-repo, unit-tested + coverage-gated); **optimistic row removal** — UI must not gate on `router.refresh()` committing (Next 16.2.9 race, see AUTH.md); revoked device converges ≤ cookie-cache 5 min, immediately on DB-backed reads; live-verified two-context revoke on a fresh :3100 prod build + `e2e/account-sessions.spec.ts` (P2-1) · `/account` **danger-zone account deletion** — `user.deleteUser` with a config-time graceful split: `sendDeleteAccountVerification` registered only when email is configured (when registered it ALWAYS wins — a valid password only gates the send; when email is unset it must not be registered or deletion needs an undeliverable link); password intent gate (verified before anything, skips the 24h freshness gate) or confirm-phrase for OAuth-only; one-time 24h link completes via `/delete-user/callback` (needs an active session in the clicking browser) → `/goodbye`; all five user-FK tables cascade (verified with seeded bait rows); Stripe caveat + new Uploadthing caveat documented (SERVICES.md); `afterDelete` audit line; `/delete-user` rate-limited 3/min; both paths live-verified on :3100 incl. a real-inbox Resend link click + `e2e/account-deletion.spec.ts` (P2-2) · `/uploads` **read path + delete** — signed-in "Your uploads" card (direct table read, `image/*` thumbnails) + `deleteUpload` Server Action (10/min per-user cap, ownership-checked, **remote-first fail-closed** when `UPLOADTHING_TOKEN` is set: the row only goes after `UTApi.deleteFiles` succeeds; token unset → row-only); upload middleware rate-limited 10/min; lazy `getUTApi()`/`isUploadthingConfigured()` helper; **closes P2-2's Uploadthing caveat** — account deletion enqueues a `delete-uploads` `@repo/jobs` job (`beforeDelete` captures keys, `afterDelete` enqueues post-deletion, worker `deleteFiles` idempotently, graceful skip when unconfigured); unit-tested + coverage-gated; live-verified no-token depth on :3100 (seeded rows → real-UI list/delete → deletion enqueued the surviving key → worker drained with the skip log); configured full loop pending Phase 4 (P2-3) · **Stripe depth** — repeat checkouts reuse the recorded Stripe customer (latest-created `subscriptions` row → `customer:`; first checkout → `customer_email`; mutually exclusive on the API; Stripe calls try/caught → typed errors) · `createBillingPortalSession` (checkout-action shape: 5/min per-user limit, config gate, no-row → typed "No billing history") + `/billing` "Your subscription" card (direct-table server read, status + renewal date) with **Manage billing** → Stripe-hosted portal (needs a saved Dashboard portal config; test mode ships a default) · `invoice.payment_failed` dunning sync — the pinned API version carries the ref at `invoice.parent.subscription_details.subscription`, NOT top-level `invoice.subscription` (verified in the installed 22.2.2 types); handler retrieves the subscription for the authoritative post-failure status and updates by id (no-op if unrecorded; `customer.subscription.updated` covers the transition — this is the extensible dunning hook) · 13 `billing.test.ts` action tests + billing.ts coverage-gated (P3-4 partial; remainder `user.ts`) + 3 webhook tests; degraded-depth live-verified on a fresh :3100 prod build (gating, status line, typed unconfigured errors); configured loop → Phase-5 rows (P2-4) · **PostHog user identification** — `PostHogAuthSync` session watcher inside the provider's configured branch (`useSession`-subscribed; unconfigured → never mounts, zero cost): identify when a session appears while PostHog holds an anonymous id (`{ email, name }`, id = the server flags' `distinctId` → one person profile, pre-login events merged), reset on a sign-out **transition** only (expired-session reopen deliberately doesn't reset; direct A→B swap resets first so profiles never merge) — a watcher, NOT per-form calls, because OAuth returns via a top-level redirect with no client success callback and sessions also end via remote revoke/account deletion; decision logic in `lib/posthog-identity.ts` (7 tests, coverage-gated); zero-analytics-traffic loop live-verified on :3100 unconfigured; configured identify/reset loop → a Phase-4 PostHog row (P2-5) · **resend-verification affordance** — "Resend verification email" button in the signup `sentTo` state via `authClient.sendVerificationEmail` (email-keyed `{ email, callbackURL? }` — the user can't have a session here since `requireEmailVerification` blocks sign-in; the sessionless send is enumeration-safe behind a constant-time floor), pending → transient "Sent" → inline error; the existing 3/min `/send-verification-email` cap surfaces inline on the 4th click (no server change) · `callbackURL: redirectTo` now passed by BOTH `signUp.email` and the resend, so verification links land the auto-signed-in user on `/dashboard` instead of `/` (old behavior confirmed from a pre-change delivered email) · login-form "email not verified" sibling affordance = documented non-goal · live-verified end-to-end on a fresh prod build on **:3000** (origin-exact so real button clicks pass the origin check; :3100 would 403 them): real inbox, second delivery, resent-link click → verified + signed-in `/dashboard`, `200,200,200,429` sequence with the inline rate-limit error; Resend-sandbox subaddress-rejection gotcha documented in VERIFICATION.md; no new E2E (CI is email-unconfigured — `sentTo` never renders) (P2-6) · **Meilisearch index settings as code** — `POSTS_INDEX_SETTINGS` in `lib/search.ts` (typed against the SDK's `Settings`, meilisearch 0.58.0): `searchableAttributes ["title","content"]` (order matters — `attributeRank` scores title hits above content; `id` excluded, the named defect: an id fragment matched documents), `displayedAttributes ["id","title","content"]` (the UI keys hits on `id`), `rankingRules` pinned to the compose-pinned engine's defaults — found live that v1.48.1 defaults to SEVEN rules (`attributeRank` + `wordPosition` replaced legacy `attribute`; the plan's six-rule list was the historical default; verified on a fresh scratch index) · applied UNCONDITIONALLY in `reindexPosts` before `addDocuments` (`updateSettings(...).waitTask()` — reindex is the idempotent repair path, so it also repairs a default-shaped index; failures → the existing typed error) · deliberate caveat: an index born from `createPost`'s single-doc write keeps engine defaults until the first reindex (no settings roundtrip on a user-facing write; SERVICES.md) · `createPost` + tRPC read unchanged · +3 unit tests, 28 total (settings-before-documents by invocation order, empty-DB still pins, settings failure → typed error) · live-verified on a fresh **:3000** prod build (blank `RESEND_API_KEY` from bash — PowerShell `$env:X=""` DELETES the var and the live key flips verification mode ON): BEFORE `["*"]` with full-id + 10-char-prefix matching via the real UI → real Reindex click ("Reindexed 8 posts") → AFTER = the pinned values exactly, id/fragment queries 0 hits, title/content queries still render; gotcha: the 30s TanStack `staleTime` re-renders an identical query from the client cache — reload before re-asserting (P2-7) — **P2 COMPLETE** |
| Backlog · P3 | `e2e/account.spec.ts` (P3-1) — **serial** one-user lifecycle (one sign-up stays inside the 5/60s limiter; later tests build on earlier mutations): name change · immediate email change (email-unconfigured path; Profile card shows `<new> · unverified`) · wrong-current-password inline rejection (alert anchored inside the password form — bare `role=alert` collides with Next's route announcer) · password change + re-login (old password rejected, changed email + password land on /dashboard) — each mutation asserted via `get-session?disableCookieCache=true` (the 5-min cookie cache legitimately serves STALE session data on plain reload; `updateUserName` writes the table directly), probe re-issues the cookie so the follow-up reload is deterministic; no app-code changes; 4/4 first-attempt in the CI-mirror suite (P3-1) · a11y expansion (P3-2) — `a11y.spec.ts` grows from 2 to 5 scans reusing `blockingViolations` unchanged: public `/login` + `/signup`, and signed-in `/account` + `/admin` in ONE test with ONE signup (`promoteToAdmin` after sign-up — `requireAdmin` reads the role fresh from the DB, no re-login; full-page `goto` scans sidestep the admin nav-click box-flake; the file runs first alphabetically, keeping its single signup ahead of the account-\* files under CI `workers: 1`); axe: zero critical/serious violations on all four new pages, no UI changes; all 5 a11y tests passed first-attempt in the CI-mirror run (P3-2) · `packages/auth` unit tests (P3-3) — the four pure env-driven config helpers (`socialProviders`, `trustedOrigins`, `getEmailChangeFromToken`, `tokenFromRequest`) extracted VERBATIM from `auth.ts` into `packages/auth/src/config.ts` (zero behavior change; no `@repo/*`/`server-only` imports — only process.env/Buffer/URL + a type-only `BetterAuthOptions`, so the new `vitest.config.ts` mirrors `@repo/jobs`' minus its server-only alias stub) · 22 hermetic tests (`vi.stubEnv` pins every var read, incl. undefined = unset): token-decode edge cases → null vs `{oldEmail,newEmail}`, origins parse/trim/dedupe with order asserted, provider registration pairs, `tokenFromRequest` graceful paths · coverage `include` = `src/config.ts`, house 90/90/80/90 thresholds, actual 100% ×4 · turbo auto-picked up the new `test`/`test:coverage` scripts (5th package in `pnpm test`; CI coverage artifact glob already matches) · devDeps `vitest`/`@vitest/coverage-v8` `^4.1.9` version-checked; live check = CI's E2E lane (every signup exercises the recomposed auth.ts) (P3-3) · coverage-include expansion remainder (P3-4) — `user.test.ts` (5 tests, admin.test.ts mock pattern; real `updateNameSchema` + `user` table): no-session/empty/missing/over-max rejections with no write, success persists the trimmed name via one scoped `db.update(user)` + revalidates `/dashboard` AND `/account` · `src/server/actions/user.ts` joins the web coverage include (11 modules; user.ts 100% stmts/lines/funcs, 83.33% branches — line 23's `?? "Invalid input"` is the documented unreachable defensive class; aggregate 94.08% branches over the 88 floor) · TESTING.md "five tested modules" drift fixed to the real eleven · no product-code change (P3-4) · admin keyset pagination (P3-5) — `/admin` pages the `user` table at PAGE_SIZE 20 (was an unpaginated 50-cap) with a `?after=` URL cursor (`lib/keyset-cursor.ts`: `"<iso>_<id>"`, split at the FIRST `_` so ids may contain underscores, STRICT round-trip decode — garbage yields null → page 1, never an error; 7 unit tests, the 12th web coverage module), the D1 `or(lt, and(eq, lt))` keyset predicate + limit+1 probe, and plain server-rendered "Older →"/"← Newest" `<Link>`s — zero client JS, the Server-Action flavour vs /posts' TanStack cursor; past-the-end cursor renders a graceful empty page with the recovery link · migration 0006 `user_created_at_id_idx` (created_at DESC, id DESC — 0005's NULLS-FIRST form; live EXPLAIN: planner picked it, Index Scan/no Sort, at just 321 rows) · `admin.listUsers` upgraded to post.list's `{items, nextCursor}` cursor shape (consumer grep FIRST: zero code callers → no breakage) · `e2e/admin-pagination.spec.ts` — separate file from the flake-prone admin.spec, full-page gotos only, ONE signup + promoteToAdmin + 25 direct-DB bait users (seed/cleanup helpers beside promoteToAdmin in e2e/support/db.ts), DB-population-independent assertions (exact-20 full pages, cross-page email-uniqueness walk, garbled + past-the-end cursor probes), first-attempt pass against a 347-user DB · live loop on a fresh :3000 prod build (bash-blanked RESEND_API_KEY): real-UI signup → psql promote + 25-row seed → REAL Older/Newest clicks + degraded-cursor probes, 15/15 checks, page-1→2 boundary = the exact keyset continuation (P3-5) · CSP violation reporting opt-in recipe (P3-6) — new SECURITY.md "CSP violation reporting" section (M4 recipe pattern): Sentry security endpoint derived from `NEXT_PUBLIC_SENTRY_DSN` (`<origin>/api/<projectId>/security/?sentry_key=<key>`, verified against current Sentry docs), one copy-paste next.config.ts diff shipping BOTH `report-uri` (the only pre-2026 Safari/Firefox path, `application/csp-report`) and `report-to` + `Reporting-Endpoints` (Baseline since 2026-03, `application/reports+json`; supporting browsers ignore report-uri — no double-reporting), gated on the DSN env — unset → byte-identical header set (routes-manifest diff between builds); reports are CSP-exempt by spec → zero connect-src change (observed live) · live check: recipe applied ad hoc to a :3100 prod build vs a local sink — real `fetch()` violation delivered the actual `application/csp-report` POST (body quoted in SECURITY.md); modern path CDP-verified to the browser edge (`csp-violation` queued for `csp-endpoint`) with the empirical finding that Chromium's report uploader delivers ONLY to trusted-https endpoints (plain-http localhost + self-signed both refused; cert-bypass flags don't apply) — the real Sentry endpoint is exactly that; Sentry-side ingestion → new VERIFICATION.md Phase-4 Sentry row · self-hosted-DSN connect-src gotcha documented · docs-only commit (ad-hoc config reverted) — **audit backlog COMPLETE** (P3-6) |

## Tier 4 — upgrade paths (Phase 4 + Band 1/2, 2026-07-05 → 08) — archived record

> Archived 2026-07-09 (doc audit): the verbose Phase-4 + Tier-4 rows moved verbatim out of
> [../PROJECT_STATUS.md](../PROJECT_STATUS.md)'s build-progress table, which now keeps only
> compact grouped rows (Band-1 `A1–A11`, Band-2 `A14–A16`, plus `B1`/`B2`/`B4`). Relative doc
> links were rebased to the archive (`../context/…`); nothing else changed. Feature-build work
> paused at **maintenance-only (G)** on 2026-07-09 — the remaining Tier-4 rows (A12/A13 local;
> A17–A22 + the externally-gated items) stay in [../BACKLOG.md](../BACKLOG.md).

| Group | Detail |
| --- | --- |
| Phase 4 · live SaaS | Resend · Sentry (+ source-maps) · BetterStack · PostHog · Uploadthing · OAuth (GitHub+Google) · Upstash Redis — **all verified live 2026-07-05→07** against real creds (per-section provenance banners in [VERIFICATION.md](../VERIFICATION.md); durable local-env/gotcha facts kept in working notes). Stripe = Phase 5 (deferred). |
| Tier 4 · B1 | **Compromised-password check (HIBP)** — `haveIBeenPwned()` plugin rejects known-breached passwords on `/sign-up/email` · `/change-password` · `/reset-password` (k-anonymity, no secret, fails closed). Live-verified 2026-07-07 on :3100 (breached → `400 PASSWORD_COMPROMISED`; fresh → `200`). See [context/AUTH.md](../context/AUTH.md) → Compromised-password check + [VERIFICATION.md](../VERIFICATION.md) Auth. |
| Tier 4 · B1 | **App-level rate-limit response headers** — the tRPC `rateLimitedProcedure` 429 now emits the standard `RateLimit-Limit/Remaining/Reset` + `Retry-After` (delta-seconds) via a shared `rateLimitHeaders()` helper (`lib/rate-limit.ts`), also applied to the Stripe webhook; a mutable `ctx.rateLimit.blocked` slot + the fetch handler's `responseMeta` carry it out of the thrown `TRPCError`. Auth routes keep Better Auth's own `X-Retry-After`. Live-verified 2026-07-08 on :3100 (200 → no headers; 21st hit → `429` with all four, `Reset`/`Retry-After` live). See [context/SECURITY.md](../context/SECURITY.md) → Rate limiting → 429 response headers. |
| Tier 4 · B1 | **Avatar upload** — `user.image` (schema-present, previously never written/rendered) now wires the verified Uploadthing integration to a real feature: a second file-router route `avatarUploader` (2 MB, auth+rate-limit gated) persists the photo to `user.image` in `onUploadComplete` + best-effort deletes the replaced file (`avatarKeyFromUrl` in `lib/avatar.ts`); the fail-**open** `removeUserAvatar` action nulls it. Rendered via a new `@repo/ui` `Avatar` primitive (no new dep — `radix-ui` meta-package) on the `/account` Profile card (`components/account/avatar-card.tsx`) **and** the dashboard-header user menu, both falling back to initials. Live-verified 2026-07-08 on a fresh prod build (render in header+card · Remove → column `NULL` · styled `UploadButton` · degrades with token unset). See [context/SERVICES.md](../context/SERVICES.md#uploadthing-file-uploads) + [VERIFICATION.md](../VERIFICATION.md) Uploadthing. |
| Tier 4 · B2 | **Two-factor auth (2FA / TOTP)** (`twoFactor()` plugin) — authenticator-app 2FA + single-use backup codes, in 3 steps: **(1)** schema `two_factor` + `user.two_factor_enabled` (migration 0009) + `twoFactor()`/`twoFactorClient()` wiring + `qrcode.react` + four `/two-factor/*` rate-limit rules; **(2)** the `/account` `TwoFactorCard` — password-gated enroll (QR + manual key + backup codes, activating only on the first verified code) / regenerate / disable, inline (not modal — the `@repo/ui` Dialog centering is broken for tall content under Tailwind v4 + `tw-animate-css`); **(3)** the **sign-in challenge** — the login form reads `signIn.email`'s `{ twoFactorRedirect }` and reveals an inline code step (`verifyTotp` + a `verifyBackupCode` fallback + a 30-day "trust this device" opt-in), plus validators unit cases and a serial E2E that plays the authenticator via an in-repo RFC-6238 TOTP helper (no dep) across enroll → sign-out → TOTP challenge → backup-code challenge. OAuth-only accounts can't enroll (2FA guards password sign-in). Live-verified on a fresh prod build (email off). See [context/AUTH.md](../context/AUTH.md#two-factor-authentication-2fa--totp-tier-4--band-2) + [context/DECISIONS.md](../context/DECISIONS.md). |
| Tier 4 · B4 | **Organizations / multi-tenancy** (`organization()` plugin) — teams with per-org roles (owner/admin/member), in 5 steps: **(1)** schema `organization`/`member`/`invitation` + `session.active_organization_id` (migrations 0007–0008); **(2)** wire the plugin + `organizationClient` + graceful `OrganizationInvitation` email + `invitationAcceptUrl` (`config.ts`); **(3)** server-layer org context (`lib/organization.ts`, `orgProcedure`) scoping the `posts` example to the active workspace — `post.list` reads it, `createPost` stamps it, `update`/`deletePost` let org admins/owners act on a member's post; **(4)** client-driven UI off Better Auth's reactive hooks — header workspace switcher, `/organization` manager (members + role/removal, invite, pending invitations with a copyable accept link), and the public `/accept-invitation/[id]` route (signed-out prompt / wrong-account / accept); **(5)** tests — `createOrganizationSchema`+`inviteMemberSchema` unit cases, extracted+unit-tested `slugify`, and a two-context owner→invite→accept + post-scoping E2E (`e2e/organization.spec.ts`). Server org-authz was already unit-tested in `post.test.ts`/`organization.test.ts`/`config.test.ts`. Live-verified on a fresh prod build (email off). See [context/AUTH.md](../context/AUTH.md#organizations--multi-tenancy). |
| Tier 4 · A2 | **Subscription-gating helper + worked surface** — the C4 `subscriptions` table was *written* by the Stripe webhook but never *read*; A2 closes that. New `apps/web/src/lib/subscription.ts` exposes `hasActiveSubscription(userId)` (reads the user's newest row via `db.query.subscriptions.findFirst`, `orderBy desc(createdAt)`) over a pure, unit-tested `isSubscriptionActive` predicate — **`status ∈ {active, trialing}` AND (`currentPeriodEnd` null OR future)**. **Local read only, no Stripe API call**, so gating works with Stripe unconfigured. The worked consumer is a new public, self-gating `/premium` demo route with three states (signed-out → `/login?redirectTo=/premium` · signed-in-unentitled → `/billing` · entitled → the premium Card). No tRPC procedure / Server Action added (read directly in the Server Component, the `/billing` + `/uploads` pattern); `subscription.ts` added to the web coverage include (11 unit cases). Live-verified on a fresh :3000 prod build (email off) by inserting a fake `active` row via psql: signed-out → sign-in · no row → locked/`/billing` · active row → unlocked · row removed → locked again. See [context/SERVICES.md](../context/SERVICES.md) (Stripe → entitlement gating) + [context/DATABASE.md](../context/DATABASE.md) (subscriptions → How it's read). |
| Tier 4 · A4 | **Serverless / managed-PG pooling guidance** (docs) — [DATABASE.md](../context/DATABASE.md) gained a **Connection pooling** section and [DEPLOYMENT.md](../context/DEPLOYMENT.md) a deploy-time cross-link, closing the −3 pooling gap on the Database group. Documents the current single `pg.Pool` (one per process, `max:10` default — fine for a long-lived server), the connection budget (`Σ(pool.max) × instances ≤ max_connections − headroom`, incl. the worker's own pool + `db:migrate`/`db:studio`), the **serverless** per-invocation-pool exhaustion trap, provider poolers (Neon `-pooler` host, Supabase `:6543`, self-managed PgBouncer transaction mode), and the **transaction-mode caveat** — ordinary drizzle queries survive it (node-postgres uses no *named* prepared statements; avoid drizzle `.prepare()`), but the **pg-boss worker needs a direct / session-mode connection** (`LISTEN/NOTIFY` + advisory locks). Docs-only: no code/env change — the `pg.Pool({ max })` knob stays a documented opt-in, preserving the zero-required-config posture. |
| Tier 4 · A3 | **Cron / scheduled-job example** — the `@repo/jobs` worker only demonstrated *event-driven* jobs (`welcome-email`, `delete-uploads`); A3 adds the first **recurring** one. A new `cleanup-expired-verifications` job (queue name + empty Zod payload in `queues.ts`, handler + co-located unit test) prunes Better Auth `verification` rows past their `expiresAt` (dead email-verify / password-reset tokens that would otherwise accumulate) via a single idempotent `db.delete(verification).where(lt(expiresAt, now)).returning(...)` — `@repo/jobs` gains a `@repo/db` + `drizzle-orm` dependency for it. `worker.ts` registers it on boot with `boss.schedule(JOBS.cleanupExpiredVerifications, "0 3 * * *", {}, { tz: "UTC" })` — pg-boss's cron scheduler runs because the worker is `supervise:true` (see `boss.ts`) and persists the schedule in the `pgboss.schedule` table, so boot re-registration is an idempotent upsert (keyed by queue name) and it survives restarts. **At-least-once, not exactly-once** (a tick missed while the worker is down runs late; the delete is idempotent), and degrades like every job (worker optional). Live-verified on Docker Postgres: the worker logged the registration + the persisted schedule (`SELECT … FROM pgboss.schedule`); a one-off `send` pruned 2 expired rows through the real queue and left a fresh row untouched (selectivity). See [context/SERVICES.md](../context/SERVICES.md) (Background jobs → recurring example) + [context/DEPLOYMENT.md](../context/DEPLOYMENT.md). |
| Tier 4 · A5 | **Template render smoke tests for `@repo/email`** — `@repo/email` was the last workspace package with zero tests, so a broken template (or a plain-text regression) only surfaced via a manual `email export`. A5 adds a Vitest config (`node` env, oxc JSX, a `server-only` alias) + two suites (34 tests): `src/templates.test.tsx` renders all 8 templates to **both** HTML and the plain-text alternative — through the *same* `@react-email/render` calls the send path uses (`render(el)` / `render(el, { plainText: true })`, send.tsx:68), with a prop-set pass (asserts name/link/newEmail/org content flows through), a plain-text pass (non-empty, no `<html`), and a default-prop pass (branch coverage + preview-CLI parity) — and `src/send.test.tsx` locks the unconfigured → `{ error }` graceful-degradation contract across all eight `send*` helpers. Coverage `include` scoped to `src/templates/**` (100% on all four metrics; floor 95/95/90/95); `send.tsx`/`client.ts` (the Resend + `server-only` bootstrap) stay out of the floor like jobs' `boss.ts`. Turbo auto-joins the package into `pnpm test`/`test:coverage` now that it defines those scripts (whole-repo `test:coverage`: 6 tasks, was 5). New devDeps `vitest` + `@vitest/coverage-v8` pinned to the repo-wide `^4.1.9`. Test-only change (render is pure — no Resend key, no Docker); the tests **are** the verification. See [context/TESTING.md](../context/TESTING.md#coverage) + [context/SERVICES.md](../context/SERVICES.md) (Resend → Render tests). |
| Tier 4 · A1 | **Toast primitive (`sonner`)** — app-wide transient notifications, the first shipped A-row. New `@repo/ui` `Toaster` (`components/sonner.tsx`): a themed wrapper over `sonner` (follows `next-themes` light/dark, sonner's color slots mapped to `--popover*`/`--border` tokens) mounted once in `app/layout.tsx` inside `ThemeProvider`; `toast` is re-exported from the same module so app code has a single import site and `sonner` stays a `@repo/ui`-only dep (no hand-synced second pin). The one new npm dependency (version-checked; zero transitive deps, React 18/19 peer). Wired the `/account` + `/admin` inline-status surfaces (avatar · name · password · email · sessions · delete · admin role) to `toast.success`/`toast.error`: transient outcomes toast, while standing multi-step instructions (two-hop email change, account-deletion "link sent") and RHF field validation stay inline. `@repo/ui`'s untested-primitive coverage floor re-based to 11/10/27/11; `e2e/account.spec.ts` re-anchored the wrong-password assertion onto the error toast. Live-verified on a fresh :3000 prod build (email off) — the account + account-deletion E2E (7 passed) drive the real toasts. See [context/UI.md](../context/UI.md#adding-shadcn-components). |
| Tier 4 · A7 | **Typed `fieldErrors` ActionResult convention** — actions surfaced only the *first* Zod issue; A7 adds a shared `ActionResult<T>` + `zodFieldErrors()` helper in `@repo/validators` (`{ error; fieldErrors? } \| { data }`, backward-compatible — the optional field, `"error" in result` still discriminates) that maps **every** failing field, plus a client `applyFieldErrors()` (`apps/web/src/lib/forms.ts`) that fans them onto React Hook Form `setError` → inline `<FormMessage>` (field errors stay inline; a field-less `error` stays the form-level banner — no toast). Worked on the copy-me `/posts` **create** surface (`createPost` + `create-post-form.tsx`): the mutation carries `fieldErrors` on the thrown error into `onError`. `createPost` also gained an example **server-only** field rule the client schema can't pre-check — a per-workspace **unique title** (`db.query.posts.findFirst` over author + org-scope + title) returning `fieldErrors: { title }`. Convention is **opt-in** (`updatePost` + the other action files keep their local first-issue shape — no churn). Tests: `zodFieldErrors` branch cases (validators 100%), `applyFieldErrors` (new `forms.ts` on the web coverage include), post.test duplicate + both-field cases. Live-verified on a fresh :3000/:3100 prod build (email off) via a scripted duplicate submit — the duplicate maps **inline to the Title field** (`aria-invalid`, once), Content clean, no banner/toast. See [context/API.md](../context/API.md) (Server Actions → Typed field errors) + [context/CONVENTIONS.md](../context/CONVENTIONS.md). |
| Tier 4 · A8 | **Index settings on first index-creating write** — the posts index only got its pinned `POSTS_INDEX_SETTINGS` via `reindexPosts`; an index first created by `createPost`'s single-doc write kept **engine defaults** (`searchableAttributes: ["*"]` → searchable `id`) until someone reindexed (the P2-7 gap). A8 closes it with a memoized `ensurePostsIndexSettings()` (`apps/web/src/lib/search.ts`): a module-level `settingsPromise` runs `index(POSTS_INDEX).updateSettings(POSTS_INDEX_SETTINGS).waitTask()` **once per process** and caches the resolved promise, so only the first write into a fresh index pays the roundtrip. `indexPost` (post.ts) awaits it **before** `addDocuments`, inside the existing `isSearchConfigured()` gate + try/catch — so **both** write paths (`createPost` *and* `updatePost`, the only `indexPost` callers) are born-with-settings, and it's **best-effort**: a settings outage is logged, never fails the DB write, and clears the memo so a later write retries (rejections aren't cached). `reindexPosts` keeps its own unconditional `updateSettings` (idempotent repair for a drifted index, not routed through the cache). `lib/search.ts` stays off the web coverage `include`, so no forced branch there; `post.test.ts` asserts the ensure runs before `addDocuments` on create + update and that a rejecting ensure still returns `{ data }` without indexing. Live-verified on a fresh :3100 prod build (email off): deleted the Meili `posts` index, signed up, created one post, then `GET /indexes/posts/settings` returned the pinned `searchableAttributes: ["title","content"]` etc. — **not** engine defaults. See [context/SERVICES.md](../context/SERVICES.md) (Search → Settings-on-create). |
| Tier 4 · A6 | **`next/image` remotePatterns + worked usage** — remote uploads rendered as unoptimized plain `<img>`; A6 turns on the optimizer for the Uploadthing served host. `next.config.ts` gains `images.remotePatterns: [{ protocol: "https", hostname: "*.ufs.sh", pathname: "/f/*" }]` (files serve at `https://<appId>.ufs.sh/f/<key>`; `*` = one subdomain label, `/f/*` = one path segment — schema-checked against Next 16.2.9's `RemotePattern`). The worked surface is the `/uploads` thumbnail (`components/uploads/uploads-list.tsx`): the plain `<img>` becomes `<Image width={40} height={40}>` (fixed 40 px square → explicit dims, not `fill`), dropping the `no-img-element` eslint/biome ignores. **No CSP change** — the browser loads only the same-origin `/_next/image?url=…` proxy (`img-src 'self'`) and Next fetches `ufs.sh` server-side (`img-src https:` now only covers residual direct `<img>`). Avatars deliberately stay on the `@repo/ui` `Avatar` primitive's plain `<img>` (that framework-agnostic package must not import `next/image`; Radix `AvatarImage` gives the load-error→initials fallback `next/image` lacks). Live-verified on a fresh :3000 prod build (email off): a real `ufs.sh` upload's `/uploads` thumbnail serves via `/_next/image?url=…ufs.sh…&w=…&q=…` returning `200` (optimized `image/webp`). See [context/SERVICES.md](../context/SERVICES.md#uploadthing-file-uploads) (Optimized remote images) + [context/SECURITY.md](../context/SECURITY.md). |
| Tier 4 · A9 | **`/.well-known/security.txt` (RFC 9116)** — a documented vulnerability-disclosure channel (the standard location researchers + scanners probe), which the repo lacked. Served by a **route handler** (`apps/web/src/app/.well-known/security.txt/route.ts` — Next 16.2.9 serves the `.well-known` dot-folder segment, verified: build lists it as `ƒ /.well-known/security.txt`), **not** a static `public/` file, so the RFC-9116-**required** `Expires` is **computed** (`now + 1 year`, `toISOString()`) at request time — never serving an already-expired date — matching the generated posture of the sibling `robots.ts`/`sitemap.ts`/`manifest.ts` routes. Emits `Contact` (a clearly-marked **placeholder** `mailto:security@example.com` behind a leading "replace before production" comment), `Expires`, `Preferred-Languages: en`, and `Canonical` (from `siteUrl` in `@/lib/site`, unconditional like `robots.ts` — falls back to `localhost` with the env unset). Degradation-free + env-independent; **no new dependency**. `route.ts` is off the `apps/web` coverage `include` (like the sibling metadata routes), so the live GET is the verification. Live-verified on a fresh :3100 prod build: `curl -i /.well-known/security.txt` → `200`, `content-type: text/plain; charset=utf-8`, all four fields present (`Expires` ~1 year out), standard security headers applied via middleware. See [context/SECURITY.md](../context/SECURITY.md) (security.txt (RFC 9116)). |
| Tier 4 · A15 | **Worked `db.transaction` example** — the copy-me `/posts` entity only ever did single-row writes, so it never demonstrated an atomic multi-statement write. A15 adds an append-only **`post_revisions`** history table (`packages/db/src/schema/post-revisions.ts`, migration 0010 — `post_id` FK cascade, `author_id` FK set-null, `post_id` index) and wires **both** `createPost` (post + first revision) and `updatePost` (`UPDATE posts` + a new-version `INSERT` — two different tables) through `db.transaction(async (tx) => …)`: the post and its history commit as one unit or roll back together. External side-effects (search indexing, `revalidatePath`/`updateTag`) stay **outside** the tx (post-commit, best-effort); the action wraps the tx in `try/catch` → typed `ActionResult` error on abort. Tests: `post.test.ts` gains a `db.transaction` mock + atomic-write and rollback-path cases (199 web tests, coverage floor held); the **real** rollback (a mock can't undo mock state) is proven against live Postgres in `packages/db/__tests__/integration/posts.test.ts` — a revision that violates its `post_id` FK aborts the paired post insert (17 integration tests, was 15). No UI (revisions accrue in the DB; a history surface is left as an extension). Verified: full gate (lint · type-check · build) + web unit + the DB integration lane against Docker Postgres (migrate → commit-together + rollback-atomicity both green). See [context/DATABASE.md](../context/DATABASE.md) (Transactions — atomic multi-table writes) + ARCHITECTURE.md. |
| Tier 4 · A16 | **User-keyed protected + rate-limited procedure** — the authenticated-read variant `rateLimitedProcedure`'s comment *described* but nothing implemented. New `userRateLimitedProcedure` (`server/trpc/trpc.ts`) builds on `protectedProcedure` (so a signed-out caller gets `UNAUTHORIZED` **first** — before any bucket is touched — and the body sees a non-null `ctx.session`), then keys the shared limiter by `ctx.session.user.id` + path (`trpc:${path}:user:${id}`) instead of client IP — the fair unit for an authenticated **abusable** read (one IP NATs many users; one account can rotate IPs). The `user:` infix namespaces it off the IP-keyed bucket so the two never collide. Same 20/min cap + 429 + `RateLimit-*`/`Retry-After` headers as its IP sibling via the shared `ctx.rateLimit.blocked` slot — the `route.ts` `responseMeta` is **unchanged**. Worked consumer: **`post.listMine`** (`routers/post.ts`) — the caller's own posts across every workspace (`author_id = me`), the SAME keyset cursor + `limit+1` probe as the public `post.list` but per-user-limited and no author-name join; the copy-me for any per-account expensive read. **No test added** — no tRPC *procedure* is unit-tested in the repo (the router files aren't on the web coverage `include`; logic tests live on the *actions*), so the live loop is the verification. Live-verified on a fresh :3100 prod build (email off): signed-out → **401**; signed-in → **200** returning only the caller's seeded post; the 21st call in the window → **429** with all four headers (`reset`/`retry-after` = 31 s); a **2nd user on the SAME IP → 200** while user-1 stayed blocked (proves user-keyed, not IP-keyed). See [context/API.md](../context/API.md) (Procedure Types → `userRateLimitedProcedure`) + [context/SECURITY.md](../context/SECURITY.md) (rate-limit table). |
| Tier 4 · A14 | **`Skeleton` primitive + worked component-level loading example** — the repo had a route-level `app/loading.tsx` (a spinner) but no `Skeleton` primitive and no *component-level* loading example; the `/posts` copy-me template hand-rolled its fallbacks (an ad-hoc `animate-pulse` div + two plain-text "Loading…" strings). A14 adds the canonical shadcn **`Skeleton`** (`packages/ui/src/components/skeleton.tsx` — `animate-pulse rounded-md bg-accent`, `data-slot="skeleton"`, hand-written to match `card.tsx`; **no new dependency** — `cn` + React only; the CLI's dep-resolution/registry value doesn't apply to a 6-line zero-dep primitive, so its monorepo dep-move/reformat follow-ups are skipped) + a `skeleton.stories.tsx` gallery entry. The worked surface is the `/posts` feed: a shared **`PostListSkeleton`** (`apps/web/src/components/posts/post-list-skeleton.tsx` — `role="status"` wrapper over N placeholder rows shaped like a `PostItem`: title/content/meta lines) reused at **both** of the feed's loading boundaries — the server `<Suspense>` fallback in `app/posts/page.tsx` (while the RSC prefetch streams) **and** the client `post.list` `isPending` branch in `post-list.tsx` — so a cold hydration cache and a streaming shell show the same shape-preserving placeholder. The same page's composer-card placeholder (was a hand-rolled `bg-muted` pulse div) and the cached post-count fallback (was "Counting posts…") became bare `<Skeleton>`s. Only components/pages changed — none are on the `apps/web` coverage `include` (`server/actions/*` + `lib/*`), so no app test was forced; the untested `skeleton.tsx` (6 lines, 0 branches, 1 func) nudged `@repo/ui`'s `all:true` aggregate to 13.13/29.72/12.3/13.13 — still above the `11/10/27/11` floor, so it was **absorbed with no re-base** (the documented convention re-bases only when a new untested primitive actually breaches the floor; lowering an already-passing floor would just weaken the guard). Live-verified on a fresh :3100 prod build (email off): `GET /posts` streamed the skeleton markup (`data-slot="skeleton"` bones in the composer + count + feed fallbacks) in the initial PPR shell. See [context/UI.md](../context/UI.md#adding-shadcn-components) (Route-level vs component-level loading). |
| Tier 4 · A11 | **pnpm install-time `minimumReleaseAge`** — the 7-day supply-chain release-age gate, previously enforced only at the **update layer** by Renovate, now also holds at the **install layer**. Uncommented `minimumReleaseAge: 10080` (minutes) in `pnpm-workspace.yaml` — pnpm validates every lockfile entry's *publish* age on each install (incl. `--frozen-lockfile`), so a too-fresh transitive can't enter the tree via a lockfile edit either. Left off while the repo was days old (a frozen install checks the whole lockfile, and the early deliberate pins + fresh transitives would have failed); the step-1 feasibility probe confirmed the tree has aged past the window — a frozen install verified **all 1021 lockfile entries clear the gate in 5.2s**. The gate reads publish time not lockfile-add date, so packages added 2026-07-08 but long-published (`sonner`, `@manypkg/cli` + transitives) pass. Unlike Renovate it does **not** exempt security fixes (a <7-day fix needs a manual `auditConfig`/override bypass — noted in-file). No new dependency, no runtime surface (lockfile/tooling-only, like A10) — the green `pnpm install --frozen-lockfile` + full gate **is** the verification. See [context/DEPLOYMENT.md](../context/DEPLOYMENT.md#dependency--security-automation-step-26) (two-layer enforcement) + [context/STACK.md](../context/STACK.md) (Version Verification Policy). |
| Tier 4 · A10 | **Workspace dep-consistency check (manypkg)** — duplicated external pins (`drizzle-orm ^0.45.2` ×3 · `react-hook-form ^7.80.0` ×2 · `lucide-react 1.18.0` ×2) were hand-synced with nothing stopping drift. A10 adds `@manypkg/cli` (exact-pinned `0.25.1`, root devDep) + root scripts `lint:deps` (`manypkg check`) / `fix:deps` (`manypkg fix`), wired into the CI `verify` lane after `pnpm lint` (static `package.json` check — no build/DB). Chose **manypkg over syncpack**: zero-config, and it checks version *match* only — so it doesn't fight the repo's deliberate exact/caret pin mix (syncpack's default semver-range rules would false-positive there). First run surfaced a real latent gap — `@repo/eslint-config` peer-depended on `eslint` without a devDependency — fixed by adding `eslint ^10.5.0` to its devDeps (matching apps/web, so **no new mismatch**; the peer stays intentionally broad at `^10.0.0`). Verified the gate **bites**: a temporary `drizzle-orm ^0.45.1` in `@repo/jobs` → `error … most common range … is ^0.45.2` exit 1; reverted → `workspaces valid!` exit 0. No runtime surface (tooling-only). See [context/DEPLOYMENT.md](../context/DEPLOYMENT.md#cicd-github-actions) (verify lane) + [context/STACK.md](../context/STACK.md) (Version Verification Policy → cross-package pin consistency). |

### Tier-4 Band-2/3/4 shipped rows (archived 2026-07-11 — verbatim from the PROJECT_STATUS build-progress table)

The 2026-07-11 doc-audit re-compressed the build-progress table (the append-log's 4th regrowth); these are the full rows it replaced — the complete per-item record incl. verification detail for: DB backup/restore runbook · A19 removal checklists · Docker-image CI · A21 URL-state doc · audit-log + /admin/audit UI · Dialog tall-content fix · A17/A18/A20 docs trio · passkeys · consent + GDPR export · visual regression · perf budget · SBOM/provenance · slim worker · rate-limit storage · admin plugin · i18n · A12 CAPTCHA.

| Row | Detail |
| --- | --- |
| Tier 4 · B2 (ops) | **DB backup / restore / DR runbook** — local `db:backup`/`db:restore` scripts (`docker compose exec` → `pg_dump`/`pg_restore`, custom-format `-Fc`, `--exclude-schema=pgboss`, gitignored `backups/`, `--into` scratch-DB restore) + production `pg_dump`/`pg_restore` recipe · per-provider PITR pointers (Neon/Supabase/RDS) · restore drill · forward-only migration-rollback strategy — shipped 2026-07-09. Round-trip live-verified (backup → restore into scratch DB → exact-count fidelity → `--clean` repair). See [context/DATABASE.md](../context/DATABASE.md#backup-restore--disaster-recovery) / DEPLOYMENT.md. |
| Tier 4 · A19 | **Per-integration removal checklists** (docs) — a **"Remove it"** checklist ending each SERVICES.md integration section (Stripe · Uploadthing · Meilisearch · PostHog · Sentry · background jobs · `@repo/observability` pointer), enumerating the exact files/deps/env vars/CSP entries/DB tables to delete; email (`@repo/email`) + BetterStack logging (`@logtail/next`) documented as **load-bearing façades** (swap/degrade, not delete) + an ARCHITECTURE.md pointer. Accuracy-verified against the code. Shipped 2026-07-09. See [context/SERVICES.md](../context/SERVICES.md). |
| Tier 4 · B2 (CI) | **Docker-image CI** — a 4th `ci.yml` job (`docker-image`, every PR + push) that builds `docker/Dockerfile`, boots it against a throwaway Postgres, **smoke-tests `/api/health`** (asserts a real 200 `database:"up"` — proves node-postgres works in the alpine standalone image), and runs a **Trivy** image scan gating on *fixable* `HIGH,CRITICAL` (`ignore-unfixed`, repo-root `.trivyignore` escape hatch; no SARIF — GHAS-gated like CodeQL). Plus an **opt-in GHCR publish** of the same scanned image (`ENABLE_GHCR_PUBLISH` repo var, push-to-main only — the `ENABLE_CODEQL` pattern). The runner stage now **strips the base image's bundled `npm`** (shrinks image + drops npm's vendored undici, which kept the strict scan green). Build + smoke + clean Trivy round-trip locally verified. Shipped 2026-07-09. See [context/DEPLOYMENT.md](../context/DEPLOYMENT.md#cicd-github-actions). |
| Tier 4 · A21 | **"URL as state" pattern doc** (docs) — a new **"URL as state (shareable client state)"** section in STATE.md names the **third** state bucket (URL `searchParams`) beyond the server cache + Zustand: when to reach for it (shareable/bookmarkable/refresh-surviving — filters/tabs/pagination), the repo's **read-on-the-server-and-pass-down** default (worked: `/admin` keyset pagination via `?after=` + plain `<Link>` nav zero-JS; `/login` `?redirectTo` → `safeRedirectPath` sanitize), opaque keyset cursors (`lib/keyset-cursor.ts`), the client-side `router.replace()` + `URLSearchParams` write pattern (+ `<Suspense>` caveat), and **no `nuqs` dep** (native primitives; nuqs as opt-in). Accuracy-verified against the cited code. Shipped 2026-07-09. See [context/STATE.md](../context/STATE.md#url-as-state-shareable-client-state). |
| Tier 4 · B2 (audit) | **Persisted audit-log surface** — an `audit_log` table (`@repo/db`, migration 0011) + a shared best-effort `recordAuditEvent({ action, actorId?, targetId?, metadata? })` helper (exported from `@repo/db` so the `@repo/auth` callbacks can call it too), giving the security events a **queryable** trail beyond the fire-and-forget `log.info` line. Four events recorded: `user.role_changed` (`setUserRole`, alongside the existing log line), `user.deleted` (`deleteUser.afterDelete`), `user.email_changed` (`afterEmailVerification` hop-2), and the one **new** signal `user.signed_in` (`databaseHooks.session.create.after`). `actor_id`/`target_id` are **FK-less `text`** on purpose — an audit record must outlive the users it references (a cascade would erase the trail; the `user.deleted` row is written after the `user` row is gone). Read UI shipped as its own row below (`/admin/audit`). `@repo/db` integration round-trip (incl. the FK-less/nonexistent-user case) + `admin.test.ts` assertions; round-trip live-verified on :3100 (sign-in + role change → rows land). Shipped 2026-07-09. See [context/AUTH.md](../context/AUTH.md#persisted-audit-trail--audit_log-b2) / DATABASE.md. |
| Tier 4 · B2 (audit UI) | **`/admin/audit` read surface** — the documented follow-up that turns the write-only `audit_log` trail into a usable admin page: newest-first, **keyset-paginated exactly like `/admin`** (reuses `lib/keyset-cursor`; served by `audit_log_created_at_idx`), same `requireAdmin()` guard (non-admins 404, inherits the proxy `/admin/:path*` edge redirect). Two aliased **`LEFT JOIN`s** resolve `actor_id`/`target_id` → email (falling back to the raw id when the user is gone — the point of the FK-less columns). A new pure `lib/audit-format.ts` `describeAuditEvent()` maps action + `jsonb` metadata → label + one-line detail (`Role changed · user → admin`, `Signed in · from <ip>`, …), unit-tested to 100% (added to the web coverage `include`). "View audit log →" link on `/admin` + a "← Admin" back-link. New `e2e/admin-audit.spec.ts` (seeds a target user + a future-dated `role_changed` row → asserts the resolved email + label/detail render, and garbled + past-the-end cursors degrade) + `/admin/audit` added to the a11y scan. Live-verified on :3100. Shipped 2026-07-09. See [context/AUTH.md](../context/AUTH.md#persisted-audit-trail--audit_log-b2) / DATABASE.md. |
| Tier 4 · B3 | **`@repo/ui` Dialog tall-content fix** — `DialogContent` gained `max-h-[calc(100dvh-2rem)] overflow-y-auto` so a dialog taller than the viewport scrolls *inside* and keeps its title + close button on screen (before: it centered at 50% with the top half — title/close — off the viewport edge, unreachable). **Live reproduction corrected the long-standing diagnosis**: Tailwind v4 centers via the standalone `translate` CSS property, which the `tw-animate-css` zoom animation's separate `transform` never touches — the real fault was the missing height cap, *not* an "enter animation overrides the transform" bug (the note carried in DECISIONS.md/BACKLOG was wrong). Added `dialog.stories.tsx` (`Default` + `TallContent`, filling the one Storybook-gallery gap alongside `select`) as the durable regression surface; verified via a headless Playwright probe at a 620px viewport (before: title 879px above the fold, `overflow: visible`, unscrollable → after: fully centered, `max-height: 588px`, scrolls inside). className-only change, no API/DOM change; `@repo/ui` coverage floor held (13.13/29.72/12.3/13.13 vs 11/10/27/11). Shipped 2026-07-09. See [context/UI.md](../context/UI.md) → Dialog + DECISIONS.md → Two-factor. |
| Tier 4 · A17·A18·A20 (docs) | **Band-3 docs trio** (docs-only, one pass) — **A17** `next/font` self-hosted brand-font recipe ([UI.md](../context/UI.md#fonts-nextfont--opt-in-brand-font) → Fonts: system stack stays the default; `next/font`/`next/font/local` self-hosts → **no CSP/`remotePatterns` change** (`font-src 'self' data:` covers it), wired via a `--font-brand` var into the existing `--font-sans` token in `@theme inline`, fallbacks inside `var()`) · **A18** magic-link / email-OTP recipe ([AUTH.md](../context/AUTH.md#magic-link--email-otp-recipe): `magicLink()`/`emailOTP()` server plugins + `magicLinkClient()`/`emailOTPClient()` → `@repo/email`, gated on `isEmailConfigured()` + 3/min rate-limit — the degradation / no-enumeration posture) · **A20** failed-job observability note ([SERVICES.md](../context/SERVICES.md) → Background jobs: pg-boss v12 retry defaults — `retryLimit 2` = 3 attempts, `retryDelay 0`, `expireInSeconds 900` — the `created→active→retry→failed` lifecycle, where failed jobs land in `pgboss.job`/`pgboss.archive` + the inspect SQL, and requeue / dead-letter guidance). Accuracy-verified against **better-auth 1.6.20** / **pg-boss 12.20.0** / the live CSP + Tailwind tokens (grep/glob pass, no build/live-loop). Shipped 2026-07-09. |
| Tier 4 · B3 (passkeys) | **Passkeys / WebAuthn** (`passkey()` plugin) — passwordless sign-in with platform biometrics (Touch ID / Windows Hello) or roaming security keys, **additive** to password + OAuth. Its own **`@better-auth/passkey`** package, exact-pinned in lockstep with core; `passkey` table hand-maintained in `@repo/db` (migration 0012) + registered in the `drizzleAdapter` schema; rpID/rpName/origin derived from `BETTER_AUTH_URL` (`passkeyRelyingParty()`) — **no new env, no new CSP origin** (same-origin WebAuthn). Two surfaces: a **`/account` Passkeys card** (register / rename / remove — NOT password-gated, SSR-seeded list owned in local state) and a **`/login` "Sign in with a passkey"** button (`signIn.passkey()`, no email — discoverable credential; `AUTH_CANCELLED` swallowed). Six `/passkey/*` endpoints rate-limited 10/min. Full lifecycle E2E (`e2e/passkey.spec.ts`) via Chrome's **CDP virtual authenticator** (register → rename → sign out → sign in with passkey → delete), verified headless. Shipped 2026-07-09. See [context/AUTH.md](../context/AUTH.md#passkeys--webauthn-tier-4--band-3) / SECURITY.md / DECISIONS.md. |
| Tier 4 · B3 (privacy) | **Consent gate + GDPR data-export** — the two GDPR self-service primitives, one **Privacy & data** card on `/account`. (1) **Consent gate:** PostHog inits with `opt_out_capturing_by_default`, so **no events/pageviews/`identify` fire until an explicit opt-in**. A `ConsentBanner` (rendered only inside the provider's *configured* branch — an unconfigured app mounts none of it) asks once: Accept → `opt_in_capturing()`, Decline → `opt_out_capturing()`; posthog-js persists the single decision record so it asks once + survives reloads. Tri-state decision is a pure, unit-tested `readConsent()` over posthog-js's **`get_explicit_consent_status()`** (the method that *ignores* the opt-out-by-default config → "pending" until a real choice, so the banner shows instead of reading "denied"); shared reactive store `useConsent()` woken by `notifyConsentChanged()` on each choice + once after `posthog.init`. (2) **Data export (GDPR access right):** an `exportMyData()` Server Action gathers every row the caller owns across the schema (profile · accounts · sessions · posts + revisions · uploads · subscriptions · 2FA · passkeys · org memberships + sent invitations · audit events) → a redacted JSON download ("Download my data" button). All shaping + **allowlist redaction** in a pure 100%-tested `buildDataExport()` (drops `account.password`/tokens, `session.token`, `twoFactor.secret`/`backupCodes`, `passkey.publicKey`/`credentialID`); auth-gated + per-user rate-limited 5/60s. No new dep/env, no CSP change. New `lib/consent.ts` + `lib/data-export.ts` + `server/actions/data-export.ts` added to the coverage `include`. Verified: full gate green (test:coverage 100/95.48/100/100); live headless probe of the banner on a keyed :3100 build (Accept→opt-in "1", Decline→opt-out "0", persisted); full E2E incl. new `e2e/data-export.spec.ts` (fresh sign-up → download → the REAL credential password hash + live session token are absent) on a **keyless** build mirroring CI. Shipped 2026-07-09. See [context/SERVICES.md](../context/SERVICES.md) → PostHog (Consent gating) + [context/AUTH.md](../context/AUTH.md) → Data export. |
| Tier 4 · Visual regression | **Visual regression for `@repo/ui`** (opt-in) — a **Playwright** screenshot harness (`packages/ui/playwright.config.ts` + `tests/visual.spec.ts`) over the Storybook gallery, reusing the `@playwright/test` already installed for `apps/web` e2e (no new browser). Boots `storybook dev` (reuses a running `:6006` locally), **discovers story ids from `/index.json`** at runtime (new stories auto-covered), and captures the **`#storybook-root`** element (tight, so a real change isn't diluted by a centered layout) in **both themes** + the **Dialog opened** (`Default` + `TallContent` at a 640×620 viewport — the B3 regression surface). **Determinism** via Chromium flags (`--font-render-hinting=none --disable-lcd-text --disable-gpu --force-color-profile=srgb --hide-scrollbars`) + frozen animations → ~0-px cross-run noise, so `maxDiffPixelRatio: 0.01` catches a real change (a `rounded-md→rounded-full` button ≈ 2%) without flaking. `ThemeToggle` skipped (two competing theme-class drivers → nondeterministic). Committed **win32** baselines (52); baselines are **per-OS**, so the ubuntu runner needs Linux ones (regenerate via the pinned `mcr.microsoft.com/playwright` Docker image — UI.md recipe). **Opt-in dormant `visual` CI job** (`ENABLE_VISUAL` repo var, OFF by default — the `ENABLE_CODEQL`/`ENABLE_GHCR_PUBLISH` pattern). Live-verified: 3× stable + the mutation round-trip (RED on the button snapshots → GREEN after revert). Shipped 2026-07-09. See [context/UI.md](../context/UI.md#visual-regression-repoui-opt-in). |
| Tier 4 · B3 (perf) | **Performance budget in CI** (opt-in) — a **bundle-size** budget gate, chosen over Lighthouse-CI: bundle bytes are **deterministic** (same commit → same chunks → same gzip size on any OS, so no runner-noise flake and **no per-OS baseline** — unlike the `visual` job), whereas an LHCI category/CWV gate flakes on lab timings and its one non-flaky part (resource budgets) is what a byte budget already covers, without a booted app or headless Chrome. **`size-limit`** + **`@size-limit/file`** (exact `12.1.0`, dev-only) check **`apps/web/.size-limit.json`**: Client JS `.next/static/chunks/**/*.js` ≤ **750 kB** and CSS `…/**/*.css` ≤ **15 kB**, both gzip (~15 % headroom over the measured ~640 kB / ~11 kB). `@size-limit/file` measures the files `next build` **already emitted** (no re-bundle), so it gates the exact JS the app ships — the same reasoning that rejected `@next/bundle-analyzer` (webpack) in D8. New opt-in **dormant `perf` CI job** (`ENABLE_PERF` repo var, OFF by default — the `ENABLE_VISUAL`/`ENABLE_GHCR_PUBLISH`/`ENABLE_CODEQL` pattern) that builds **keyless** (CI has no PostHog key → no `ConsentBanner` in the measured bundle) then runs `pnpm --filter web size`. Full gate green; **mutation round-trip** verified locally (GREEN at budget → RED when tightened 40 kB below actual → GREEN on revert); the budget check is byte-identical across OS, so the dormant lane holds on the ubuntu runner without a per-OS baseline (the `perf` job is exercised by flipping `ENABLE_PERF`). Shipped 2026-07-10. See [context/DEPLOYMENT.md](../context/DEPLOYMENT.md#performance-budgets-opt-in). |
| Tier 4 · B3 (SBOM) | **SBOM + build-provenance attestation** (supply chain, opt-in) — extends the existing `docker-image` CI job (no new job, no new repo variable). **SBOM leg (always-on, fully local):** a **second Trivy invocation** (the same SHA-pinned `trivy-action`, in SBOM mode — `format: cyclonedx`, no severity/`exit-code`, so it never gates) writes `trivy-sbom.cdx.json`, the supply-chain inventory of every OS + app package the image ships, uploaded as the `sbom-cyclonedx` artifact on **every** run (PR + push) and placed *before* the vuln gate so the inventory exists even for an image that fails the scan — **no new action** (`trivy-action` passes `format` straight to the Trivy CLI, so CycloneDX needs no extra dep). **Attestation leg (opt-in, rides the GHCR publish):** the publish step now captures the pushed image's immutable **digest**, and two first-party SHA-pinned actions — `actions/attest-build-provenance@v4.1.1` + `actions/attest-sbom@v4.1.0` — sign **SLSA build-provenance** + **SBOM** attestations over that digest (keyless Sigstore signing via the job's OIDC token; `id-token: write` + `attestations: write` added to the job) and attach them to the GHCR package, so a published image always ships attested and a consumer can `gh attestation verify oci://…`. It shares the existing `ENABLE_GHCR_PUBLISH` + push-to-`main` gate — **no new variable**. SBOM leg verified locally (built the image → ran Trivy CycloneDX → valid `bomFormat` + real components); the attestation leg is **config-proven** (needs an OIDC token + a real registry push, so it can't run on a PR — wired + gated, exercised the first time GHCR publish is enabled; the honest posture used for Real-host-deploy / CodeQL). Shipped 2026-07-10. See [context/DEPLOYMENT.md](../context/DEPLOYMENT.md#cicd-github-actions). |
| Tier 4 · B3 (worker) | **Slim worker image** (Docker) — the background-jobs `worker` target no longer ships the entire dev install + source to run TS via `tsx`. A new `jobs-build` stage esbuild-bundles `worker.ts` + everything it imports (the `@repo/db` / `@repo/email` workspace TS incl. the JSX templates + their JS deps) into a single self-contained `dist/worker.js` (`packages/jobs/build.mjs`, wired into `pnpm build` via turbo — so the bundle is a static-gate compile check too); the final `worker` stage is a minimal `node:24-alpine` + that one file — no source, no `node_modules`, no transpiler, npm stripped (Trivy-clean), runs as the unprivileged `node` user (`node worker.js`). Zero runtime externals needed (the full bundle resolves react/dotenv/`server-only`/the workspace TS at build time — dropping the `tsconfig.worker.json` JSX hack from the runtime path). **~1.57 GB → ~169 MB (9.3×).** Local dev keeps running the TS directly (`pnpm --filter @repo/jobs start` → `tsx`), so no build step in the edit loop. CI's `docker-image` job now also `--target worker` builds it (build-only — the worker has no HTTP surface), catching a broken bundle/Dockerfile pre-merge. Verified: full gate green; the **slim image booted against a throwaway Postgres and drained a job end-to-end** (enqueue → active → pg-boss state `completed`); Trivy scan 0 HIGH/CRITICAL. Shipped 2026-07-10. See [context/DEPLOYMENT.md](../context/DEPLOYMENT.md#background-jobs-worker-d7). |
| Tier 4 · B3 (rate-limit storage) | **Multi-instance rate-limit storage** (Scale) — Better Auth's built-in auth-endpoint limiter (`packages/auth/src/auth.ts`) moved off per-instance in-memory to **`rateLimit.storage: "database"`**, backed by a new **`rate_limit`** table (`@repo/db`, migration 0013 — `key` unique / `count` / `last_request` **bigint** epoch-ms; hand-maintained + registered in the `drizzleAdapter` schema, the auth-schema-ownership convention). Counters are now **SHARED across instances and SURVIVE a restart** — the one thing in-memory can't do before horizontal scaling — with **strict** enforcement (Better Auth's **atomic** check-and-increment `consume`, a guarded `UPDATE`, not the best-effort legacy path). **No new service** (uses the app Postgres, works with env unset); Redis `secondaryStorage` stays the documented higher-throughput swap (auto-takes-over as the limiter store when wired). Deliberately **no `created_at`/`updated_at`** (ephemeral, auto-pruned counter rows — the one documented timestamp-convention exception). Response path unchanged (429 + Better Auth's native `X-Retry-After`; the IETF `RateLimit-*` headers stay on the app-level limiter). Verified on a fresh `:3100` prod build: 5×401 then **429 + `X-Retry-After`**; the counter landed in Postgres (`count=5`); a **restarted process** (empty in-memory) returned **429 on its first hit** = read from the DB; control (delete row → next hit **401** + row recreated `count=1`) proves the 429 was caused by the persisted row. Full gate green (`test:coverage` 100/95.48/100/100) + full e2e. Shipped 2026-07-10. See [context/AUTH.md](../context/AUTH.md#multi-instance-storage) / DATABASE.md / SECURITY.md. |
| Tier 4 · B4 (admin plugin) | **Admin plugin** (`admin()`) — the heavier RBAC upgrade path, **adopted to AUGMENT** (not replace) the hand-rolled role model: `lib/rbac.ts` fresh-DB `requireAdmin`/`adminProcedure` + the audited `setUserRole` action stay the **authoritative** gate + role-setter, and the plugin is taken for the two capabilities it uniquely adds — user **ban** and **impersonation**. Migration 0014 adds `user.banned/banReason/banExpires` + `session.impersonatedBy` (the plugin also manages the existing `user.role`); `admin({ adminRoles:["admin"] })` wired **above** `nextCookies()` + `/admin/*` rate-limit `customRules` + `adminClient()`. **The staleness trade-off (the crux):** every `/admin/*` endpoint authorizes off the cookie-cached **session** role (≤5 min stale), so **ban/unban are fresh-gated DIRECT DB writes** (`banUser`/`unbanUser` — the plugin endpoint would wrongly forbid a just-promoted admin; the write revokes the target's sessions, and the plugin's `session.create.before` hook still enforces the ban at sign-in / auto-lifts `banExpires`), while **impersonation MUST use the plugin** (session-cookie swap) so it inherently carries the window — a fresh-gated + audited `impersonateUser`/`stopImpersonating` Server Action (a just-promoted admin must re-sign-in first; the fresh gate still blocks a just-demoted one), with an app-wide banner off `session.impersonatedBy` in the `(dashboard)` layout. `allowImpersonatingAdmins` false. Four new audit events (`user.banned`/`unbanned`/`impersonated`/`impersonation_stopped`). Verified: full gate green (`test:coverage` 240 pass, 100/94.68/100/100) + full e2e on a **keyless :3000** build — the `admin-impersonate` spec's cache-bypassed `get-session` probe (target + `impersonatedBy`, then restored to admin) proves `nextCookies()` flushes the Server-Action cookie swap. Shipped 2026-07-10. See [context/AUTH.md](../context/AUTH.md#admin-plugin--ban--impersonation-tier-4--band-4) / DATABASE.md / DECISIONS.md / SECURITY.md. |
| Tier 4 · B4 (i18n) | **Internationalization (`next-intl` `4.13.1`)** — **Mode A `[locale]` path routing**, `localePrefix:"as-needed"` (default `en` unprefixed, `es` under `/es`), the whole page tree moved under `app/[locale]/` with the document shell (`<html lang>`) relocated there (root `app/layout.tsx` = bare passthrough). i18n plumbing in `src/i18n/{routing,request,navigation}.ts` + `messages/{en,es}.json` + `createNextIntlPlugin` wrapped **innermost** in `next.config.ts` (`withSentryConfig(withNextIntl(…))`); `NextIntlClientProvider` in the `[locale]` layout; the proxy composes the cookie auth gate (on the locale-**stripped** path) with `handleI18nRouting` + a `METADATA_SEGMENTS` guard for the dot-less image routes. **The crux = the client-vs-server nav split** (`@/i18n/navigation` `Link`/`useRouter` for client; `setRequestLocale` + `getTranslations` for server pages/layouts under `cacheComponents`, keeping routes prerendered; `redirect` + the `redirectTo` `router.push` + `not-found` stay on `next/navigation`). **Coverage is partial by design** — primary journey (landing · `(auth)` · `(dashboard)` shell) translated, demo/`/account`/`/admin`/`/organization` stay English (un-wired pages keep their literal); **`en` values byte-identical** to the old literals (E2E runs the default/unprefixed locale). Per-locale SEO: `generateMetadata` (locale read explicitly → PPR-safe) + `lib/i18n-metadata.ts` `localizedAlternates` hreflang + root `sitemap.ts` (absolute URLs, real public surface only). `LanguageSwitcher` (`usePathname` + `router.replace`, **no** `useSearchParams` under PPR). Add-a-locale = `routing.locales` + `messages/<l>.json` + `OG_LOCALES` + `LOCALE_NAMES`. Tests: unit `i18n-metadata.test.ts` (needs next-intl inlined + `next/navigation`·`next/link` stubs in `vitest.config.ts`) + DB-free `e2e/i18n.spec.ts`. Six-step build on `feat/i18n-next-intl`; full gate + keyless e2e green each step. Shipped 2026-07-11. See [context/I18N.md](../context/I18N.md) + DECISIONS.md. |
| Tier 4 · A12 (CAPTCHA) | **Opt-in CAPTCHA (Cloudflare Turnstile)** — Better Auth's built-in `captcha()` plugin (ships with `better-auth`, **no new dep**) protecting `/sign-up/email` · `/sign-in/email` · `/request-password-reset` (its defaults). **Conditionally registered** — spread into `plugins` only when `TURNSTILE_SECRET_KEY` is set (`captchaOptions()`/`isCaptchaConfigured()` in `config.ts`; the empty-secret plugin throws `MISSING_SECRET_KEY`→500 on those paths, so leaving it out is what preserves the "runs with env unset" contract) — and placed **last before `nextCookies()`**: a conditional spread degrades every plugin after it from a fixed tuple position to a loose array element, which erased the `twoFactor`/`admin`/`organization` `$Infer` augmentations on `Session`/`User` (caught by `tsc`); after the inference-contributing plugins it preserves their tuple types while still leaving `nextCookies()` genuinely last at runtime. Client: a hand-rolled `CaptchaWidget` (`forwardRef` over Cloudflare's `api.js`, explicit render + `reset()`, renders only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set) on the three forms, gating the submit button on a token and sending it in the **`x-captcha-response`** header (`fetchOptions.headers`) the plugin verifies. **No new user-facing copy** → `en`/`es` untouched. CSP allows `https://challenges.cloudflare.com` (script-src + frame-src). Two-step build on `feat/captcha-turnstile`. Verified: full gate green + config coverage 100%; server-leg on `:3100` (secret set + no header → 400 "Missing CAPTCHA response"; + token → 401 passthrough; secret unset → 401, no gate); keyed `:3100` UI loop with Cloudflare **dummy test keys** — always-pass secret → widget mints token, submit → `/dashboard`, no CSP errors; always-fail secret → inline "Captcha verification failed", stays on `/signup`. Keyless e2e regression-free (`auth.spec` 5/5). Shipped 2026-07-11. See [context/AUTH.md](../context/AUTH.md#bot-protection--captcha-cloudflare-turnstile-tier-4--band-2) + SECURITY.md / DECISIONS.md. |

### Tier-4 B3 (CSP-nonce rework) + A22–A31 shipped rows (archived 2026-07-12 — verbatim from the PROJECT_STATUS build-progress table)

> Archived 2026-07-12 (doc audit): the verbose rows for the CSP-nonce rework, A22
> (SSE/realtime), and the 2026-07-12 audit's A23–A31 polish set moved verbatim out of
> [../PROJECT_STATUS.md](../PROJECT_STATUS.md), which keeps one compact row each. Relative
> links rebased to the archive. **Ship dates corrected in-move:** the docs had recorded
> these as "2026-07-13", but the commits landed 2026-07-11 (A23 · A26 · A24) and
> 2026-07-12 (A25 · A29 · A28 · A27 · A30 · A31 + B3/A22).

| Group | Detail |
| --- | --- |
| Tier 4 · B3 (CSP nonce) | **Nonce-CSP recipe reworked for the i18n proxy** — `proxy.csp-nonce.ts.example` now *is* the current i18n `proxy.ts` (locale routing + `METADATA_SEGMENTS` guard + locale-stripped auth gate) with the per-request nonce CSP composed **around** the next-intl hand-off (augment the request headers with the nonce → hand the augmented `NextRequest` to `handleI18nRouting` so it forwards them to the render → set the CSP on the response); `NextRequest` imported as a value; directive list reconciled with `next.config.ts` (adds `challenges.cloudflare.com` to script/frame-src). Re-verified end-to-end on `:3100` (temporary adopt + D4 unwind): per-request `'nonce-…' 'strict-dynamic'` CSP on `/` **and** `/es`, all 34 `<script>` tags (external + inline next-themes) nonced + unique per request, `/en`→`/` and locale-aware auth redirects intact, `/[locale]` dynamic (`ƒ`). Inert `.example` + docs only — the shipped default stays the static CSP. Shipped 2026-07-12. See [context/SECURITY.md](../context/SECURITY.md#csp-strategy-static-vs-nonce-and-the-upgrade-path) + DECISIONS.md. |
| Tier 4 · A22 (realtime) | **SSE / realtime notifications** — a route-handler **Server-Sent Events** stream (`/api/notifications/stream`) fed by Postgres **LISTEN/NOTIFY**: `notify()` (`pg_notify`, parameterized) publishes; **one** dedicated LISTEN connection per instance (`@repo/db` `createPgListener`) fans out via an in-process `Map<userId,Set>` bus (`globalThis` singleton, reconnect-on-drop); the client `EventSource` prepends pushes into the `notification.list` **query cache** (`setQueryData`) + a toast. Persisted `notifications` table (migration 0015) so it degrades to "refresh"; **no new dep/env, no CSP change** (same-origin). Gated `/notifications` demo + i18n. Cross-connection live push **E2E-verified** (two contexts). PR #14. Shipped 2026-07-12. See [context/API.md](../context/API.md#realtime--server-sent-events-sse-tier-4--a22) + STATE.md / DEPLOYMENT.md / DECISIONS.md. |
| Tier 4 · A23 (realtime) | **SSE reconnect backfill** — the server doesn't replay the LISTEN/NOTIFY gap, so `EventSource.onopen` **after the first** now `invalidateQueries`es `notification.list` (a closure `hasConnected` flag scoped to the stream), reconciling a drop-gap against the persisted table with **no reload**. Delivery goes from "best-effort across a reconnect" to **self-healing**. **E2E-verified** via a second two-context test that drops device A with `context.setOffline()`, sends from B during the gap, and asserts the missed row backfills on A's reconnect (fails without the fix). Shipped 2026-07-11. See [context/API.md](../context/API.md#realtime--server-sent-events-sse-tier-4--a22) + STATE.md / DEPLOYMENT.md / DECISIONS.md. |
| Tier 4 · A24 (realtime) | **Authoritative unread-count badge** — `notification.unreadCount` rewritten from fetch-every-unread-row + count-in-JS to a SQL `count()` (one aggregate row, O(1) over the wire), then **wired as the feed badge's source** (`useQuery`) so it reflects the *server* total instead of a tally of the loaded page (which undercounts past `NOTIFICATIONS_PAGE_SIZE`). Being a separate query it's reconciled in lockstep with `notification.list`: invalidated on each SSE push, the A23 reconnect backfill, and the offline-send fallback, and set straight to `0` on mark-all-read; prefetched with the list so it hydrates on first paint. Router/feed only — untouched measured coverage set. The two-context E2E now asserts the badge climbs 1→2 across pushes then clears. Shipped 2026-07-11. See [context/API.md](../context/API.md#realtime--server-sent-events-sse-tier-4--a22) + STATE.md. |
| Tier 4 · A25 (realtime) | **Keyset-paginate `notification.list`** — the feed's initial 20 rows (`NOTIFICATIONS_PAGE_SIZE`) are now the first page of a `(createdAt, id)` keyset cursor. The router gained a **uuid-validated** `cursor` input (`z.uuid()` on the `notifications.id` uuid column → a hand-crafted non-uuid cursor **400s at the Zod boundary**, never a Postgres `invalid input syntax` 500 — the always-server-originated tRPC cursor doesn't need /admin/audit's degrade-to-page-1) + a `limit + 1` probe returning `{ items, nextCursor }` — the `post.list` pattern. The feed swapped `useQuery`→`useInfiniteQuery` with a "Load more" button; **the crux was reworking every realtime `setQueryData` for the `InfiniteData` (`{ pages, pageParams }`) shape** — the SSE push prepends into `pages[0]` + **dedupes across all loaded pages**, mark-all-read maps every page (the `post-cache.ts` shape) — while A24's `unreadCount` (a separate authoritative query) stayed untouched. RSC prefetch → `prefetchInfiniteQuery`. New single-context E2E seeds 25 rows via a direct-insert `seedNotifications` helper and asserts 20 → "Load more" → 25 (oldest row revealed, button gone; `dispatchEvent("click")` fires through the bottom-fixed consent banner that a coordinate click would hit); the two existing two-context specs re-prove the infinite-cache push/mark-read paths. Prod-build E2E green (3/3). Shipped 2026-07-12. See [context/API.md](../context/API.md#realtime--server-sent-events-sse-tier-4--a22) + STATE.md. |
| Tier 4 · A29 (DB) | **`DB_POOL_MAX` deploy knob** — the `@repo/db` pool's `max` is now an optional env var threaded into `new Pool({ max })` in [`client.ts`](../../packages/db/src/client.ts). Unset/empty leaves pg's built-in default (`max: 10`) so the starter runs with zero required config (**graceful degradation**); a positive integer caps it per the connection budget; a **set-but-invalid value fails loud** at module load (matches the app-boundary `@t3-oss/env` discipline — `@repo/db` owns no env schema, so the read + validation live in `client.ts`). Makes A4's pooling-docs advice actionable without duplicating it. No new dep/CSP/migration; sizes this app pool only (the pg-boss worker keeps its own). Live-verified three ways (unset→10, `=25`→25, `=abc`→throws) against the real constructed pool; full gate green. Shipped 2026-07-12. See [context/DATABASE.md](../context/DATABASE.md#connection-pooling-managed-postgres--serverless) + DEPLOYMENT.md. |
| Tier 4 · A26 (UI) | **`Table` primitive in `@repo/ui`** — the canonical shadcn data-table family (`Table`/`TableHeader`/`TableBody`/`TableFooter`/`TableRow`/`TableHead`/`TableCell`/`TableCaption`), zero-dep (`cn` + React, the Skeleton precedent), `overflow-x-auto` container + `*.stories.tsx` gallery (win32 visual baselines regenerated via `--update-snapshots=missing`, 52 untouched). The untested primitive nudged the `@repo/ui` coverage funcs 12.3%→10.95% but stayed above the floor — **no re-base**. Worked consumer: **`/admin/audit`** converted `<ul>`→`<Table>` (Event · Actor → Target · Time; a11y-clean, keyset pagination intact); its E2E rescoped `getByRole("listitem")`→`tbody`-scoped rows. `/admin` stays a `<ul>` (control-heavy rows). Prod-build E2E + both-theme gallery baselines verified. Shipped 2026-07-11. See [context/UI.md](../context/UI.md#adding-shadcn-components). |
| Tier 4 · A27 (tooling) | **Dead-code / unused-dep gate (knip)** — `knip@6.24.0` (exact-pinned root devDep; near-daily publisher vs the 7-day age gate) resolves the real import graph across all 11 workspaces and **gates CI's `verify` lane** (`pnpm knip`, after `lint:deps`) on unused files / unused exports / unused-or-phantom deps — the orphan classes manypkg (A10) can't see. Root `knip.jsonc` workspaces map; every ignore carries its reason (react-email preview dep assumption · tsconfig `next` LS plugin · vitest alias stubs · the documented `email.tsx` example scaffold); intentional-but-unconsumed API surface tagged **`@public` at the export site** (`tags: ["-public"]`), in-file-used exports allowed (`ignoreExportsUsedInFile`). Adoption caught **2 real defects**: `server-only` was a phantom dep of `apps/web` (imported ×14, undeclared — added) and `@next/eslint-plugin-next` a redundant devDep (`@repo/eslint-config` declares its own — removed). Mutation round-trip verified (seeded unused file + export + dep all flagged → reverted → clean); full gate green. Shipped 2026-07-12. See [context/STACK.md](../context/STACK.md) / DEPLOYMENT.md → CI/CD / CONVENTIONS.md → Exports. |
| Tier 4 · A30 (i18n docs) | **Worked next-intl formatting recipe** — new [I18N.md](../context/I18N.md#formatting-dates-numbers--currency-useformatter-a30) section: `useFormatter` (client + non-async server) vs `getFormatter` (async, `{ locale }` outside request scope) · named formats returned from `getRequestConfig` — the bare `<NextIntlClientProvider>` **auto-inherits `formats`/`timeZone`/`now` from the request config** (verified in the 4.13.1 provider source), so one definition serves both sides · ICU-embedded `::currency/USD` / `{when, date, medium}` skeletons in message strings · the **`timeZone`/`now` `ENVIRONMENT_FALLBACK` gotcha** (SSR-vs-client wall-clock mismatch; wording verified from installed source). Every snippet type-check-verified against installed `next-intl@4.13.1` via a scratch compile (deleted pre-commit — knip would flag it). Docs-only — `request.ts` deliberately stays minimal until a real consumer ships. Shipped 2026-07-12. |
| Tier 4 · A28 (testing) | **Linux visual baselines + `ENABLE_VISUAL` — the visual CI lane is LIVE** — 56 `…-linux.png` baselines (~450 KB) generated in the pinned `mcr.microsoft.com/playwright:v1.61.0-noble` image (matches the installed 1.61.0 + the ubuntu runner) and committed beside the 56 win32 ones. The UI.md recipe was **corrected in-pass**: don't `pnpm install` over the mounted repo — pnpm aborts on the host's win32 `node_modules` (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`) and forcing `CI=true` would purge it through the mount; instead copy the repo into the container, generate + **assert-re-run** there (the determinism gate), and copy back only the verified PNGs (host tree untouched). Local win32 suite green (56 untouched). The lane's **first live run then failed** — the bare ubuntu runner's font set ≠ the image's (every text-bearing story a few px wider) — fixed by running the CI job **inside the same pinned image** (`container:` in ci.yml; the browser-install step dropped, the image ships them); image tag kept in lockstep with `@playwright/test`. `ENABLE_VISUAL` set — **permanent**, unlike the perf-lane proving trick; the newly-live `visual` job green is the live check. Shipped 2026-07-12. See [context/UI.md](../context/UI.md#visual-regression-repoui-opt-in). |
| Tier 4 · A31 (framework) | **`typedRoutes` evaluated — NOT adopted** — the stable top-level flag (16.2.9; `experimental.typedRoutes` deprecated) prototyped end-to-end: `next typegen` → `.next/types/link.d.ts` → `tsc` → a green full build with the required casts, then fully reverted. Rejected on architectural fit: under the `[locale]` tree + `as-needed` prefix, the generated union makes checking **vacuous** for single-segment paths (`redirect("/login")` passes as locale=`"login"` — so does the typo `/dashbord`) and **false-positive** for runtime-valid `/` and unprefixed multi-segment URLs (`/admin/audit`), while next-intl's build-time-flattened `createNavigation` types leave the app's whole i18n link surface unbenefited (its `pathnames` map is the right tool if typed hrefs are ever wanted). Adoption's net diff = six `as Route` casts on runtime-correct code + tsconfig/CI churn (today's `.next` tsconfig exclude makes the flag a **silent no-op**). No tooling fallout (Turbopack · React Compiler · PPR · next-intl · Sentry all green). Docs-only close, 2026-07-12 — **drains the 2026-07-12 audit's local rows**. See [context/DECISIONS.md](../context/DECISIONS.md). |


## Final Tier-4 rows + deploy / live-verify closes (2026-07-12 → 14) — archived record

> Archived **verbatim** from the PROJECT_STATUS build-progress table on 2026-07-14 (the
> 6th re-slim of that table). These are the shipped rows that had no archive copy yet:
> the last two local Tier-4 ships (B2 uuid-cursor hardening · A32 locale-aware date
> formatting), A13 Stripe cancel-on-delete, and the three closing proof rows (Fly.io
> real-host deploy · Stripe Phase-5 live-verify · production email domain +
> deliverability). Earlier Tier-4 rows were archived in the 2026-07-09/11/12 passes above.

| Steps | Area |
| --- | --- |
| Tier 4 · B2 (cursor) | **`post.list` / `post.listMine` uuid-cursor hardening** — cursor `id` now `z.uuid()` (the A25 pattern): a hand-crafted non-uuid cursor 400s at the Zod boundary instead of a Postgres 500 (pre-fix 500 live-reproduced — its error body leaked the query text); unit-pinned in `routers/post.test.ts`; `admin.listUsers` deliberately stays `z.string()` (`user.id` is text). Shipped 2026-07-12. See [context/API.md](../context/API.md#cursor-pagination-d1). |
| Tier 4 · A32 (i18n) | **Locale-aware date formatting** — the A30 recipe's consumer half: `i18n/request.ts` now returns a `formats.dateTime.short` named format + a global `timeZone: "UTC"` (inherited app-wide via the bare provider), and the notifications feed renders `createdAt` through `useFormatter().dateTime(d, "short")` instead of `toLocaleString()` — the negotiated locale is honored and SSR markup matches hydration (kills the server-zone-vs-client-zone mismatch on the one i18n-covered display surface). The other 6 `toLocale*` sites stay on English-only pages by design. Shipped 2026-07-12. See [context/I18N.md](../context/I18N.md#formatting-dates-numbers--currency-useformatter-a30). |
| Tier 4 · A13 (payments) | **Cancel Stripe subscription on account deletion** — `deleteUser.beforeDelete` captures the user's non-terminal `subscriptions` ids before the row cascades, `afterDelete` enqueues the `cancel-stripe-subscriptions` job, and the `@repo/jobs` worker cancels each via its own env-gated Stripe client (**immediate cancel; Stripe customer kept** — both one-line swaps). Mirrors the `delete-uploads` D7 pattern, keeping `@repo/auth` Stripe-free; `stripe` pinned identically in `@repo/jobs` (manypkg). Keyless-verified (job round-trips pg-boss → the unconfigured skip log); the live cancel needs test keys (Phase 5). Shipped 2026-07-13. See [context/SERVICES.md](../context/SERVICES.md) → Stripe · [context/AUTH.md](../context/AUTH.md) → Danger zone. |
| Deploy · Fly.io | **Real host deploy — PROVEN live 2026-07-13** — the one un-exercised production claim, now closed. A committed root `fly.toml` deploys `docker/Dockerfile` (standalone `:3000`, `/api/health` check, single `shared-cpu-1x`/512 MB machine, `min_machines_running=1` for SSE/LISTEN); managed `fly postgres` (direct session conn for pg-boss/SSE); migrations run out-of-image via `fly proxy` + `db:migrate`; only `DATABASE_URL`/`BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` are required. Verified on the test app's `fly.dev` URL: `/api/health` 200 `{"database":"up"}`, prod security headers, `fly status` 1/1 passing, and a real sign-up → session → **user row in the managed Postgres**. Local pre-flight (image boots vs external PG) landed in `chore(deploy)` 404de06. See [context/DEPLOYMENT.md](../context/DEPLOYMENT.md#flyio-worked-runbook) · [VERIFICATION.md](../VERIFICATION.md) Phase 6. |
| Verify · Stripe Phase 5 | **Stripe test-mode live-verify — COMPLETE 2026-07-13** (the last un-run integration). Real hosted-Checkout payment → `checkout.session.completed` **200** → `subscriptions` row (`active`), **idempotent** on resend; **customer reuse** (one Stripe customer across two checkouts); **billing portal** round-trip for the right customer; **dunning** via a Stripe **test clock** on a failing card (`4000 0000 0000 0341`) → `invoice.payment_failed` → row `past_due`; webhook **400/503/429** (`Retry-After`); and **A13 cancel-on-delete** — deleting the account drove the `@repo/jobs` worker to cancel **all 3** subs in Stripe (rows cascaded to 0). Stripe CLI driven headlessly (`--api-key`, no `stripe login`). Doc-only close (code unchanged; the A13 code shipped 62b9795). See [VERIFICATION.md](../VERIFICATION.md) Phase 5. |
| Verify · Prod email domain | **Production sending domain + deliverability — VERIFIED 2026-07-14.** Verified a real domain (dedicated sending subdomain) in Resend with SPF/DKIM/DMARC; `EMAIL_FROM` switched to the domain sender. Deliverability proven — a domain send landed in **INBOX** (auth-aligned, observed) and Resend reported non-owner `+alias` sends **Delivered** — and the **hop-2 email-change delivery** gap (open since 2026-07-05) **closed** via a full two-hop run driven live (sign-up → verify → hop-1 → hop-2 → applied; `audit_log` `user.email_changed`). Yielded the SERVICES.md deliverability recipe (SPF/DKIM/DMARC + subdomain + GoDaddy/warmup notes). Remaining optional: app-side bounce/complaint handling. See [context/SERVICES.md](../context/SERVICES.md) → Resend · [VERIFICATION.md](../VERIFICATION.md) → Resend. |

## Path-to-100 program (2026-07-16 → 17) — archived per-row record

> The program's per-row analysis and done-criteria live in
> [PATH_TO_100_2026-07-15.md](PATH_TO_100_2026-07-15.md); the compact live record is
> the PROJECT_STATUS build-progress table. This section preserves the verbose per-row
> shipping notes verbatim as rows are compacted out of the hot path.

| Row | Record |
| --- | --- |
| Path-to-100 · #6 | Magic-link sign-in wired (promotes the A18 recipe) — `magicLink()` env-gated on `isEmailConfigured()` so affordance + endpoints appear/disappear together (conditional spread in the safe tuple position; type-check proves the `$Infer` augmentations survive); 3/min send + 10/min verify rate rules; captcha-endpoint parity; `sendMagicLinkEmail` + a ninth template (no recipient name — the address may not exist yet); login-form request step, en+es at birth. E2E: the test-only `EMAIL_TEST_CAPTURE_DIR` seam + a second :3001 webServer drive request → captured link → session and replay rejection (limiter counters reset out-of-band — the DB-backed window slides); hidden-when-keyless asserted on the main server. Live on :3100 (real key): affordance renders, `/sign-in/magic-link` → `{status:true}`. 2026-07-16. See [context/AUTH.md](../context/AUTH.md#magic-link-sign-in-env-gated-path-to-100-6) · [context/TESTING.md](../context/TESTING.md#email-capture--the-magic-link-e2e-path-to-100-6). |
| Path-to-100 · #7 | i18n full-surface coverage — en/es catalogs extended from the primary journey to EVERY `[locale]` surface (`/account` + all nine cards · `/admin` + `/admin/audit` + row controls · `/organization` + cards + OrgSwitcher + accept-invitation · `/posts` `/uploads` `/search` `/billing`(+success) `/premium` `/state` `/observability` · the error boundary), identical 485-key trees, en values byte-identical (E2E-load-bearing). All six `toLocale*` sites swapped to the A32 named formats (+ new `dateOnly`); `/admin/audit`'s hand-rolled en-US `Intl` timestamp now localizes via the same convention. Worked PPR patterns: sync pages read params via `use(params)`; Suspense children re-anchor the locale from a prop. E2E: `/es/posts` chrome (DB-free) + signed-in `/es/account` date spot-check riding account.spec's serial lifecycle. 2026-07-16. See [context/I18N.md](../context/I18N.md). |
| Path-to-100 · #8 | Email bounce/complaint handling — signature-verified `POST /api/resend/webhook` (the Stripe route's twin: rate-limit first in separate `resend-webhook:` buckets → 503 unconfigured → 400 missing/bad svix signature, verified over the RAW body via the installed SDK's sync `webhooks.verify`; **zero new deps**) feeds `email_suppressions` (migration 0016: FK-less by design, lowercase-unique `email` doubling as the lookup index, idempotent upsert refreshing reason/detail/email_id/last_event_at on the DB clock — the integration test caught app-vs-DB clock skew running `last_event_at` backwards). Only `Permanent` bounces suppress (case-insensitive; transient = log-only); `email.complained` → `complaint`; `email.suppressed` mirrors Resend's account-side list as `provider`. Every `send*` helper consults `isEmailSuppressed()` — gated on `RESEND_WEBHOOK_SECRET` (unset = zero extra queries, byte-identical), fail-OPEN on lookup errors — returning `{ error, suppressed: true }`; the welcome-email job completes on it instead of retrying into the DLQ. New acyclic workspace edge `@repo/email → @repo/db`. E2E self-signs the svix HMAC on the :3001 capture server (real verification path; tampered sig → 400; suppressed address yields no capture file, control does). Live on :3100 (minted secret): signed bounce POST → 200 → psql row; tampered → 400; real magic-link request → neutral `{status:true}` + the logged suppression skip, no Resend send. Genuine-origin tunnel proof documented as an optional SERVICES.md rider (same #4b blocker, not a prerequisite). 2026-07-16. See [context/SERVICES.md](../context/SERVICES.md#bounce--complaint-handling-path-to-100-8) · [context/DATABASE.md](../context/DATABASE.md#email-suppressions-email_suppressions--do-not-send-list-migration-0016) · [context/TESTING.md](../context/TESTING.md#email-capture--the-magic-link-e2e-path-to-100-6). |
| Path-to-100 · #4a/#4b | `e2e/uploads.spec.ts` — the last zero-e2e integration covered: keyless CI-honest spec (page renders logged-out, UploadButton mounts + settles past "Loading…", signed-in "Your uploads" empty state); 2/2 with `UPLOADTHING_TOKEN` explicitly blanked. The #4b callback runbook (`UPLOADTHING_CALLBACK_URL`, source-verified in installed 7.7.4) was authored 2026-07-16 and its one-time live tunnel proof **ran 2026-07-17** (owner-approved cloudflared tunnel: callback POSTed through the tunnel on a prod build → `uploads` row landed; Delete swept row + file — dated box in VERIFICATION.md). 2026-07-16 → 17. See [context/SERVICES.md](../context/SERVICES.md#uploadthing-file-uploads) · [VERIFICATION.md](../VERIFICATION.md). |
| Path-to-100 · #9 | Opt-in OpenTelemetry — OTLP/HTTP trace export gated on `OTEL_EXPORTER_OTLP_ENDPOINT` (runtime knob, no rebuild; unset = prior behavior exactly): `lib/otel.ts` adds a `BatchSpanProcessor` to **Sentry's own OTel provider** via the SDK's `openTelemetrySpanProcessors` option (source-verified in 10.59.0) — one provider/sampler, no double-instrumentation; works DSN-less (sampler gates on `tracesSampleRate`, not DSN). Live matrix vs a local collector: baseline inert · OTLP-only spans (keyless build) · dual export (Sentry-sink `transaction` envelopes + collector spans from the same requests); `OTEL_SERVICE_NAME` honored. 2026-07-16. See [context/SERVICES.md](../context/SERVICES.md#opentelemetry-export-opt-in-path-to-100-9). |
| Path-to-100 · #10 | `CSP_MODE=nonce` as a first-class **build-time** mode (M4's recipe promoted; the inert `.example` deleted) — one shared directive list (`src/lib/csp.ts`) feeds both the static config header (default, byte-identical to pre-#10) and the proxy's per-request `'nonce-…' 'strict-dynamic'` CSP; nonce builds set `cacheComponents: false` + `experimental.useCache` so the D4 `"use cache"` showcase **keeps caching** (only the static/PPR posture is given up; `useCache`-survives-`cacheComponents:false` source-verified in Next 16.2.9). Baked via config `env` → runtime override is a verified no-op. New `e2e/csp-nonce.spec.ts` matrix (rotating nonce both locales · no script `'unsafe-inline'` · every `<script>` stamped · journeys with zero console violations) runs in the variable-gated `csp-nonce` CI lane (`ENABLE_CSP_NONCE`, ON here). 2026-07-17. See [context/SECURITY.md](../context/SECURITY.md#csp-strategy-static-vs-nonce-the-csp_mode-switch). |
| Path-to-100 · #11 | Per-org billing — the program's **last row**. `subscriptions` owned by exactly ONE of user/org (migration 0017: nullable `user_id`, new `organization_id` FK, `num_nonnulls`-check; **XOR by design** — a purchaser FK would let a member's account deletion cascade/cancel the ORG's subscription). Org-context checkout + portal (authoritative active-org + fresh-role reads; owner/admin gate BEFORE the config gate), webhook org mapping via `metadata.organizationId`, `hasOrgSubscription()` + context-aware `/premium` (one org sub entitles every member), org-aware `/billing`, org-delete → the A13 cancel job via `organizationHooks`. Live-verified end-to-end in test mode (checkout → org row → resend-idempotent → member entitled/blocked → portal on the org customer → org delete canceled 1/1 on Stripe); keyless `e2e/billing-org.spec.ts`. Seat-quantity billing stays out of scope (schema doesn't preclude it). 2026-07-17. See [context/SERVICES.md](../context/SERVICES.md#stripe-payments) · [context/DATABASE.md](../context/DATABASE.md#stripe-subscriptions-subscriptions--implemented-phase-3--c4-org-aware-11). |

## ai-dev-kit program (2026-07-17 → 18) — archived record

The verbatim "Where we are" prose from PROJECT_STATUS, compacted there 2026-07-18
(doc-audit pass 12). The kit's own README/CHANGELOG (in the
[ai-dev-kit repo](https://github.com/jrittelmeyer/ai-dev-kit)) carry the per-version
record.

> **ai-dev-kit program (started 2026-07-17):** the repo's agentic-dev techniques are
> codified into a portable, versioned skill library — now the standalone
> [ai-dev-kit repo](https://github.com/jrittelmeyer/ai-dev-kit)
> (generic skills + per-project adapter config + cross-platform installer with drift
> guard). **ALL THREE STEPS SHIPPED 2026-07-17 — kit 0.3.0**: Step 1 scaffold + 6
> skills + installer; Step 2 advise-never-block hooks (dep-check nudge, live-verify
> reminder, skill-drift guard — proven firing live); Step 3 why-layer playbook
> (the kit's docs/PLAYBOOK.md) + self-contained catalog deck.
> `.claude/skills/` and `.claude/hooks/ai-dev-kit/` are installer output — edit a
> clone of the kit repo, re-install. **project-init program (started 2026-07-18):** the kit gains its
> one-time inception entry point — `/project-init` turns an idea or plan docs into
> discovery (gaps, value-adds, competitive scan, template fit-map) → a product brief
> → regenerated status/backlog to a 100 bar, gated on sign-off before the pipeline
> starts. **Steps 1–2 shipped 2026-07-18 (kit 0.4.0)**; **step 3 (live trial) COMPLETE
> 2026-07-18 — kit 0.4.1, PROGRAM COMPLETE.** The full flow ran on a fresh degit
> consumer copy (sample product "Potluck"): installer `--check`, scaffold guard →
> `init-app --slim`, discovery, one batched question round (a delegated answer became
> a marked assumption), product brief, context-doc mends, regenerated status/backlog
> — all green through the sign-off gate. Two skill mends landed (`{name}` must be a
> lowercase npm-safe slug; sign-off commits the inception output) and two template
> findings became BACKLOG on-ramp rows (leftover-mention tidy · PRODUCT.md index
> placeholder). **Both on-ramp rows shipped 2026-07-18 — kit 0.4.2:** `--slim` now
> retargets/rewrites the 8 known leftover pointers (per-line report for anything
> else), and AGENTS.md pre-seeds a commented `PRODUCT.md` context-index row that
> `/project-init` (0.1.2) uncomments. **Extraction (B3) SHIPPED 2026-07-18 — kit
> 0.5.0 is a standalone public repo**
> ([jrittelmeyer/ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit): fresh
> single-commit history, two-OS smoke CI green, secret scanning + push protection +
> vulnerability alerts + CodeQL default setup + protect-main ruleset). This repo
> now consumes it — the in-repo `ai-dev-kit/` dir is gone, the `.claude/` install
> output stays committed, re-installs run from a clone (`--dest <this repo>`), and
> doc-audit's dual-home source of truth moved to the kit repo (doc-audit 0.1.1).

---

## Build-progress table — archived from PROJECT_STATUS.md (2026-07-23, 7th compaction)

The completed build-progress rows, moved verbatim from
[../PROJECT_STATUS.md](../PROJECT_STATUS.md) in its seventh compaction (relative
link paths rewritten for this file's location; content otherwise untouched). The
Steps 1–29 map and the one-row-per-program summary remain there.

| Steps | Area |
| --- | --- |
| Phase 3 · T0–C4 | Doc-drift + cleanup (T0; A1 dead-rewrite delete; A2 rate-limiter onto public reads) · auth/dashboard UI (C1) · `apps/web` Vitest, 40 unit tests, coverage-gated (C2) · DB-backed checks on every PR (C3) · Stripe webhook → `subscriptions` table (C4) |
| Phase 3 · D1–D11 | Posts depth: edit + keyset pagination + optimistic UI (D1) · admin write surface `setUserRole`, anti-lockout (D2) · React Compiler on (D3) · Cache Components / PPR, `/posts` showcase (D4) · `SITE_URL` decouple from `BETTER_AUTH_URL` (D5) · Storybook gallery + `init-app`/degit scaffold (D6) · pg-boss `@repo/jobs` (D7) · built-in `next experimental-analyze` (D8) · Uploadthing → `uploads` table (D9) · rate-limit IP-fallback hardening (D10) · dashboards-as-code `@repo/observability` (D11) |
| Audit · M1–M7 + Tier 2 | OAuth social-login UI (M1) · Sentry/Turbopack source-map doc fix (M2) · real `/account` settings, deleted `/profile` (M3) · CSP-nonce upgrade as opt-in recipe, reverses D4 (M4) · editable email → two-hop confirm + defense-in-depth/revoke-sessions (M5→M6→M7) · opt-in Turbo remote-cache note (Tier 2) |
| Backlog · P0 | Account-page two-hop email-change copy fix (P0-1) · `safeRedirectPath` backslash open-redirect fix + unit tests + coverage gate (P0-2) |
| Backlog · P1 | DB indexes migration 0005 — keyset composite + 5 FK indexes (P1-1) · `reindexPosts` rate-limited 3/min (P1-2) · plain-text part on every email send (P1-3) · env-schema polish: `EMAIL_FROM` / `AUTH_TRUSTED_ORIGINS` / Sentry DSN (P1-4) · workflow actions SHA-pinned + Renovate digest preset (P1-5) · COOP `same-origin` header + `e2e/security-headers.spec.ts` (P1-6) · `setUserRole` audit log + typed "User not found" (P1-7) |
| Backlog · P2 | `/account` Sessions card — list + revoke, optimistic removal (P2-1) · danger-zone account deletion, config-time email/immediate split (P2-2) · `/uploads` read path + delete, remote-first fail-closed, + `delete-uploads` job (P2-3) · Stripe depth: customer reuse · billing portal · `invoice.payment_failed` sync (P2-4) · PostHog identify/reset session watcher (P2-5) · resend-verification affordance + `callbackURL` fix (P2-6) · Meilisearch index settings as code (P2-7) |
| Backlog · P3 | `e2e/account.spec.ts` serial one-user lifecycle (P3-1) · a11y 2→5 scans incl. signed-in `/account` + `/admin` (P3-2) · `packages/auth` pure config helpers extracted + 22 unit tests (P3-3) · `user.ts` action tests, web coverage include → 11 modules (P3-4) · `/admin` keyset pagination + user index migration 0006 (P3-5) · CSP violation-reporting opt-in recipe in SECURITY.md (P3-6) — **audit backlog COMPLETE** |
| Phase 4 · live SaaS | Resend · Sentry (+ source maps) · BetterStack · PostHog · Uploadthing · OAuth (GitHub+Google) · Upstash Redis — all verified live 2026-07-05→07 (provenance banners in [VERIFICATION.md](../VERIFICATION.md)). Stripe = Phase 5, verified 2026-07-13 (row below). |
| Tier 4 · B1 | HIBP compromised-password check · rate-limit 429 response headers (`RateLimit-*`/`Retry-After`) · avatar upload → `user.image`. 2026-07-07→08. See AUTH.md / SECURITY.md / SERVICES.md. |
| Tier 4 · B2 | Two-factor auth — TOTP + backup codes, inline enroll + sign-in challenge, trust-device opt-in. 2026-07-08. See [context/AUTH.md](../context/AUTH.md#two-factor-authentication-2fa--totp-tier-4--band-2). |
| Tier 4 · B2 (ops) | DB backup / restore / DR runbook — `db:backup`/`db:restore` (pgboss-excluded `-Fc` dumps), PITR pointers, restore drill, forward-only rollback. 2026-07-09. See [context/DATABASE.md](../context/DATABASE.md#backup-restore--disaster-recovery). |
| Tier 4 · B4 | Organizations / multi-tenancy — teams + per-org roles, org-scoped `posts`, invitations + accept route. 2026-07-08. See [context/AUTH.md](../context/AUTH.md#organizations--multi-tenancy). |
| Tier 4 · A1–A11 | Band-1 A-rows: sonner toasts · subscription gating + `/premium` · cron job · PG-pooling docs · email render tests · `remotePatterns` · typed `fieldErrors` · search settings-on-create · security.txt · manypkg · pnpm release-age gate. 2026-07-08. |
| Tier 4 · A14–A16 | `Skeleton` + `/posts` loading example · worked `db.transaction` + `post_revisions` · user-keyed rate-limited procedure (`post.listMine`). 2026-07-08. See UI.md / DATABASE.md / API.md. |
| Tier 4 · A19 | Per-integration "Remove it" checklists; email + BetterStack logging documented as load-bearing façades. 2026-07-09. See [context/SERVICES.md](../context/SERVICES.md). |
| Tier 4 · B2 (CI) | Docker-image CI — builds both targets, `/api/health` smoke vs a throwaway Postgres, Trivy gate (`.trivyignore`), opt-in GHCR publish. 2026-07-09. See [context/DEPLOYMENT.md](../context/DEPLOYMENT.md#cicd-github-actions). |
| Tier 4 · A21 | "URL as state" pattern doc — the third state bucket; worked `/admin` pagination + `/login` `redirectTo`. 2026-07-09. See [context/STATE.md](../context/STATE.md#url-as-state-shareable-client-state). |
| Tier 4 · B2 (audit) | Persisted `audit_log` (migration 0011) + shared best-effort `recordAuditEvent()`; FK-less actor/target ids. 2026-07-09. See [context/AUTH.md](../context/AUTH.md#persisted-audit-trail--audit_log-b2). |
| Tier 4 · B2 (audit UI) | `/admin/audit` read surface — keyset-paginated, LEFT-JOIN-resolved emails, uuid-cursor guard. 2026-07-09. See [context/AUTH.md](../context/AUTH.md#persisted-audit-trail--audit_log-b2). |
| Tier 4 · B3 | `@repo/ui` Dialog tall-content fix — the missing height cap was the real fault (old animation diagnosis disproven). 2026-07-09. See UI.md → Dialog + DECISIONS.md. |
| Tier 4 · A17·A18·A20 (docs) | Docs trio: `next/font` recipe (UI.md) · magic-link / email-OTP recipe (AUTH.md) · failed-job observability note (SERVICES.md). 2026-07-09. |
| Tier 4 · B3 (passkeys) | Passkeys / WebAuthn — `@better-auth/passkey`, migration 0012, no new env/CSP; CDP virtual-authenticator E2E. 2026-07-09. See [context/AUTH.md](../context/AUTH.md#passkeys--webauthn-tier-4--band-3). |
| Tier 4 · B3 (privacy) | Consent gate (opt-out-by-default + `ConsentBanner`) + GDPR data export (allowlist-redacted `buildDataExport()`). 2026-07-09. See SERVICES.md → PostHog + AUTH.md → Data export. |
| Tier 4 · Visual regression | Playwright screenshots over the Storybook gallery (both themes, per-OS baselines); lane live since A28. 2026-07-09. See [context/UI.md](../context/UI.md#visual-regression-repoui-opt-in). |
| Tier 4 · B3 (perf) | Bundle-size budget — `size-limit` on the emitted chunks; opt-in `perf` CI job (`ENABLE_PERF`). 2026-07-10. See [context/DEPLOYMENT.md](../context/DEPLOYMENT.md#performance-budgets-opt-in). |
| Tier 4 · B3 (SBOM) | CycloneDX SBOM on every `docker-image` run + SLSA provenance/SBOM attestations riding the opt-in GHCR publish. 2026-07-10. See DEPLOYMENT.md → CI/CD. |
| Tier 4 · B3 (worker) | Slim worker image — esbuild-bundled one-file worker; ~1.57 GB → ~169 MB, Trivy-clean. 2026-07-10. See [context/DEPLOYMENT.md](../context/DEPLOYMENT.md#background-jobs-worker-d7). |
| Tier 4 · B3 (rate-limit storage) | Better Auth limiter → `rateLimit.storage: "database"` (`rate_limit` table, migration 0013; atomic check-and-increment). 2026-07-10. See [context/AUTH.md](../context/AUTH.md#multi-instance-storage). |
| Tier 4 · B4 (admin plugin) | `admin()` adopted to augment RBAC — fresh-gated direct ban writes · plugin impersonation (≤5-min residual documented); migration 0014. 2026-07-10. See [context/AUTH.md](../context/AUTH.md#admin-plugin--ban--impersonation-tier-4--band-4). |
| Tier 4 · B4 (i18n) | next-intl `[locale]` path routing (`as-needed`, en + es), partial primary-journey coverage, per-locale SEO, `LanguageSwitcher`. 2026-07-11. See [context/I18N.md](../context/I18N.md). |
| Tier 4 · A12 (CAPTCHA) | Opt-in Cloudflare Turnstile via Better Auth `captcha()` (conditional spread last before `nextCookies()`); dummy-test-key-verified. 2026-07-11. See [context/AUTH.md](../context/AUTH.md#bot-protection--captcha-cloudflare-turnstile-tier-4--band-2). |
| Tier 4 · B3 (CSP nonce) | Nonce-CSP recipe reworked for the i18n proxy; re-verified end-to-end on `:3100`, then reverted — default stays the static CSP. 2026-07-12. Promoted to the first-class `CSP_MODE=nonce` (Path-to-100 · #10 below). See [context/SECURITY.md](../context/SECURITY.md#csp-strategy-static-vs-nonce-the-csp_mode-switch). |
| Tier 4 · A22 (realtime) | SSE notifications — Postgres LISTEN/NOTIFY → per-user bus → `EventSource` → query cache; persisted `notifications` table (migration 0015). 2026-07-12. See [context/API.md](../context/API.md#realtime--server-sent-events-sse-tier-4--a22). |
| Tier 4 · A23 (realtime) | SSE reconnect backfill — every re-open after the first invalidates `notification.list` (self-healing delivery). 2026-07-11. See API.md → Realtime · STATE.md. |
| Tier 4 · A24 (realtime) | Authoritative unread-count badge — `notification.unreadCount` as SQL `count()`, reconciled in lockstep with the list. 2026-07-11. See API.md → Realtime · STATE.md. |
| Tier 4 · A25 (realtime) | Keyset-paginated `notification.list` — uuid-validated cursor, `InfiniteData`-shaped cache updates. 2026-07-12. See API.md → Realtime · STATE.md. |
| Tier 4 · A29 (DB) | `DB_POOL_MAX` deploy knob → `Pool({ max })`; unset = pg default 10, invalid fails loud. 2026-07-12. See [context/DATABASE.md](../context/DATABASE.md#connection-pooling-managed-postgres--serverless). |
| Tier 4 · A26 (UI) | `Table` primitive in `@repo/ui`; worked consumer: `/admin/audit` converted `<ul>` → `<Table>`. 2026-07-11. See [context/UI.md](../context/UI.md#adding-shadcn-components). |
| Tier 4 · A27 (tooling) | knip dead-code / unused-dep gate in CI's `verify` lane (adoption caught a phantom dep + a redundant devDep). 2026-07-12. See STACK.md / DEPLOYMENT.md → CI/CD / CONVENTIONS.md → Exports. |
| Tier 4 · A30 (i18n docs) | Worked next-intl formatting recipe — `useFormatter`, named formats, the `timeZone`/`now` gotcha. 2026-07-12. See [context/I18N.md](../context/I18N.md#formatting-dates-numbers--currency-useformatter-a30). |
| Tier 4 · A28 (testing) | Linux visual baselines + `ENABLE_VISUAL` — the visual CI lane is live (runs inside the pinned Playwright image). 2026-07-12. See [context/UI.md](../context/UI.md#visual-regression-repoui-opt-in). |
| Tier 4 · A31 (framework) | `typedRoutes` evaluated → **NOT adopted** — vacuous-or-wrong under the `[locale]` tree; next-intl's `pathnames` map is the right tool. 2026-07-12. See [context/DECISIONS.md](../context/DECISIONS.md). |
| Tier 4 · B2 (cursor) | `post.list` / `post.listMine` uuid-cursor hardening (`id: z.uuid()` — the pre-fix 500 leaked the query text). 2026-07-12. See [context/API.md](../context/API.md#cursor-pagination-d1). |
| Tier 4 · A32 (i18n) | Locale-aware date formatting — `formats`/`timeZone` in `request.ts` + the notifications feed → `useFormatter().dateTime`. 2026-07-12. See [context/I18N.md](../context/I18N.md#formatting-dates-numbers--currency-useformatter-a30). |
| Tier 4 · A13 (payments) | Cancel Stripe subscription on account deletion — `beforeDelete` capture → `cancel-stripe-subscriptions` job → env-gated worker cancel (immediate; customer kept). 2026-07-13. See SERVICES.md → Stripe · AUTH.md → Danger zone. |
| Deploy · Fly.io | Real host deploy **PROVEN live 2026-07-13** — committed `fly.toml` + managed `fly postgres`; `/api/health` 200, prod headers, sign-up → user row on the test Fly app. See [context/DEPLOYMENT.md → Fly.io](../context/DEPLOYMENT.md#flyio-worked-runbook) · [VERIFICATION.md](../VERIFICATION.md) Phase 6. |
| Verify · Stripe Phase 5 | Stripe test-mode live-verify **COMPLETE 2026-07-13** — checkout → webhook → row (+ idempotency), customer reuse, billing portal, test-clock dunning → `past_due`, webhook 400/503/429, A13 live cancel. See [VERIFICATION.md](../VERIFICATION.md) Phase 5. |
| Verify · Prod email domain | A real verified sending domain + SPF/DKIM/DMARC recipe; deliverability + hop-2 email-change delivery **proven 2026-07-14**. The then-remaining app-side bounce/complaint handling shipped 2026-07-16 (Path-to-100 · #8 below). See SERVICES.md → Resend · [VERIFICATION.md](../VERIFICATION.md) → Resend. |
| Launch · Public template | **PUBLISHED 2026-07-14** — public GitHub template (fresh single-commit history; pre-launch history bundled + archived privately). Hardening on: secret scanning + push protection · CodeQL (first scan green) · vulnerability alerts · `main` ruleset (no force-push/delete) · topics + template flag. Proven by a fresh-consumer test: degit → install → `init-app` → build → tests, all green, keyless. Donation link live 2026-07-15 — `.github/FUNDING.yml` (`custom:` PayPal.Me) + README Support section. |
| Maintenance · Dependabot | **3 transitive-only alerts remediated 2026-07-15** via temporary pnpm `overrides:` (`effect: 3.21.4` HIGH via uploadthing · `"postcss@<8.5.10": 8.5.15` via next's own pin · `"@esbuild-kit/core-utils>esbuild": 0.25.12` via drizzle-kit) — no upstream fix exists for any; the `ignoreGhsas` allowlist emptied the same day so `pnpm audit` guards the overrides live. Removal conditions → [MAINTENANCE.md → Watch items](../MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done). |
| Path-to-100 · #1 | `updatePost` → A7 `fieldErrors` — validation failures now map every failing field (`zodFieldErrors`), the edit form applies them inline via the shared `FieldActionError` (`@/lib/forms`); both post writes share the convention. 2026-07-16. See [context/API.md](../context/API.md#typed-field-errors--the-actionresult-convention-a7). |
| Path-to-100 · #2 | Zustand `persist` wired to `ui-store` (hydration-safe: `partialize` + `skipHydration` + post-paint `<StoreRehydration/>` in the `[locale]` layout, optional-chained — the persist API is absent when storage is unavailable, verified in the installed zustand v5). Unit tests pin partialize/skipHydration/no-storage; `e2e/state.spec.ts` proves reload persistence with zero hydration errors. 2026-07-16. See [context/STATE.md](../context/STATE.md#middleware-decision). |
| Path-to-100 · #5 | `reindexPosts` admin-gated (`requireAdmin()`, the `setUserRole` convention — supersedes the P1-2 any-signed-in-user demo decision); `/search` resolves the same check server-side and hides the button for non-admins. Live-verified: logged-out/non-admin hidden → psql promote → same session sees the button (fresh DB role read) → "Reindexed 12 posts." against real Meilisearch. 2026-07-16. See [context/SERVICES.md](../context/SERVICES.md#meilisearch). |
| Path-to-100 · #3 | Jobs dead-letter queue wired — worker creates every queue with `deadLetter: "failed-jobs"` **and** `updateQueue`-converges pre-existing databases (`createQueue` is `ON CONFLICT DO NOTHING`, verified in installed pg-boss 12.20.0 + live: all 4 queues stamped); watched DLQ consumer logs + captures to Sentry via `@sentry/node` 10.59.0 when `NEXT_PUBLIC_SENTRY_DSN` is set (reused — zero new env). Integration test proves exhausted job → DLQ with original payload on real Postgres. 2026-07-16. See [context/SERVICES.md](../context/SERVICES.md#background-jobs--repojobs--pg-boss-d7). |
| Path-to-100 · #4 | Uploads verifiability closed — keyless CI-honest `e2e/uploads.spec.ts` (#4a, the last zero-e2e integration) + the `UPLOADTHING_CALLBACK_URL` tunnel runbook, live-proven 2026-07-17 (#4b — dated box in VERIFICATION.md). 2026-07-16 → 17. See [context/SERVICES.md](../context/SERVICES.md#uploadthing-file-uploads) · [VERIFICATION.md](../VERIFICATION.md). |
| Path-to-100 · #6 | Magic-link sign-in wired (promotes the A18 recipe) — `magicLink()` env-gated on `isEmailConfigured()` so affordance + endpoints appear/disappear together; capture-seam e2e (second :3001 webServer) + live :3100 send proof. 2026-07-16. See [context/AUTH.md](../context/AUTH.md#magic-link-sign-in-env-gated-path-to-100-6) · [context/TESTING.md](../context/TESTING.md#email-capture--the-magic-link-e2e-path-to-100-6). |
| Path-to-100 · #7 | i18n full-surface coverage — en/es catalogs extended to every `[locale]` surface (identical key trees — 485 at ship, grown by later rows; en byte-identical); all six `toLocale*` sites → the A32 named formats (+ `dateOnly`); es e2e chrome + signed-in date spot-check. 2026-07-16. See [context/I18N.md](../context/I18N.md). |
| Path-to-100 · #8 | Email bounce/complaint handling — signature-verified `POST /api/resend/webhook` (zero new deps) → `email_suppressions` (migration 0016) → every `send*` helper consults `isEmailSuppressed()` (env-gated on `RESEND_WEBHOOK_SECRET`, fail-open); jobs complete instead of retrying suppressed sends; self-signed-svix e2e + live :3100 proof. 2026-07-16. See [context/SERVICES.md](../context/SERVICES.md#bounce--complaint-handling-path-to-100-8) · [context/DATABASE.md](../context/DATABASE.md#email-suppressions-email_suppressions--do-not-send-list-migration-0016). |
| Path-to-100 · #9 | Opt-in OpenTelemetry — OTLP/HTTP trace export gated on `OTEL_EXPORTER_OTLP_ENDPOINT` (runtime; unset = prior behavior exactly), riding **Sentry's own OTel provider** via `openTelemetrySpanProcessors` — one provider, no double-instrumentation, works DSN-less; live matrix vs a local collector (inert · OTLP-only · dual export). 2026-07-16. See [context/SERVICES.md](../context/SERVICES.md#opentelemetry-export-opt-in-path-to-100-9). |
| Path-to-100 · #10 | `CSP_MODE=nonce` as a first-class **build-time** mode — one shared directive list (`src/lib/csp.ts`) feeds the static default (byte-identical to pre-#10) and the proxy's per-request `'nonce-…' 'strict-dynamic'` CSP; nonce builds keep the D4 `"use cache"` showcase via `experimental.useCache`; `e2e/csp-nonce.spec.ts` matrix in the `ENABLE_CSP_NONCE` CI lane (ON here). 2026-07-17. See [context/SECURITY.md](../context/SECURITY.md#csp-strategy-static-vs-nonce-the-csp_mode-switch). |
| Maintenance · init-app slim | `pnpm init-app` now offers to remove the template's own history/marketing docs from a derived app (interactive y/N; `--slim`/`--keep-template-docs` for scripts; idempotent) — deletes PROJECT_STATUS/BACKLOG/archive/plain-english-guide/FUNDING.yml, resets CHANGELOG, neutralizes the README + AGENTS.md template references, reports leftover mentions. Scratch-verified: fresh run, patched content, idempotent re-run. 2026-07-17. See [GETTING_STARTED.md](../GETTING_STARTED.md#remove-what-you-dont-need). |
| Path-to-100 · #11 | Per-org billing (the program's last row) — `subscriptions` owned by exactly ONE of user/org (migration 0017, `num_nonnulls` XOR; org rows carry no `user_id`, so a member's deletion can't cancel org billing); org-context checkout/portal (owner/admin gate before the config gate), webhook `metadata.organizationId` mapping, `hasOrgSubscription()` + context-aware `/premium` + org-aware `/billing`, org-delete → the A13 cancel job. Live-verified in test mode; keyless `e2e/billing-org.spec.ts`. 2026-07-17. See [context/SERVICES.md](../context/SERVICES.md#stripe-payments) · [context/DATABASE.md](../context/DATABASE.md#stripe-subscriptions-subscriptions--implemented-phase-3--c4-org-aware-11). |
| Maintenance · on-ramp U1+U2 | Trial follow-ups: `--slim` leftover-pointer tidy (retarget at the template repo / rewrite, per-line report, idempotent — scratch-verified twice) + pre-seeded `PRODUCT.md` context-index placeholder, uncommented by `/project-init` (kit 0.4.2). 2026-07-18. See [GETTING_STARTED.md](../GETTING_STARTED.md#remove-what-you-dont-need) · AGENTS.md · ai-dev-kit CHANGELOG. |
| Maintenance · B3 kit extraction | ai-dev-kit → standalone public repo [jrittelmeyer/ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit) (kit 0.5.0; doc-audit 0.1.1 source-of-truth handoff; two-OS smoke CI; secret scanning/vuln alerts/CodeQL/protect-main hardening). This repo consumes the installed `.claude/` output and re-installs from a clone via `--dest`. 2026-07-18. See [CLAUDE.md](../../CLAUDE.md) · BACKLOG shipped row. |
| Maintenance · Renovate majors | 7 pending-approval majors triaged, approved & merged 2026-07-18 — actions/checkout v7 · setup-node v6 · upload-artifact v7 · codecov v7 · codeql-action v4 · pnpm/action-setup v6 · postgres 18 (compose + the 3 CI services + doc mentions in one merge), plus the required 18+ fix: compose volumes mount `/var/lib/postgresql` (18+ images refuse the old `/data` path — docker-library/postgres#1259; caught by the local fresh-volume proof, 18.4 healthy + migrations green). typescript-v7 held (TS7 gate, see BACKLOG). CI green, 0 open code-scanning alerts. |
| Maintenance · project-adopt 1+2 | Brownfield inception door: `/project-adopt` (kit 0.6.0 — existing codebase → parity contract → honest theirs-vs-template disposition map → `docs/PRODUCT.md` + `docs/MIGRATION.md` → port backlog; adapter gains `init.migrationMap`/`init.sourceDir`) + template wiring (gitignored `intake/source/` drop + `intake/README.md`, GETTING_STARTED on-ramp section). Steps 1+2 2026-07-19. See [GETTING_STARTED.md](../GETTING_STARTED.md#starting-from-an-existing-app-run-project-adopt) · ai-dev-kit CHANGELOG 0.6.0. |
| Maintenance · project-adopt 3 (trial) | Live trial **COMPLETE 2026-07-19 — program closed at kit 0.6.1** (project-adopt 0.1.1). Full flow on a fresh degit consumer copy adopting **linkding 1.45.0**: live-local reference grade via its own compose, both intake forms + re-run/resume branch, disposition map, importer-as-feature migration plan, inception commit excluding the gitignored source. Mends: copy-verbatim-by-reference, question-round batching/assumption marking. Template findings → BACKLOG (slim leftover-pointer tidy #2, UI.md token-sheet recipe) + the AGENTS.md wrapper now names both inception doors. |
| Maintenance · slim tidy #2 + M-1 | The two `docs/MAINTENANCE.md` mention-patches in `init-app --slim` had drifted out from under the doc text (a "Currently:" rewording + a paragraph rewrap made the content-matched `from`-strings no-op), leaving the `:71`/`:114` pointers dead post-slim — the trial's report caught it as designed; `from`-strings updated to the current text, scratch-verified (fresh + idempotent re-run, intentional-only report). Ride-along: the two stale `postgres:16` comments → `postgres:18` (M-1 — closes the 07-18 audit's one nit; CI has been `postgres:18` since the majors merge). 2026-07-19. |
| Maintenance · B3 token-sheet recipe | UI.md gains "Adopting an existing brand / token sheet" — the worked mapping from a `/project-adopt`-survey-shaped token sheet onto `tooling/tailwind/base.css`: palette → semantic slots in oklch, authored (not inverted) `.dark`, `next/font` hand-off, radius/spacing/breakpoints, chart/sidebar satellite sets, Storybook both-themes verify + visual-baseline note. Surfaced by the linkding adopt trial (every keep-theirs design system needs this path); AGENTS.md UI.md-row trigger words extended. Docs-only; scratch `--slim` re-verified (fresh + idempotent, intentional-only report). 2026-07-19. See [context/UI.md](../context/UI.md#adopting-an-existing-brand--token-sheet). |
| Maintenance · CI heartbeat | `ci.yml` gains a weekly `schedule` (Thursdays 04:30 UTC) + `workflow_dispatch` so the full pipeline (e2e / docker-image / scan) keeps running between merges — in maintenance mode a push was the only thing exercising CI, so "green" could rot silently against world-drift. Offset from CodeQL's Monday cron; opt-in GHCR steps stay `push`-gated. Verified: `workflow_dispatch` run green (first scheduled run self-confirms next cron). 2026-07-20. See [.github/workflows/ci.yml](../../.github/workflows/ci.yml) · [context/DEPLOYMENT.md](../context/DEPLOYMENT.md#cicd-github-actions). |
| Maintenance · Storybook on Pages | Published the `@repo/ui` **Storybook** component gallery to **GitHub Pages** — new `.github/workflows/pages.yml` (build → `configure-pages` / `upload-pages-artifact` / `deploy-pages`, all SHA-pinned; subpath-safe relative assets), on push to `main` touching `packages/ui/**` + `workflow_dispatch`. Pages enabled once via the API (the Actions `GITHUB_TOKEN` can't create the site — one-time out-of-band setup). Live at <https://jrittelmeyer.github.io/next-web-boilerplate/>; linked from README + UI.md. This is the visual-surface backlog row's **gallery half**; the README screenshot tour (row below) is the other half — together they close the row. 2026-07-20. See [.github/workflows/pages.yml](../../.github/workflows/pages.yml) · [context/DEPLOYMENT.md](../context/DEPLOYMENT.md#storybook-on-github-pages-component-gallery). |
| Maintenance · tagged releases | Cut the repo's first git tags + GitHub Releases (none existed despite a CHANGELOG `[1.0.0]`): **v1.0.0** on the launch commit `f224e98` + **v1.1.0** on the current tip, notes from a new CHANGELOG `[1.1.0]` milestone rollup (path-to-100 → 100/100, ai-dev-kit + both inception doors, PG-18, CI heartbeat) with compare links. Plus a GETTING_STARTED "Staying current with the template" recipe — remote + fetch + **cherry-pick** (naive merge refused; `--allow-unrelated-histories` = 143 conflicts, both dry-run-proven), honest conflict zones. 2026-07-20. See [CHANGELOG.md](../../CHANGELOG.md) · [GETTING_STARTED.md](../GETTING_STARTED.md#staying-current-with-the-template). |
| Maintenance · B3 screenshot tour | The README **screenshot tour** — 4 retina PNGs captured from a real **keyless** prod run (landing light+dark, signed-in dashboard, `/account`) via a throwaway Playwright script against a fresh `:3100` build, committed to `docs/assets/` and wired into a `## Screenshots` section high in the README (right after the status blurb) + a "See it" strip in FEATURES.md. Shots use the two-env-var-only surface — no third-party keys, no consent banner. **Closes the B3 visual-surface row** (gallery + tour both shipped). 2026-07-20. See [README.md](../../README.md#screenshots) · [docs/FEATURES.md](../FEATURES.md). |
| Maintenance · advisories #2 | **4 transitive-only advisories remediated 2026-07-22** via pnpm `overrides:` (`brace-expansion: 5.0.7` HIGH via minimatch/glob build-tooling paths · `dompurify: 3.4.12` via posthog-js's sanitizer · `sharp: 0.35.3` HIGH, bypassing next's own exact `^0.34.5` pin which excluded the libvips CVE fix) — none had an upstream fix at triage time. **Only `brace-expansion` was a Dependabot alert** — the other three surfaced in the CI `pnpm audit` lane, which is the authoritative gate here (2026-07-22 audit, F3). `fast-uri`'s fix (3.1.4, published 2026-07-19) is deliberately deferred via a dated `auditConfig.ignoreGhsas` pair until it clears the 7-day age gate (~2026-07-26); build-tool-only path, zero request-handling exposure. Removal conditions → [MAINTENANCE.md → Watch items](../MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done). |
| Maintenance · audit-22 B1 trio | The tenth-pass audit's three B1 rows, shipped 2026-07-22: **Renovate schedule widened** — explicit `timezone` (America/New_York), full-day `["on monday"]` window on both schedule keys (was a 6-hour UTC window Mend's hosted run cadence never intersected — the scheduled lane had produced **0 PRs ever**), `prHourlyLimit: 0` + explicit `prConcurrentLimit: 10` (bounded triage preserved); config-validator-verified, **behavioral proof = PRs opening at the next Monday window (2026-07-27)**. **CHANGELOG security record** — `[Unreleased]` gains Fixed (the schedule fix + a copy-me note for downstream renovate.json copies) and Security (both override batches; `sharp` 0.35.3 forced past Next's own `^0.34.5` on the `/_next/image` runtime path flagged; `pnpm audit` named the authoritative advisory gate). **Workspace relabel** — pnpm-workspace.yaml's 2026-07-22 header → "Advisory remediation" with correct provenance; stale next-version notes → 16.2.11. Full gate + audit lane green (audit F1–F3 + 22B N2). |
| Maintenance · audit-22 B2 | Image-optimization e2e coverage, closing the tenth-pass audit's **last open row (F4)**: keyless, DB-free `e2e/image-optimization.spec.ts` + a committed 700-byte `/public` gradient fixture assert `/_next/image` transforms for real on the prod-build webServer — PNG→webp under `Accept: image/webp` · an IHDR-width-verified 256→64 resize for a png-only client · 400 for a non-allowlisted remote `url=` (no fetch). The `sharp` 0.35.3 override is **exercised** on every e2e run now, not merely installed (a sharp that stops transforming turns the lane red). 2026-07-22. See [context/TESTING.md](../context/TESTING.md) · [context/SERVICES.md](../context/SERVICES.md) · [MAINTENANCE.md](../MAINTENANCE.md). |
| Maintenance · security triage pipeline | Advisory response hardened after the 2026-07-22 Next.js batch (9 GHSAs on an untouched green tree) sat unrouted: new daily **`security-audit.yml`** watch lane (moderate+ threshold) + a rolling **`security-triage` issue** auto-filed red / auto-closed green (`.github/scripts/security-triage-issue.sh`; ci.yml's audit lane syncs the same issue on non-PR `main` runs — merge gate stays high/critical), plus the **Security response runbook** in [MAINTENANCE.md](../MAINTENANCE.md#security-response-runbook) (ranked signals — `pnpm audit` over Dependabot — and the bump/override/ignoreGhsas/age-exclude decision tree). 2026-07-23. See [context/DEPLOYMENT.md](../context/DEPLOYMENT.md#cicd-github-actions). |
| Maintenance · advisories #3 | **`next` 16.2.9 → 16.2.11** — the 2026-07-22 Next.js batch (9 GHSAs vs `<16.2.11`: 4 high incl. middleware/proxy bypass + Server-Action DoS/SSRF, 5 moderate) remediated the day after disclosure. The patched release (published 2026-07-21) was 2 days old → dated `minimumReleaseAgeExclude` for `next`/`@next/*` (**remove 2026-07-28**; MAINTENANCE Watch item). Lockfile diff verified surgical (next family only; siblings are peer-suffix rewrites). **First advisory wave through the security-triage pipeline** (row above): issue #9 auto-filed by the red push + appended by the dispatched daily lane; closed by this commit's green run. 2026-07-23. See [MAINTENANCE.md](../MAINTENANCE.md#security-response-runbook) · [CHANGELOG.md](../../CHANGELOG.md). |

### "Where we are" bullets compressed in the same pass (2026-07-23, verbatim)

- **Every locally-buildable Tier-4 row is SHIPPED (2026-07-07 → 13)** — including the
  A23–A31 polish rows, A32, and A13. Eleven `/project-audit` passes graded the repo
  **93 → 97.5 → 98.2 → 99.3 → 99.3 → 99.3 → 99.35 → 100.0 → 100.0 → 99.65 → 99.65/100**
  (2026-07-08 · 07-12 · 07-12B · 07-14 · 07-14B post-launch · 07-15 · 07-15B ·
  **07-17, the path-to-100 verification** · 07-18, the first maintenance-mode pass ·
  **07-22, the tenth pass — 99.65, the first drop, and none of it code**: product
  code is byte-identical bar the M-1 comment fix, but Renovate's scheduled lane has
  **never delivered a PR** (37 updates stalled behind a 6-hour weekly window), the
  CHANGELOG records **no** security remediation, and the `sharp` override rides an
  untested `/_next/image` path · **07-22B, a same-day live-surface re-check —
  99.65 holds** on the byte-identical tree: every gate stands, `pnpm audit` clean,
  alert #4 still pending auto-close. Four B1/B2 backlog rows — **all four
  shipped same-day** (audit-22 B1 trio + B2 rows below); the audit ledger is
  clear again. Reports in
  [docs/archive/](./), latest:
  [PROJECT_AUDIT_2026-07-22B.md](PROJECT_AUDIT_2026-07-22B.md)).
- **ai-dev-kit (2026-07-17 → 19):** the repo's agentic-dev
  techniques are codified into a portable skill library — the standalone public
  [ai-dev-kit repo](https://github.com/jrittelmeyer/ai-dev-kit) (kit 0.6.1: 8
  skills incl. the two inception doors — `/project-init` from an idea,
  `/project-adopt` from an existing codebase, both live-trial-proven —
  advise-never-block hooks, the
  why-layer playbook + catalog deck, and a cross-platform installer with drift
  guard). This repo consumes the installed output — `.claude/skills/` and
  `.claude/hooks/ai-dev-kit/` are committed installer output; edit a clone of the
  kit repo and re-install (`--dest <this repo>`), never the copies. All kit
  programs are COMPLETE (the project-adopt trial closed 2026-07-19). Full
  program history (the 3-step build, project-init + the "Potluck" live trial,
  U1/U2, the B3
  extraction) → [archive/PHASE_HISTORY.md](PHASE_HISTORY.md).

## BACKLOG shipped-row archive (moved 2026-07-23)

All shipped strikethrough rows, moved verbatim from [../BACKLOG.md](../BACKLOG.md)'s
Tier-4 "Shipped" table (relative link paths rewritten for this file's location; Band
letters preserved). Future shipped rows keep one strikethrough line in BACKLOG until
the next archive sweep.

| Band | Upgrade | Shipped | See |
| --- | --- | --- | --- |
| B2 | ~~Image-optimization path covered~~ — keyless `e2e/image-optimization.spec.ts` + a committed 700-byte `/public` gradient fixture assert `/_next/image` really transforms on the prod-build webServer: PNG→webp under `Accept: image/webp`, an IHDR-width-verified 256→64 resize for a png-only client, and 400 for a non-allowlisted remote `url=` (rejected before any fetch — keyless/CI-safe). The `sharp: 0.35.3` override is now **exercised** on every e2e run, not merely installed — closes the 2026-07-22 audit's last open row (F4) | 2026-07-22 | apps/web/e2e/image-optimization.spec.ts · [context/TESTING.md](../context/TESTING.md) · [context/SERVICES.md](../context/SERVICES.md) |
| B1 | ~~2026-07-22 audit B1 trio~~ — **Renovate schedule widened** (explicit `timezone: America/New_York`, full-day `["on monday"]` on both schedule keys, `prHourlyLimit: 0` + explicit `prConcurrentLimit: 10`; config-validator-verified — the scheduled lane had never delivered a PR; **behavioral proof = PRs opening at the next Monday window, 2026-07-27**) · **CHANGELOG `[Unreleased]` Fixed + Security record** (both override batches; `sharp` forced past Next's `^0.34.5` flagged; copy-me note for downstream renovate.json copies) · **pnpm-workspace.yaml relabel** ("Advisory remediation", pnpm-audit provenance, next-version notes → 16.2.11) | 2026-07-22 | [.github/renovate.json](../../.github/renovate.json) · [CHANGELOG.md](../../CHANGELOG.md) · [archive/PROJECT_AUDIT_2026-07-22.md](PROJECT_AUDIT_2026-07-22.md) F1–F3 |
| B3 | ~~Visual surface (a): README screenshot tour~~ — 4 retina PNGs from a real **keyless** prod run (landing light+dark, signed-in dashboard, `/account`), captured via a throwaway Playwright script against a fresh `:3100` build, committed to `docs/assets/` and wired into a `## Screenshots` section high in the README + a "See it" strip in FEATURES.md. Two-env-var-only surface (no keys, no consent banner). **This closes the whole B3 visual-surface row** (both halves shipped) | 2026-07-20 | [README.md](../../README.md#screenshots) · [docs/FEATURES.md](../FEATURES.md) · docs/assets/ |
| B3 | ~~Visual surface (b): hosted component gallery on GitHub Pages~~ — new `.github/workflows/pages.yml` publishes the `@repo/ui` Storybook static export to Pages (build → `configure-pages` / `upload-pages-artifact` / `deploy-pages`, SHA-pinned; subpath-safe relative assets; push-to-`main`-on-`packages/ui/**` + `workflow_dispatch`; Pages enabled once out-of-band — the Actions token can't create the site). Live at jrittelmeyer.github.io/next-web-boilerplate; linked from README + UI.md. Screenshot-tour half (a) shipped alongside (row above) | 2026-07-20 | [.github/workflows/pages.yml](../../.github/workflows/pages.yml) · [context/DEPLOYMENT.md](../context/DEPLOYMENT.md#storybook-on-github-pages-component-gallery) |
| B1 | ~~Tagged releases + template-update path~~ — cut the repo's first git tags + GitHub Releases (**v1.0.0** on launch `f224e98`, **v1.1.0** on the tip) with a new CHANGELOG `[1.1.0]` milestone rollup + compare links; a GETTING_STARTED "Staying current with the template" recipe (remote + fetch + **cherry-pick**; naive merge refused / `--allow-unrelated-histories` = 143 files, dry-run-proven; honest conflict zones) | 2026-07-20 | [CHANGELOG.md](../../CHANGELOG.md) · [GETTING_STARTED.md](../GETTING_STARTED.md#staying-current-with-the-template) |
| B3 | ~~Scheduled CI heartbeat on `main`~~ — a weekly `schedule` (`cron: "30 4 * * 4"` — Thursdays 04:30 UTC) + `workflow_dispatch` added to `ci.yml` so the full pipeline (e2e / docker-image / scan) keeps running between merges; offset from CodeQL's Monday cron, opt-in GHCR steps stay `push`-gated. Verified: `workflow_dispatch` run green (first scheduled run self-confirms at the next cron) | 2026-07-20 | [.github/workflows/ci.yml](../../.github/workflows/ci.yml) · [context/DEPLOYMENT.md](../context/DEPLOYMENT.md#cicd-github-actions) |
| B3 | ~~UI.md token-sheet adoption recipe~~ — worked "adopt an existing brand/token sheet" section: a `/project-adopt`-survey-shaped sheet mapped in five moves onto `tooling/tailwind/base.css` (semantic slots + oklch, authored `.dark`, `next/font` hand-off, radius/spacing/breakpoints, chart/sidebar sets; Storybook both-themes verify + visual-baseline note); AGENTS.md UI.md-row trigger words extended | 2026-07-19 | [context/UI.md](../context/UI.md#adopting-an-existing-brand--token-sheet) |
| B1 | ~~`init-app --slim` leftover-pointer tidy #2~~ — the two `docs/MAINTENANCE.md` mention-patches had drifted out from under the doc text (a "Currently:" rewording + a paragraph rewrap), so slim left the `:71`/`:114` pointers dead; `from`-strings updated to the current text — scratch-verified fresh + idempotent re-run (report now lists only the intentional GETTING_STARTED lines) | 2026-07-19 | scripts/init-app.mjs · GETTING_STARTED.md → Remove what you don't need |
| B1 | ~~M-1: two stale `postgres:16` comments → `postgres:18`~~ — the last two in-code mentions of the pre-2026-07-18 CI service version, closing the 07-18 audit's one nit | 2026-07-19 | packages/db/vitest.config.ts · packages/jobs/vitest.integration.config.ts |
| B1 | ~~project-adopt live trial (program step 3)~~ — full `/project-adopt` flow on a fresh degit consumer copy adopting **linkding 1.45.0**: live-local reference grade (booted via its own compose), drop-dir + git-URL intake forms + the re-run/resume branch, five-bucket disposition map, importer-as-feature migration plan, inception commit excluding the gitignored source; two skill mends → **kit 0.6.1** (project-adopt 0.1.1) — **project-adopt program COMPLETE** | 2026-07-19 | ai-dev-kit CHANGELOG 0.6.1 · PROJECT_STATUS row |
| B3 | ~~ai-dev-kit extraction~~ — the kit is a standalone public repo, [jrittelmeyer/ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit) (0.5.0: fresh single-commit history, two-OS smoke CI, secret scanning + vuln alerts + CodeQL + protect-main ruleset); this repo consumes the installed `.claude/` output and re-installs from a clone (`--dest`); doc-audit's dual-home source of truth handed to the kit repo (0.1.1) | 2026-07-18 | CLAUDE.md · PROJECT_STATUS B3 row |
| B1 | ~~`init-app --slim` leftover-mention tidy (U1)~~ — the 8 known dead pointers in kept docs are retargeted at the public template repo or rewritten; the report is per-line and skips deliberate retargets | 2026-07-18 | scripts/init-app.mjs · GETTING_STARTED.md → Remove what you don't need |
| B1 | ~~AGENTS.md `PRODUCT.md` index placeholder (U2)~~ — commented row under the context-doc table; `/project-init` (0.1.2, kit 0.4.2) uncomments it instead of authoring a row | 2026-07-18 | AGENTS.md · ai-dev-kit CHANGELOG 0.4.2 |
| B1 | ~~project-init live trial (program step 3)~~ — full `/project-init` flow on a fresh degit consumer copy (sample product "Potluck"); two skill mends → **kit 0.4.1**; trial findings U1/U2 became the on-ramp rows above | 2026-07-18 | ai-dev-kit CHANGELOG 0.4.1 · PROJECT_STATUS ai-dev-kit row |
| B1 | ~~UT prod-callback tunnel proof (program #4b)~~ — closed program #4 | 2026-07-17 | SERVICES.md → Uploadthing · VERIFICATION.md → Uploadthing |
| B4 | ~~Per-org billing (program #11)~~ | 2026-07-17 | SERVICES.md → Stripe · PROJECT_STATUS Path-to-100 · #11 |
| B3 | ~~`CSP_MODE=nonce` as a first-class mode (program #10)~~ | 2026-07-17 | SECURITY.md → CSP strategy · PROJECT_STATUS Path-to-100 · #10 |
| B3 | ~~Opt-in OpenTelemetry (program #9)~~ | 2026-07-16 | SERVICES.md → OpenTelemetry · PROJECT_STATUS Path-to-100 · #9 |
| B3 | ~~Email bounce/complaint handling (program #8)~~ | 2026-07-16 | SERVICES.md → Resend (bounce/complaint) · PROJECT_STATUS Path-to-100 · #8 |
| B2 | ~~i18n full-surface message coverage (program #7)~~ | 2026-07-16 | I18N.md · PROJECT_STATUS Path-to-100 · #7 |
| B2 | ~~Magic-link sign-in, env-gated (program #6)~~ | 2026-07-16 | AUTH.md → Magic link · PROJECT_STATUS Path-to-100 · #6 |
| B1 | ~~`updatePost` → `fieldErrors` error shape (program #1)~~ | 2026-07-16 | API.md → Typed field errors · PROJECT_STATUS Path-to-100 · #1 |
| B1 | ~~`persist` wired to `ui-store`, hydration-safe (program #2)~~ | 2026-07-16 | STATE.md → Middleware decision · PROJECT_STATUS Path-to-100 · #2 |
| B1 | ~~Admin-gate `reindexPosts` (program #5)~~ | 2026-07-16 | SERVICES.md → Meilisearch · PROJECT_STATUS Path-to-100 · #5 |
| B1 | ~~Dead-letter queue wired (program #3)~~ | 2026-07-16 | SERVICES.md → Jobs (dead-letter) · PROJECT_STATUS Path-to-100 · #3 |
| B1 | ~~Enable CodeQL~~ — `ENABLE_CODEQL` flipped the day the repo went public (code scanning is free on public repos); the pre-publish git-history secrets scan happened as part of the launch. | 2026-07-14 | DEPLOYMENT.md → CI/CD · PROJECT_STATUS launch row |
| B3 | ~~Production sending domain + deliverability~~ — a real verified domain + SPF/DKIM/DMARC recipe; deliverability + the hop-2 email-change delivery gap (open since 2026-07-05) proven/closed live. Bounce/complaint handling remains open (row above). | 2026-07-14 | [SERVICES.md → Resend](../context/SERVICES.md) · [VERIFICATION.md](../VERIFICATION.md) → Resend |
| B1 | ~~Real host deploy~~ — **PROVEN live on Fly.io** (test app, managed `fly postgres`; `/api/health` 200 + sign-up→DB confirmed). Vercel/Railway/VPS paths stay authored. | 2026-07-13 | [DEPLOYMENT.md → Fly.io](../context/DEPLOYMENT.md#flyio-worked-runbook) · [VERIFICATION.md](../VERIFICATION.md) Phase 6 |
| B2 | ~~Stripe Phase-5 live-verify~~ — **COMPLETE in test mode** (checkout → webhook → row + idempotency; customer reuse; billing portal; test-clock dunning; webhook 400/503/429; A13 cancel-on-delete live). Doc-only close. | 2026-07-13 | [VERIFICATION.md](../VERIFICATION.md) Phase 5 |
| B1 | ~~HIBP compromised-password check · 429 rate-limit headers · Avatar upload~~ | 2026-07-07→08 | AUTH.md / SECURITY.md / SERVICES.md |
| B1 | ~~A1 toasts · A2 subscription gating · A3 cron job · A4 PG-pooling docs · A5 email render tests · A6 remotePatterns · A7 fieldErrors · A8 search settings-on-create · A9 security.txt · A10 manypkg · A11 release-age gate~~ | 2026-07-08 | PROJECT_STATUS **Tier 4 · A1–A11** row |
| B2 | ~~2FA / TOTP~~ | 2026-07-08 | AUTH.md → Two-factor |
| B2 | ~~A14 Skeleton · A15 db.transaction example · A16 user-keyed rate-limited procedure~~ | 2026-07-08 | UI.md / DATABASE.md / API.md |
| B2 | ~~DB backup / restore / DR runbook~~ | 2026-07-09 | DATABASE.md → Backup, restore & DR |
| B2 | ~~Persisted audit log + `/admin/audit` read UI~~ | 2026-07-09 | AUTH.md → Persisted audit trail |
| B2 | ~~Docker-image CI (build · smoke · Trivy · opt-in GHCR publish)~~ | 2026-07-09 | DEPLOYMENT.md → CI/CD |
| B2 | ~~A12 — Opt-in CAPTCHA (Cloudflare Turnstile)~~ | 2026-07-11 | AUTH.md → Bot protection / CAPTCHA |
| B3 | ~~Passkeys / WebAuthn~~ | 2026-07-09 | AUTH.md → Passkeys |
| B3 | ~~Consent gate + GDPR data-export~~ | 2026-07-09 | SERVICES.md → PostHog + AUTH.md → Data export |
| B3 | ~~`@repo/ui` Dialog tall-content fix~~ | 2026-07-09 | UI.md → Dialog |
| B3 | ~~A17 next/font recipe · A18 magic-link/OTP recipe · A19 removal checklists · A20 failed-job note · A21 URL-state doc~~ | 2026-07-09 | UI.md / AUTH.md / SERVICES.md / STATE.md |
| B3 | ~~Visual regression for `@repo/ui` (opt-in)~~ | 2026-07-09 | UI.md → Visual regression |
| B3 | ~~Performance budgets in CI (opt-in)~~ | 2026-07-10 | DEPLOYMENT.md → Performance budgets |
| B3 | ~~SBOM / provenance attestation~~ | 2026-07-10 | DEPLOYMENT.md → CI/CD |
| B3 | ~~Multi-instance rate-limit storage~~ | 2026-07-10 | AUTH.md → Multi-instance storage |
| B3 | ~~Slim worker image~~ | 2026-07-10 | DEPLOYMENT.md → Background-jobs worker |
| B3 | ~~CSP-nonce example rework for the i18n proxy~~ | 2026-07-12 | SECURITY.md → CSP strategy · DECISIONS.md |
| B4 | ~~Organizations / multi-tenancy~~ | 2026-07-08 | AUTH.md → Organizations |
| B4 | ~~Admin plugin (ban + impersonation)~~ | 2026-07-10 | AUTH.md → Admin plugin |
| B4 | ~~i18n / next-intl~~ | 2026-07-11 | I18N.md |
| B4 | ~~A22 — SSE / realtime notifications example~~ | 2026-07-12 | API.md → Realtime / SSE |
| B3 | ~~A23 — SSE reconnect backfill~~ | 2026-07-11 | API.md → Realtime / SSE · STATE.md |
| B3 | ~~A26 — `Table` primitive in `@repo/ui` (+ `/admin/audit` consumer)~~ | 2026-07-11 | UI.md → Adding shadcn Components |
| B3 | ~~A24 — authoritative unread-count badge (`notification.unreadCount` as SQL `count()`, wired to the feed)~~ | 2026-07-11 | API.md → Realtime / SSE · STATE.md |
| B3 | ~~A25 — keyset-paginate `notification.list` ("Load more"; infinite-query cache)~~ | 2026-07-12 | API.md → Realtime / SSE · STATE.md |
| B3 | ~~A29 — `DB_POOL_MAX` env → `Pool({ max })` (deploy-tunable pool size)~~ | 2026-07-12 | DATABASE.md → Connection pooling · DEPLOYMENT.md |
| B3 | ~~A28 — Linux visual baselines + `ENABLE_VISUAL` (the visual lane runs on every PR/push now)~~ | 2026-07-12 | UI.md → Visual regression |
| B3 | ~~A27 — dead-code / unused-dep gate (knip) in CI's `verify` lane~~ | 2026-07-12 | STACK.md · DEPLOYMENT.md → CI/CD · CONVENTIONS.md → Exports |
| B3 | ~~A30 — worked next-intl formatting recipe (`useFormatter` / named formats / `timeZone` gotcha)~~ | 2026-07-12 | I18N.md → Formatting dates, numbers & currency |
| B2 | ~~`post.list` / `post.listMine` uuid-cursor hardening (`id: z.uuid()`, the A25 pattern; pre-fix 500 live-reproduced — the error body leaked the query text)~~ | 2026-07-12 | API.md → Cursor pagination |
| B3 | ~~A32 — locale-aware date formatting (`formats`/`timeZone` in `request.ts` + notifications feed → `useFormatter().dateTime`; the A30 recipe's consumer half)~~ | 2026-07-12 | I18N.md → Formatting dates, numbers & currency |
| B2 | ~~A13 — cancel Stripe subscription on account deletion (`deleteUser.beforeDelete` capture → `cancel-stripe-subscriptions` job → `@repo/jobs` worker; immediate cancel, Stripe customer kept)~~ | 2026-07-13 | SERVICES.md → Stripe · AUTH.md → Danger zone |
| B4 | ~~A31 — `typedRoutes` evaluation~~ (**evaluated → NOT adopted**: the `[locale]` tree makes the checking vacuous-or-wrong; next-intl's flattened nav typing is out of its reach) | 2026-07-12 | DECISIONS.md |

## Decision-log anecdotes — archived from DECISIONS.md (2026-07-23)

One-time build anecdotes moved verbatim out of the living decision log during the
2026-07-23 doc restructure; each left a short locked-decision verdict in
[DECISIONS.md](../context/DECISIONS.md). Relative links inside the moved text are as
originally written (relative to `docs/context/`).

**The shadcn `form` overwrite-prompt workaround (Step 7):**

- **shadcn `form` add hit an overwrite prompt:** `form`'s registry deps include `button`+`label`
  (already present), and `--yes` does **not** auto-answer the resulting "overwrite?" prompt (it
  hangs). Workaround used: delete the two existing files, re-run the add (CLI writes all three
  cleanly), then `git checkout` to restore the committed `button`/`label`, keeping only the new
  `form.tsx`; then `biome check --write packages/ui`.

**The superseded `/profile` demo route (Step 7→C1, deleted at M3):**

- **Form demo lived at a public `/profile` route** (Step 7→C1), intentionally **not** under the
  `(dashboard)` proxy gate, so both Server Action branches were exercisable in a browser: success
  when signed in, and the typed `Unauthorized` when not. The mutation stays guarded server-side in
  `updateUserName`. **Superseded by M3:** now that the `(auth)` UI + `(dashboard)` shell exist, the
  real, gated `/account` page hosts this form and `/profile` was deleted. The signed-out
  `Unauthorized` branch is still covered by the `updateUserName` unit test, not a public route.

**The `react-email` pin story (Step 9; the pin fact itself stays in DECISIONS.md/STACK.md):**

- **`react-email` is exact-pinned `6.6.3`** (not `^`): the `latest` `6.6.4` was published hours
  before Step 9 and tripped pnpm's `minimumReleaseAge` supply-chain gate (it auto-added a
  `minimumReleaseAgeExclude`, which was reverted). It's a devDep CLI (never shipped), so the prior
  stable is used; bump once `6.6.4`+ ages out. The three _runtime_ email deps all passed the gate.

**The disproven Dialog diagnosis (from the 2FA entry — this is the CANONICAL archived copy):**

- **INLINE, not modal — a deliberate UX call (the original blocker is now fixed).** Both the
  `/account` enroll card and the sign-in challenge are inline reveals, consistent with the
  page's other cards. This was *originally* forced by a `Dialog` bug — tall content dropped off
  the top of the viewport, unreachable. The earlier note blamed the `tw-animate-css` enter
  animation "overriding the translate transform," but **reproduction (2026-07-09) proved that
  wrong**: Tailwind v4 centers `DialogContent` via the standalone `translate` CSS property,
  which the zoom animation's separate `transform` never touches — the real fault was simply
  that `DialogContent` had **no height cap**. Fixed by adding `max-h-[calc(100dvh-2rem)]
  overflow-y-auto` (see [UI.md](UI.md) → Dialog + the `TallContent` story in
  `dialog.stories.tsx`); tall modals now scroll inside and stay centered. The 2FA/org surfaces
  stay inline by **choice**, not necessity.

**The `typedRoutes` prototype record (Tier 4 · A31; the verdict stays in DECISIONS.md):**

- **`typedRoutes` evaluated and NOT adopted (Tier 4 · A31, 2026-07-12).** The stable top-level
  `typedRoutes: true` flag (Next 16.2.9; `experimental.typedRoutes` is deprecated) was prototyped
  end-to-end — `next typegen` → `.next/types/link.d.ts` → `tsc` → a full green build with the
  required casts — and rejected because the `[locale]` path architecture inverts its value:
  - **The generated route union can't represent this app's runtime URL space.** Every page lives
    under `app/[locale]/`, so the union is `` `/${slug}/login` ``-shaped dynamic patterns plus five
    static route handlers. Under `localePrefix: "as-needed"`, the **default-locale URLs the app
    actually navigates to have no locale segment** — so checking is simultaneously **vacuous** for
    single-segment paths (`redirect("/login")` type-checks by matching `/[locale]` with
    locale=`"login"`; the typo `/dashbord` passes the same way) and **wrong** for the rest
    (runtime-valid `/` and unprefixed multi-segment paths like `/admin/audit` are type errors).
    Verified by probe: the only genuinely caught class is a locale-*prefixed* multi-segment typo
    (`/es/dashbord`) — a URL shape this app never hand-writes.
  - **The app's real link surface is out of `typedRoutes`' reach.** ~All links/redirects flow
    through `@/i18n/navigation` ([I18N.md](I18N.md)), and next-intl's `createNavigation` types are
    **flattened into its published `.d.ts` at its own build time** — with no `pathnames` map,
    `href` is literally `string | UrlObject`, immune to the `next/link`/`next/navigation` module
    augmentation. Only the ten deliberate `next/navigation`/`next/link` exception call sites would
    be typed, and adoption's net diff there is **six `as Route` casts on runtime-correct code**
    (4× `router.push(redirectTo)`, 2× `href="/"`) — suppressing checks, not adding them. If typed
    hrefs are ever wanted here, the right tool is **next-intl's `pathnames` routing map** (checks
    the i18n layer itself), not `typedRoutes`.
  - **The flag is also a silent no-op under this repo's tsconfig.** TS include globs skip
    dot-directories, so the scaffold's explicit `.next/types/**/*.ts` include is what admits the
    generated types — and `apps/web/tsconfig.json`'s `exclude: [".next"]` filters it back out
    (exclude wins over include). Enabling for real would require dropping that exclude **and**
    adding a `next typegen` step before CI's `type-check` (the verify lane type-checks a clean
    checkout, before any build). Side finding, deliberately left as-is: the same exclude keeps
    Next's generated `validator.ts` (route-export conformance) out of `tsc`'s program; it passed
    cleanly when admitted during the prototype, but wiring it in would make `type-check` results
    depend on `.next` staleness — not worth the churn for a check the build already performs.
  - **No tooling fallout** (the one point in favor): with the flag on plus the casts, Turbopack,
    React Compiler, `cacheComponents`/PPR, the next-intl plugin, and the Sentry wrapper all built
    green, and next-intl internals + the vitest navigation stubs type-checked untouched. The
    rejection is architectural fit, not breakage — revisit only if the app ever drops locale path
    routing or adopts a `pathnames` map (which supersedes it anyway).
