# syntax=docker/dockerfile:1
#
# Production image for apps/web. Multi-stage: deps -> builder -> runner.
# Build from the repo root (the Dockerfile lives in docker/):
#   docker build -f docker/Dockerfile -t nwb-web .
# Run (runtime env comes from the host, not a baked .env):
#   docker run -p 3000:3000 --env-file .env nwb-web
#
# The build never needs real secrets: env.ts honors SKIP_ENV_VALIDATION (set
# below), so `next build` runs without DATABASE_URL/BETTER_AUTH_SECRET. Those are
# required at *runtime* and must be provided when the container starts.

ARG NODE_VERSION=24-alpine

# ---- base: shared toolchain (corepack-pinned pnpm) ----
FROM node:${NODE_VERSION} AS base
# libc6-compat provides a glibc shim some Node native addons expect on musl/alpine.
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# corepack activates the pnpm version pinned in package.json#packageManager.
RUN corepack enable
WORKDIR /app

# ---- deps: install all workspace deps from the lockfile ----
FROM base AS deps
# Copy only what `pnpm fetch` needs first (lockfile-driven) for a cacheable layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
# Bring in the full source, then link from the fetched store with no network.
COPY . .
RUN pnpm install --frozen-lockfile --offline

# ---- builder: produce the standalone Next.js bundle ----
FROM base AS builder
COPY --from=deps /app ./
# Build without real secrets (validated at runtime instead). Sentry source-map
# upload stays off — no SENTRY_AUTH_TOKEN — so @sentry/cli is never invoked.
# BUILD_STANDALONE opts the app into Next's standalone output (see next.config.ts);
# it's only emitted here, for the image.
ENV SKIP_ENV_VALIDATION=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV BUILD_STANDALONE=1
# CSP_MODE is a BUILD-time knob (static default | nonce) — it's baked into the
# bundles, so it must be chosen when the image is built, not when it runs:
#   docker build -f docker/Dockerfile --build-arg CSP_MODE=nonce -t nwb-web .
# See docs/context/SECURITY.md → CSP strategy.
ARG CSP_MODE
ENV CSP_MODE=$CSP_MODE
RUN pnpm build

# ---- jobs-build: bundle the worker into one self-contained JS file ----
# esbuild compiles @repo/jobs' worker.ts + everything it imports — the workspace
# TS packages (@repo/db, @repo/email + its JSX templates) and their JS deps — down
# to a single dist/worker.js, so the runtime stage below needs neither a TS
# transpiler (tsx) nor a node_modules tree. See packages/jobs/build.mjs.
FROM deps AS jobs-build
WORKDIR /app
RUN pnpm --filter @repo/jobs build

# ---- worker: the pg-boss background-jobs worker (D7) ----
# A SEPARATE long-lived process from the web server — the consumer half of the
# jobs story (the web app enqueues; this drains the queues). Unlike the old
# `FROM deps` worker — which shipped the ENTIRE dev install + source (~1.5 GB) just
# to run the TS via tsx — this is a minimal image: the base Node runtime plus the
# single bundled worker.js from jobs-build (no source, no node_modules, no
# transpiler). DATABASE_URL is provided at runtime (compose env / --env-file), like
# the web app. Optional: if you never run this service, enqueued jobs simply wait
# in the `pgboss` schema until a worker starts — the app is unaffected.
FROM node:${NODE_VERSION} AS worker
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# The worker runs `node worker.js` and never invokes npm — strip the base image's
# bundled npm (and its own vendored undici, which scanners flag independently) to
# shrink the image + its attack surface, exactly as the runner stage does below.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
# The bundle is self-contained; owned by the unprivileged node user it runs as.
COPY --from=jobs-build --chown=node:node /app/packages/jobs/dist/worker.js ./worker.js
# Drop privileges — the worker needs no write access to the file it runs.
USER node
CMD ["node", "worker.js"]

# ---- runner: minimal production image ----
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next's standalone server reads PORT/HOSTNAME; bind all interfaces for Docker.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Run as an unprivileged user.
RUN addgroup -S -g 1001 nodejs \
  && adduser -S -u 1001 -G nodejs nextjs

# The runtime runs `node apps/web/server.js` and never invokes npm/npx — remove the
# base image's bundled npm CLI to shrink the image and its attack surface. It also
# drops npm's own vendored copy of undici, which image scanners (Trivy in CI) flag
# independently of the app's dependency tree. corepack/pnpm are used only in the
# build stages (deps/builder), never in this final runner.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# The standalone output is self-contained (traced node_modules + server.js); in
# this monorepo it nests under apps/web/. Static assets and public/ are NOT part
# of standalone and must be copied alongside the server.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

# Container readiness probe → the /api/health route (liveness + DB-ping readiness;
# 200 healthy, 503 when the DB is unreachable). Uses node, which is always present:
# this alpine image ships no curl, and busybox `wget --spider` sends a HEAD request
# that the GET-only route would 405. start-period covers Next's cold boot.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
