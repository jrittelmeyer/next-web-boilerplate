# Chapter 8 — Connected Services: payments, email, uploads, search, background work, and monitoring

[← Look, Feel & Languages](07-look-feel-and-languages.md) · [Guide index](README.md) · [Next: Quality & Trust →](09-quality-and-trust.md)

---

Modern applications don't build everything themselves — they connect to
specialist services through their APIs ([Chapter 2](02-how-web-apps-work.md)):
one for payments, one for email delivery, and so on. Roughly a dozen such
integrations are wired into this project. Before touring them, understand the one
rule that governs them all, because it's a signature of the whole design.

## The golden rule: graceful degradation

**Every single integration is optional, and the app runs perfectly without it.**

A fresh copy of this project starts with exactly **two** settings (the database
address and one security key — both pre-filled with working local values). No
Stripe account, no email key, nothing else. Every feature whose service isn't
configured simply — and *politely* — switches off: email sending becomes "log it
and carry on" (sign-up still works, skipping verification); team invitations fall
back to a copyable invite link; search reports itself unconfigured instead of
erroring; analytics no-ops.

Why this is worth a pitch slide of its own:

- **Evaluation is instant.** Download → run → working app in minutes, no
  account-creation gauntlet across a dozen vendors. Compare kits that demand an
  afternoon of key-collecting before first launch.
- **It proves architectural discipline.** "Runs with everything unset" can't be
  faked with if-statements sprinkled at the end — it must be designed in at every
  boundary from the start, and it's *enforced by the automated tests*, which run
  the entire core suite with zero keys configured.
- **Removal is documented, not just addition.** Each integration ships a
  per-service "how to remove this" checklist. Optional truly means optional.

## Payments — Stripe

**What Stripe is:** the payments company of the modern software economy —
handling cards, banks, fraud, and the brutal regulatory compliance
(**PCI DSS** — the card-industry security standard) so that applications never
touch raw card numbers.

**What's built here, in customer-journey order:** a user clicks upgrade → is sent
to a **Stripe-hosted checkout page** (Stripe's servers take the card — the
lightest-possible compliance posture, a documented "why" in itself) → Stripe
notifies the app via **webhook** (an API call in reverse: the external service
calls *you* when something happens — "payment succeeded," "card declined") → the
app records the subscription in its own database → premium content unlocks (a
worked `/premium` example). Also wired: the **billing portal** (Stripe's hosted
"manage my card / cancel" page — self-service billing support you don't have to
build), **dunning** (the industry term for handling failed renewal payments —
the subscription flips to past-due status automatically), and account deletion
cancels the subscription ([Chapter 5](05-accounts-and-identity.md)).

**The verification story deserves its headline:** the entire flow was proven in
Stripe's test mode end-to-end — including replaying duplicate webhook deliveries
(they must be handled exactly once; Stripe explicitly warns about this),
error-path responses, and — the impressive one — **simulated time travel**:
Stripe's *test clocks* feature fast-forwarded a subscription months into the
future to prove the failed-renewal handling works, something impossible to test
by just waiting. Payment code is exactly where "wired but never run" hides the
expensive bugs; here it has dated proof.

