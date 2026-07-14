#!/usr/bin/env node
/**
 * prune-turbo-cache — bound the local Turbo cache, which has no native TTL or
 * size cap of its own.
 *
 * Turbo stores every task-hash's output under .turbo/cache forever and never
 * evicts. Each `web:build` writes a ~3.5 GB .next artifact (Sentry source-maps +
 * chunks; .next/cache is already excluded in turbo.json), so intensive
 * step-by-step rebuilding grows the cache without limit — it reached 100 GB here
 * in three days. `pnpm clean` does NOT help: it runs each package's `clean` task,
 * never the root cache dir.
 *
 * This deletes the OLDEST entries (by mtime) until the total is under a size
 * ceiling, keeping the most recent ones so cache-hits still work.
 *
 *   node scripts/prune-turbo-cache.mjs [--max-gb <n>] [--report] [--dry-run]
 *
 *   --max-gb <n>   Size ceiling in GB (default 20; env TURBO_CACHE_MAX_GB overrides).
 *                  20 GB keeps ~5 recent build artifacts + all small task caches.
 *   --report       Print cache size + entry count and exit (no deletion).
 *   --dry-run      List what WOULD be removed without deleting.
 *   -h, --help     Show this help.
 *
 * Cross-platform (pure Node, no shell builtins) and safe: it only ever unlinks
 * regular files inside <repoRoot>/.turbo/cache. Wired into the /checkpoint cadence
 * and a husky pre-push backstop; see the `tidy` skill + docs/context/DEPLOYMENT.md.
 */
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cacheDir = join(root, ".turbo", "cache");
const GB = 1024 ** 3;
const DEFAULT_MAX_GB = 20;

function parseArgs(argv) {
  const args = { maxGb: undefined, report: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "--report") args.report = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--max-gb") args.maxGb = Number(argv[++i]);
    else if (a.startsWith("--max-gb=")) args.maxGb = Number(a.slice("--max-gb=".length));
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/prune-turbo-cache.mjs [--max-gb <n>] [--report] [--dry-run]

  --max-gb <n>   Size ceiling in GB (default ${DEFAULT_MAX_GB}; env TURBO_CACHE_MAX_GB overrides).
  --report       Print cache size + entry count and exit (no deletion).
  --dry-run      List what WOULD be removed without deleting.
  -h, --help     Show this help.

Deletes the oldest .turbo/cache entries until the total is under the ceiling.`);
}

function fmt(bytes) {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

/** Regular files in the cache dir with size + mtime; null if the dir is absent. */
function listEntries() {
  let names;
  try {
    names = readdirSync(cacheDir);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
  const entries = [];
  for (const name of names) {
    const full = join(cacheDir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    entries.push({ full, name, size: st.size, mtime: st.mtimeMs });
  }
  return entries;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  // biome-ignore lint/suspicious/noUndeclaredEnvVars: read only by this standalone maintenance script (run via pnpm/husky, not a turbo task), so it affects no cached task output — declaring it in turbo.json would be misleading.
  const envMax = Number(process.env.TURBO_CACHE_MAX_GB);
  let maxGb = DEFAULT_MAX_GB;
  if (Number.isFinite(args.maxGb)) maxGb = args.maxGb;
  else if (Number.isFinite(envMax) && envMax > 0) maxGb = envMax;
  const maxBytes = maxGb * GB;

  const entries = listEntries();
  if (entries === null) {
    console.log("• No .turbo/cache directory — nothing to prune.");
    return;
  }

  const total = entries.reduce((n, e) => n + e.size, 0);
  console.log(`Turbo cache: ${fmt(total)} across ${entries.length} entries (cap ${maxGb} GB).`);

  if (args.report) return;
  if (total <= maxBytes) {
    console.log("• Under cap — nothing to prune.");
    return;
  }

  // Oldest-first until under cap.
  entries.sort((a, b) => a.mtime - b.mtime);
  let freed = 0;
  let removed = 0;
  for (const e of entries) {
    if (total - freed <= maxBytes) break;
    if (args.dryRun) {
      console.log(`  would remove ${e.name} (${fmt(e.size)})`);
    } else {
      try {
        unlinkSync(e.full);
      } catch (err) {
        console.log(`  ! could not remove ${e.name}: ${err.message}`);
        continue;
      }
    }
    freed += e.size;
    removed++;
  }

  const plural = removed === 1 ? "entry" : "entries";
  if (args.dryRun) {
    console.log(
      `• Would remove ${removed} ${plural}, reclaiming ${fmt(freed)} (cache → ~${fmt(total - freed)}).`,
    );
  } else {
    console.log(
      `• Removed ${removed} ${plural}, reclaimed ${fmt(freed)} (cache now ~${fmt(total - freed)}).`,
    );
  }
}

main();
