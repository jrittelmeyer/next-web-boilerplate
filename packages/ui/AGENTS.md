# packages/ui — leaf rules

One imperative per line; mechanics + rationale live in
[docs/context/UI.md](../../docs/context/UI.md).

- shadcn adds run from the app (`--cwd apps/web`, monorepo mode writes here) and
  **every add needs two manual follow-ups**: move the installed deps into
  `packages/ui/package.json`, then `biome check --write packages/ui`.
- Every new primitive gets a co-located `*.stories.tsx`; story-only classes are
  excluded from prod CSS via `@source not`.
- Visual baselines are **platform-specific**: an intended change rebases BOTH the
  win32 and linux sets; never `pnpm install` over the Docker-mounted repo.
- **Zero `next/*` imports** in this package (react-vite Storybook loads it).
- Component deps live in THIS package.json (exception: `lucide-react`,
  dual-pinned with `apps/web`).
- Rebrand = edit tokens in `tooling/tailwind/base.css`, never per-component
  classes.
