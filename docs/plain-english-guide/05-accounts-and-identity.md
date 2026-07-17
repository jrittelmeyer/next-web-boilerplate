# Chapter 5 — Accounts & Identity: sign-in, security, teams, and control

[← The Database](04-the-database.md) · [Guide index](README.md) · [Next: Screens Talking to Servers →](06-screens-and-servers.md)

---

**Authentication** ("who are you?") and **authorization** ("what are you allowed
to do?") are, together, the most security-critical and most tedious-to-build part
of any application — and the area where this project is most feature-complete.
Nearly everything in this chapter would be weeks-to-months of specialist work,
and every item has been verified live.

## Better Auth — the identity system, and why it's self-hosted

**Technical name:** `Better Auth`, an open-source authentication framework, run
**self-hosted**: all account data lives in the project's own PostgreSQL database.

**The decision, plainly.** There are two philosophies for handling accounts:

1. **Rent it** (Clerk, Auth0, and similar services): fastest start, but your user
   database — arguably the crown jewels — lives inside another company's product,
   you pay **per monthly active user** forever (pricing that scales *against*
   you: success makes it expensive), and leaving means a painful migration of
   every account. Vendor lock-in at its most intimate.
2. **Own it** (this project's choice): user data stays in your database, costs
   nothing per user, and no third party sits between you and your customers.
   Historically the argument against owning it was "you'll build the security
   features badly yourself" — and this is where Better Auth changed the
   calculus: it's a maintained open-source framework with a plugin architecture
   that provides the hard security features pre-built, *inside your own
   infrastructure*.

The decision log also honestly notes the other open-source option (Auth.js /
NextAuth) remains legitimate — and records that an internet claim used to justify
one option was investigated, found to be unverified marketing noise, and
retracted. Small moment; telling standard of evidence.

## The sign-in features, item by item

**Email & password, done to a professional standard.** Sign-up with **email
verification** (prove you own the address), password reset, and — a subtle,
high-value touch — a **compromised-password check**: new passwords are checked
against the *Have I Been Pwned* database of billions of passwords leaked in
real-world breaches, so "password123" or anything hackers already possess is
rejected at the door. (Done with a clever privacy technique — the password itself
never leaves the app.)

**Social sign-in** (**OAuth** — the standard behind every "Sign in with Google /
GitHub" button, where the app never sees your Google password; it receives only a
signed "this person is who they claim" note). Wired for both Google and GitHub,
verified against live accounts, and — a recurring pattern in this project —
**switched on only when keys are configured**: without them the app runs happily
on email/password alone.

**Magic links.** An option to skip the password entirely: type your email address
and the app sends a one-time sign-in link — click it and you're signed in. The
links are single-use (a copied or intercepted link can't be replayed), requests
are rate-limited, and — the same recurring pattern — the option only appears when
the app has an email service configured, so the button can never exist in a state
where it wouldn't work.

**Two-factor authentication (2FA).** A second proof beyond the password — the
six-digit codes from an authenticator app (**TOTP**, "time-based one-time
password"), plus printable **backup codes** for a lost phone, plus an optional
"trust this device for 30 days." Design details show the care level: enrollment
only activates after the user proves their authenticator works (abandoning setup
halfway can't lock anyone out), and turning 2FA off requires the password again —
so a stolen, still-logged-in laptop can't quietly strip the protection.

**Passkeys** (**WebAuthn** — the industry standard behind Face ID / fingerprint /
security-key login, pushed by Apple, Google, and Microsoft as the eventual
replacement for passwords entirely). Users sign in with a biometric prompt;
there's no password to phish, and the credential physically cannot be replayed on
a fake site. This is the current frontier of consumer login security, and it's
already wired, tested (including in the automated test suite, using a simulated
authenticator), and — notably — required zero new configuration or security
loosening to add.

**Bot protection** (**CAPTCHA**, opt-in): the "prove you're human" gate on
sign-up and password-reset, using Cloudflare **Turnstile** — chosen over Google's
reCAPTCHA for privacy (no Google tracking) and, characteristically, because
Cloudflare publishes official test keys that let the whole flow be *verified
automatically* without a real account.

**Rate limiting** on sign-in attempts — the throttle that turns
a password-guessing robot's million tries into a few per minute — with the
tracking stored **in the database**, so the limits still work when the app runs
as multiple copies behind a load balancer (the naive in-memory version silently
breaks in exactly that scenario; the decision log explains this).

## Teams and permissions

**Organizations / multi-tenancy.** The app supports **organizations** — teams
with members, roles (owner / admin / member), and email invitations — so it's
ready out of the box for the standard business model of "companies sign up, not
just individuals" (**B2B SaaS** — "business-to-business software-as-a-service").
The worked `posts` example ([Chapter 4](04-the-database.md)) demonstrates
team-scoped data. Design touch: for users in no organization, everything behaves
exactly as a personal account — the feature adds no complexity until used. And if
email isn't configured, invitations still work: the inviter gets a shareable
accept-link to pass along. Graceful degradation, again. Since July 2026 a team
can also hold the paid subscription itself — one payment entitles every member —
with the ownership rules engineered so no individual's account deletion can
touch the team's billing ([Chapter 8](08-connected-services.md) has the story).

**RBAC** ("role-based access control") — the authorization layer: users hold
roles; roles grant abilities; sensitive operations check the role. The
implementation detail worth understanding, because it's a genuine security
differentiator: for speed, most systems check a *cached* copy of your permissions
that can be several minutes stale — meaning a just-fired administrator can keep
their powers for a dangerous window. **This project re-reads roles fresh from the
database at every sensitive boundary, so a demotion takes effect immediately.**
Where one narrow feature couldn't avoid the cached path, the residual few-minute
window is *documented as a known limitation* rather than glossed over — the
project's honesty pattern applied to security.

**The admin surface.** A built-in `/admin` area with user management, including
**ban** (with automatic expiry) and **impersonation** — support staff temporarily
seeing the app as a specific user sees it, the single most effective customer-
support debugging tool. Impersonation is tightly gated, fully logged, and admins
cannot impersonate other admins.

**The audit log.** Every sensitive administrative action — role changes, bans,
impersonations — is permanently recorded (who did what, to whom, when) in an
`audit_log` table with a browsable admin viewer. For any business facing
compliance requirements (SOC 2, ISO 27001, or enterprise customers' security
questionnaires), "is there an audit trail?" is an early and mandatory question,
and the answer here is already yes.

## The account page — the features users actually touch

Each signed-in user gets a self-service account area: profile and avatar upload;
**active-sessions list with remote sign-out** ("that's not my laptop — revoke
it"); **email change done safely** (confirmations to *both* the old and new
address, so a hijacked session can't quietly redirect the account, plus all other
sessions signed out on completion); and **account deletion** that also cancels
the user's paid subscription automatically via a background job
([Chapter 8](08-connected-services.md)) — closing the classic infuriating
loophole of "deleted the account, kept getting billed."

Also present, because modern privacy law (**GDPR** — Europe's data-protection
regulation, with equivalents spreading worldwide) demands it: a **data export**
(users download everything the system knows about them, carefully filtered so
internal security fields aren't leaked) and a consent-first analytics posture
covered in [Chapter 8](08-connected-services.md).

## Why this chapter is worth real money

A defensible summary for a skeptical audience: identity is where security
breaches, compliance failures, and support nightmares all concentrate. This
project ships the *entire* modern identity stack — verified passwords, breach
checking, social login, 2FA, passkeys, bot protection, teams, immediate-effect
permissions, admin tooling, audit trail, and privacy compliance — pre-built,
integrated, live-verified, and owned outright with no per-user rent. Priced as
specialist labor, this chapter alone plausibly exceeds the value of many entire
starter kits.

---

[← The Database](04-the-database.md) · [Guide index](README.md) · [Next: Screens Talking to Servers →](06-screens-and-servers.md)
