# Auth

> When to load: auth flows, session handling, protected routes, RBAC, orgs, middleware — start at [auth/core.md](auth/core.md).

This file is a thin index — the content was split into [auth/](auth/) on 2026-07-23 so each
auth subtopic loads only what it needs. The original section headings below keep inbound
anchors resolving.

| Topic | File | Scope |
| --- | --- | --- |
| Core | [auth/core.md](auth/core.md) | setup/config, schema ownership, sessions + cookie cache, proxy/route protection, auth UI, hardening + rate limits, plugin tuple order, two role layers, env vars |
| Account page | [auth/account-page.md](auth/account-page.md) | the `/account` cards: profile + email change, password, sessions, deletion, data export |
| Factors | [auth/factors.md](auth/factors.md) | 2FA/TOTP, passkeys/WebAuthn, CAPTCHA (Turnstile), magic link + email-OTP recipe |
| RBAC & admin | [auth/rbac-admin.md](auth/rbac-admin.md) | platform roles, `/admin`, ban + impersonation (staleness crux), `audit_log` |
| Organizations | [auth/organizations.md](auth/organizations.md) | multi-tenancy, invitations, org UI, per-org billing pointers |

## Setup

→ moved to [auth/core.md](auth/core.md) (2026-07-23 split)

## Package Structure

→ moved to [auth/core.md](auth/core.md) (2026-07-23 split)

## Auth Instance

→ moved to [auth/core.md](auth/core.md) (2026-07-23 split)

## Session Access

→ moved to [auth/core.md](auth/core.md) (2026-07-23 split)

## Protected Routes (Proxy)

→ moved to [auth/core.md](auth/core.md) (2026-07-23 split)

## Auth UI (C1)

→ moved to [auth/core.md](auth/core.md) (2026-07-23 split)

## Account page (M3)

→ moved to [auth/account-page.md](auth/account-page.md) (2026-07-23 split)

## Available Auth Plugins

→ moved to [auth/core.md](auth/core.md) (2026-07-23 split); the magic-link + email-OTP subsections → [auth/factors.md](auth/factors.md)

## Auth hardening (Step 19)

→ moved to [auth/core.md](auth/core.md) (2026-07-23 split)

## Bot protection — CAPTCHA (Cloudflare Turnstile) (Tier 4 · Band 2)

→ moved to [auth/factors.md](auth/factors.md) (2026-07-23 split)

## Two-factor authentication (2FA / TOTP) (Tier 4 · Band 2)

→ moved to [auth/factors.md](auth/factors.md) (2026-07-23 split)

## Passkeys / WebAuthn (Tier 4 · Band 3)

→ moved to [auth/factors.md](auth/factors.md) (2026-07-23 split)

## RBAC (Step 21)

→ moved to [auth/rbac-admin.md](auth/rbac-admin.md) (2026-07-23 split)

## Admin plugin — ban & impersonation (Tier 4 · Band 4)

→ moved to [auth/rbac-admin.md](auth/rbac-admin.md) (2026-07-23 split)

## Organizations / multi-tenancy

→ moved to [auth/organizations.md](auth/organizations.md) (2026-07-23 split); the two-role-layers table → [auth/core.md](auth/core.md)

## Environment Variables

→ moved to [auth/core.md](auth/core.md) (2026-07-23 split)