**And teams can pay, not just individuals** — the final feature of the July 2026
"path to 100" effort. A subscription can belong to either one person or a whole
team ([Chapter 5](05-accounts-and-identity.md)'s organizations), and one team
subscription entitles every member. The ownership rule is enforced by the
database itself (exactly one owner, never both), deliberately designed so that a
member deleting their personal account can never accidentally cancel the team's
subscription — while deleting the whole team cancels its billing cleanly and
automatically. This flow, too, was proven end-to-end in Stripe's test mode.

## Email — Resend + React Email

**The two hard problems of application email:** building the messages (most
teams hand-edit archaic HTML that renders differently in every mail client) and
**deliverability** — actually reaching inboxes, because mail providers distrust
new senders by default.

**The solution here:** `React Email` — email templates written as typed React
components, same skills and safety net as the rest of the app, with every send
including a plain-text version (a spam-filter best practice most kits skip) —
delivered through `Resend`, a modern sending service. The deliverability plumbing
(**SPF, DKIM, DMARC** — three DNS-level standards that cryptographically prove
mail claiming to be from your domain really is; the difference between inbox and
spam folder) is documented as a recipe that was **executed against a real domain
and verified**, not just described. Verification, password reset, welcome,
email-change, and magic-link sign-in flows are all wired through it.

And a reputation guard most kits omit entirely: a **suppression list**. When a
mailbox reports "this address doesn't exist" (a **bounce**) or a recipient marks
a message as spam (a **complaint**), the sending service reports it back over a
cryptographically signed channel, and the app adds the address to a do-not-send
list that every future send checks first. Repeatedly emailing dead or unwilling
addresses is the fastest way to land *all* of your mail in spam folders; this
closes that loop automatically.

## File uploads — Uploadthing

Accepting user files (avatars, attachments) the naive way — onto your own server
— creates storage, scaling, and security problems immediately. The wired service
(`Uploadthing`) has browsers upload **directly to cloud storage**, bypassing the
app's servers, with the app authorizing each upload and recording it in an
`uploads` database table (so files are queryable data like everything else).
Deletion is engineered **fail-closed**: remove from storage first, then the
record — so a half-failed delete can never leave an orphaned file lingering in
storage while the app believes it gone. Avatar upload is the worked example.

This integration also now carries a dated live proof like the payments one. The
completion hand-off — where the upload service calls the application back to
confirm "the file arrived," a step that only works when the app is reachable
from the public internet — was exercised for real in July 2026 through a
temporary secure tunnel, upload through deletion. It was the last integration
without such a proof on file; now every one has one.

## Search — Meilisearch

Database queries are wrong for *search-box* search — users expect typo
tolerance ("recipies" finds recipes), ranked relevance, and instant
as-you-type results. `Meilisearch` is an open-source search engine providing
exactly that. **Why it over the famous names:** Algolia (the category leader) is
excellent but rented, with usage pricing — lock-in again; Elasticsearch is
enterprise-grade but an operational beast needing dedicated expertise.
Meilisearch is the self-hosted sweet spot: Algolia-class experience, one small
service you own. The integration keeps the search index synchronized on every
write, stores index configuration *as code* in the repository (so it's
versioned and reproducible, like the database migrations), and rate-limits the
expensive rebuild-everything operation.

## Background jobs — pg-boss

**The problem:** some work shouldn't happen while a user waits — sending a
welcome email, calling Stripe to cancel a subscription. If sign-up only succeeds
when the email provider is up, you've chained your product to someone else's
uptime. The answer is a **job queue**: the app drops a task note into a queue and
responds to the user instantly; a separate **worker** process picks tasks up,
runs them, and — crucially — **retries them automatically if they fail**. And a
task that keeps failing past its retries isn't discarded or retried forever: it
lands in a **dead-letter queue** — a watched "needs attention" pile that
preserves the task's original contents and raises an alert, so a human can
inspect the cause instead of never learning it happened.

**The signature decision** ([Chapter 4](04-the-database.md) foreshadowed it): the
queue is `pg-boss`, which stores the queue **inside PostgreSQL** — versus the
industry-typical answer of standing up a Redis server plus BullMQ, or renting a
queue service. Zero new infrastructure; and if the worker is down, jobs simply
accumulate safely in the database and drain when it returns. The worked examples
are the welcome email and the Stripe-cancellation job; and the worker ships as
its own slim deployable image — an engineering pass took it from 1.57 GB naive to
**169 MB**, which matters for hosting cost and start-up speed.

## Monitoring — knowing before the customers do

Three services, three questions, all env-optional like everything else:

- **`Sentry` — "what's breaking?"** Error tracking: every crash, server or
  browser, is captured with its full context — exact code line, user's browser,
  steps leading in — grouped and alerting. Without it, you know about bugs when
  users bother to complain (most just leave). Includes the setup that makes
  production crash reports point at readable code (source-map upload in CI, for
  the record — a fiddly, commonly-botched step).
- **`BetterStack` — "is it up, and what happened?"** Centralized logging (every
  copy of the app streams its diary to one searchable place — with a plain
  console fallback when unconfigured) plus uptime monitoring that pings the
  app's **health endpoint** (`/api/health`, a built-in "all systems OK" URL that
  monitoring tools and hosting platforms check) and a **heartbeat** for the
  background worker — the component whose silent death nobody notices until
  emails stop. The distinctive touch: monitor configuration is **dashboards as
  code** — typed configuration in the repository, synced by script — versus the
  industry norm of hand-clicked dashboards that are undocumented, unreviewable,
  and silently divergent.
- **`PostHog` — "how is it used?"** Product analytics (which features, where do
  users drop off) plus **feature flags** — switching features on/off for chosen
  users *without deploying* — enabling gradual rollouts and instant kill
  switches. **Chosen over Google Analytics** deliberately: GA is built for
  marketing-site traffic and is a privacy-regulation minefield (European rulings
  have repeatedly found it non-compliant); PostHog is built for product
  analytics and can self-host if data control demands it.

And an escape hatch from monitoring lock-in itself: with one optional setting,
the app also exports its performance traces in **OpenTelemetry** format — the
software industry's vendor-neutral monitoring language — so they can flow to
any compatible monitoring product, or to a collector you host yourself,
*alongside* (not instead of) the services above. Leave the setting unset and
the feature does exactly nothing, per the golden rule.

**The privacy posture stitching it together:** analytics is **consent-gated,
off by default** — a real consent banner, no tracking until opt-in — aligned
with GDPR and the modern norm, and paired with the user data export from
[Chapter 5](05-accounts-and-identity.md).

**Business value of the chapter:** each service is the current best-of-breed
answer to a problem every product hits, pre-integrated with its edge cases
handled and its evidence dated; the graceful-degradation rule means none of
them is a tax on day one; and the recurring lock-in-avoidance means each remains
swappable, with the removal instructions already written.

---

[← Look, Feel & Languages](07-look-feel-and-languages.md) · [Guide index](README.md) · [Next: Quality & Trust →](09-quality-and-trust.md)
