# intake/ — existing-app drop zone

This directory feeds **`/project-adopt`**, the preinstalled
[ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit) skill that adopts an
existing app onto this template.

- **`intake/source/`** (gitignored) — drop the existing codebase here, or skip
  the copy entirely and hand `/project-adopt` a path or git URL. Either way the
  source is a **read-only reference**: it is never committed to this repo and
  never edited. The skill surveys it into a parity contract and a
  theirs-vs-template migration map, then keeps it alongside so the port can be
  verified against the original side-by-side. What gets committed are the
  outputs — `docs/PRODUCT.md`, `docs/MIGRATION.md`, and the regenerated
  status/backlog.

Starting from an idea instead of code? That's `/project-init` — see
[docs/GETTING_STARTED.md](../docs/GETTING_STARTED.md). (Its committed
planning-docs drop convention, `docs/intake/`, is a separate planned row in
[docs/BACKLOG.md](../docs/BACKLOG.md).)
