# Chapter 7 — Look, Feel & Languages: the design system, accessibility, and speaking the user's language

[← Screens Talking to Servers](06-screens-and-servers.md) · [Guide index](README.md) · [Next: Connected Services →](08-connected-services.md)

---

## Tailwind — how styling stays consistent

**Technical name:** `Tailwind CSS v4`. **CSS** ("cascading style sheets") is the
web's styling language — colors, spacing, fonts, layout.

**The problem:** on multi-person projects, traditional styling rots. Every
engineer adds their own style rules; rules interact at a distance; nobody dares
delete anything ("what might it break?"); and the product slowly drifts into
seventeen slightly different shades of blue and eleven button sizes.

**Tailwind's fix, plainly:** instead of everyone authoring free-form rules,
engineers compose styles from a **fixed vocabulary of small, pre-defined
utilities** drawn from a design system — approved spacing steps, an approved
color palette, approved text sizes. Like building with standard-sized bricks
versus hand-pouring concrete: consistency stops depending on discipline and
becomes the path of least resistance. The design tokens (the brand's palette and
scale) live in one shared package, so changing the brand color is a one-line,
whole-product change.

**Why Tailwind over alternatives** (plain CSS, styled-components, CSS Modules):
it has decisively won this generation of the styling argument — it's the current
industry default, enormously documented, and (a theme by now) the style AI
assistants are most fluent in, because they've seen more of it than anything
else. Version 4 is the current, fastest generation.

## shadcn/ui — the component library you own

**Technical name:** `shadcn/ui`, built on `Radix UI` **primitives**.

**What it is:** the pre-built catalog of interface pieces — buttons, dialogs,
menus, forms, tables — styled with Tailwind, kept in the shared `ui` package.
Under the hood it uses Radix, a library devoted purely to the *behavioral*
correctness of components: keyboard navigation, focus handling, screen-reader
labeling — the accessibility engineering that is genuinely hard to get right and
almost always gets skipped when teams hand-roll components.

**The unusual model, and why it was chosen:** traditional component libraries
(e.g., Material UI) are dependencies — you get Google's look, and customizing
deeply means fighting the library forever. shadcn/ui instead **copies the source
code of each component into your repository**. You own every line; customization
is just editing; there's no upstream that can change or abandon things under you.
For a starter kit meant to become *someone's own product*, owning the design
layer outright is exactly right — it's the anti-lock-in philosophy
([Chapter 1](01-the-big-picture.md)) applied to the visual layer.

**Also wired and working:** **dark mode** (the whole product in light and dark,
honoring the user's system preference, with the classic ugly "flash of the wrong
theme on load" specifically engineered away) — table stakes for modern software,
fiddly to retrofit, already done.

## Storybook and visual regression — quality control for appearance

**`Storybook`** is a component showroom: a separate mini-site displaying every
component in every state (button: normal, hovered, disabled, loading…) in
isolation. Designers review real components without clicking through the app;
engineers develop pieces in isolation; and the showroom doubles as living
documentation of the design system.

**Visual regression testing** builds on it: the automated test suite
photographs every component in both themes and, on every future change,
**compares screenshots pixel by pixel** against approved baselines. A styling
change that accidentally nudges something unrelated — the classic "we fixed the
menu and broke the checkout button" — is caught by machines before any human
review. Functional tests can't see aesthetics; this closes that gap.

## Accessibility — usable by everyone, verified by machine

**Technical term: a11y** (the numeronym for "accessibility" — 11 letters between
a and y): making software usable by people with disabilities — screen-reader
users, keyboard-only users, low-vision users.

Beyond being the right thing, the business case is concrete: accessibility is a
*legal requirement* in growing swaths of the market (the ADA in the US, the
European Accessibility Act as of 2025), a hard requirement in government and
enterprise purchasing, and lawsuits over inaccessible websites are now routine.

This project doesn't just claim accessibility — it **enforces it in the automated
test suite**: `axe` (the industry-standard accessibility checker) scans seven
representative surfaces of the app — four public pages and three signed-in ones —
on every change, and violations fail the build. The choice of Radix-based
components means keyboard and screen-reader behavior is engineered-in at the
component level, and the visual tests run in both themes, so contrast issues in
dark mode get caught too.

## Internationalization — ready for more than English

**Technical name:** `next-intl`, implementing **i18n** (numeronym for
"internationalization") with **locale-in-the-URL routing**; English and Spanish
ship as working examples.

**What's actually built:** all user-facing text on **every screen** — from the
landing page and sign-in through the account, admin, and team areas — lives in
per-language **message catalogs**
rather than hard-coded strings; dates, numbers, and currency format themselves
per locale (07/15/2026 vs 15/07/2026 — small details that make software feel
foreign when wrong); a language switcher is wired; and each language gets its own
web addresses (`/es/login` for Spanish), which search engines index separately —
international **SEO** for free.

**Why this is a day-one decision that most kits skip:** retrofitting i18n onto an
existing product means touching *every screen* — one of the most notorious
retrofits in software. Doing it in the foundation costs almost nothing and turns
"expand to the Latin-American market" from a re-engineering project into a
translation purchase. Two details show the engineering judgment: the language
lives in the URL (not a hidden setting) *specifically because* that's the only
approach that preserves the instant-page-speed machinery from
[Chapter 3](03-the-foundation.md) — the alternatives silently disable it; and
coverage is **complete and kept honest by machine**: the English and Spanish
catalogs hold identical sets of entries (485 each, compared key-by-key), so a
screen can't quietly ship in one language only.

**Business value of the chapter:** the product looks consistent and professional
by default, is legally defensible on accessibility with machine-checked proof,
cannot silently regress visually, and is structurally ready for international
markets — four things that are each miserable and expensive to bolt on later.

---

[← Screens Talking to Servers](06-screens-and-servers.md) · [Guide index](README.md) · [Next: Connected Services →](08-connected-services.md)
