# Registry query recipes, per ecosystem

## Contents
- JavaScript / TypeScript (npm registry)
- Python (PyPI)
- Rust (crates.io)
- Go (module proxy)
- .NET (NuGet)
- JVM (Maven Central)
- Ruby (RubyGems) · PHP (Composer/Packagist)
- Game-engine asset stores

Substitute the project's package manager; `{pkg}` is the package name. Each
recipe answers: current stable version · tag/channel landscape · publish date.

## JavaScript / TypeScript (npm registry)

- Version + tags: `npm view {pkg} version` · `npm view {pkg} dist-tags`
  (pnpm mirrors `npm view`; Yarn: `yarn npm info {pkg}`; bun uses npm's
  registry — `npm view` works regardless of installer).
- Publish dates: `npm view {pkg} time --json` (per-version timestamps).
- Deprecation: `npm view {pkg} deprecated`.

## Python (PyPI)

- Versions: `pip index versions {pkg}` (pip ≥ 21.2) or
  `uv pip install {pkg}== 2>&1` (the error lists available versions).
- Full metadata incl. upload dates: `https://pypi.org/pypi/{pkg}/json`
  (`releases[version][0].upload_time`); yanked releases carry `"yanked": true`.
- Pre-releases never install by default — a `rc`/`b` tag in "latest" output is
  a warning sign, not a candidate.

## Rust (crates.io)

- Current version: `cargo search {pkg} --limit 1`.
- Full version list + dates + yanks: `https://crates.io/api/v1/crates/{pkg}`
  (`versions[].num`, `.created_at`, `.yanked`).
- Add pinned: `cargo add {pkg}@={version}` (exact) or `@{version}` (caret).

## Go (module proxy)

- Version list: `go list -m -versions {module}`.
- Latest + timestamp: `go list -m -json {module}@latest` (`Time` field).
- Retractions surface in `go list -m -retracted -json {module}@latest`.

## .NET (NuGet)

- Versions: `dotnet package search {pkg} --exact-match --format json`
  (SDK ≥ 8.0.2xx; older: browse `https://api.nuget.org/v3-flatcontainer/{pkg}/index.json`).
- Publish dates + unlisted flag: the NuGet registration API or the package page.

## JVM (Maven Central)

- Versions + dates: `https://search.maven.org/solrsearch/select?q=g:{group}+AND+a:{artifact}&core=gav&rows=20&wt=json`
  (`timestamp` per version).
- Gradle/Maven resolve ranges at build time — pin explicit versions in the
  build file; version-catalog projects pin in `libs.versions.toml`.

## Ruby (RubyGems) · PHP (Composer/Packagist)

- RubyGems: `gem info {pkg} --remote` · dates via
  `https://rubygems.org/api/v1/versions/{pkg}.json` (`created_at`, `yanked`).
- Composer: `composer show {pkg} --all --latest` · dates on
  `https://repo.packagist.org/p2/{pkg}.json`.

## Game-engine asset stores

Engine add-ons rarely carry machine-checkable publish metadata — the checks
shift, the policy (age window, maintenance, record-the-decision) does not:

- **Unity (UPM):** registry packages resolve like npm
  (`https://packages.unity.com` — `npm view {pkg} --registry` works); Asset
  Store assets: check the store page's last-update date + editor-version
  compatibility, and vendor the version into the repo.
- **Godot (Asset Library):** the asset page carries last-update + supported
  Godot version; prefer assets with a git repo you can pin by tag/commit.
- **Unreal (Fab/Marketplace):** check supported-engine-versions and last
  update on the listing; vendor into the repo and record the source version.
