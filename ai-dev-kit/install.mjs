#!/usr/bin/env node
/**
 * ai-dev-kit installer — copies kit skills into a project's `.claude/skills/`
 * (and dual-home skills into `~/.claude/skills/` with --global).
 *
 * Usage:
 *   node ai-dev-kit/install.mjs [--dest <root>] [--adapter <file>] [--global] [--hooks]
 *   node ai-dev-kit/install.mjs --check [--dest <root>] [--global]
 *
 * Pure Node fs — no shell, no symlinks (Windows-safe). Idempotent: a re-run with an
 * unchanged kit writes nothing. `--check` exits 1 listing any installed file that
 * drifted from kit source (the adapter config and settings.json are user-owned and
 * never checked). Skills in `.claude/skills/` that the manifest doesn't list are left
 * untouched. `--hooks` merges hooks/hooks.json into `.claude/settings.json` — only
 * entries whose command carries the kit's handler-path marker are ever replaced.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(kitRoot, "manifest.json"), "utf8"));

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
};

const checkMode = flag("--check");
const withGlobal = flag("--global");
const withHooks = flag("--hooks");
const dest = resolve(opt("--dest") ?? process.cwd());
const adapterArg = opt("--adapter");

/** Recursively list all files under a directory. */
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = join(dir, entry.name);
    return entry.isDirectory() ? walk(p) : [p];
  });

const posix = (p) => p.replaceAll("\\", "/");
const label = (p) => posix(p.startsWith(dest) ? relative(dest, p) : p);

const drifted = [];
let written = 0;
let unchanged = 0;

/** Copy (or, in check mode, diff) one file from kit source to an installed path. */
function syncFile(srcPath, outPath) {
  const want = readFileSync(srcPath);
  const have = existsSync(outPath) ? readFileSync(outPath) : null;
  if (have?.equals(want)) {
    unchanged++;
    return;
  }
  if (checkMode) {
    drifted.push(label(outPath));
    return;
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, want);
  written++;
}

function syncSkill(name, skillsDir) {
  const src = join(kitRoot, "skills", name);
  for (const file of walk(src)) {
    syncFile(file, join(skillsDir, name, relative(src, file)));
  }
}

// 1. Project skills — every skill in the manifest.
const projectSkills = join(dest, ".claude", "skills");
for (const skill of manifest.skills) {
  syncSkill(skill.name, projectSkills);
}

// 2. Dual-home skills — also installed to the user's global skills dir.
if (withGlobal) {
  const globalSkills = join(homedir(), ".claude", "skills");
  for (const skill of manifest.skills.filter((s) => s.dualHome)) {
    syncSkill(skill.name, globalSkills);
  }
}

// 3. Hook handlers — installed alongside skills (and drift-guarded the same way);
//    inert until the hook config is merged into settings via --hooks.
const hooksSrc = join(kitRoot, "hooks");
const hooksDest = join(dest, ".claude", "hooks", "ai-dev-kit");
for (const file of walk(hooksSrc)) {
  if (file.endsWith(".mjs")) {
    syncFile(file, join(hooksDest, relative(hooksSrc, file)));
  }
}

// 4. Adapter config — validated as JSON, then copied verbatim. User-owned after
//    install: edit it freely in the project; --check never polices it.
if (adapterArg && !checkMode) {
  const text = readFileSync(resolve(adapterArg), "utf8");
  JSON.parse(text); // throws on invalid JSON before anything is written
  const outPath = join(dest, ".claude", "ai-dev-kit.config.json");
  const have = existsSync(outPath) ? readFileSync(outPath, "utf8") : null;
  if (have === text) {
    unchanged++;
  } else {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, text);
    written++;
    console.log(`adapter → ${label(outPath)}`);
  }
}

// 5. Hook config — merged into .claude/settings.json (--hooks). Kit-owned entries
//    are identified by the handler-path marker and replaced wholesale; everything
//    else in settings.json is preserved. Run-twice ⇒ byte-identical output.
if (withHooks && !checkMode) {
  const kitHooks = JSON.parse(readFileSync(join(hooksSrc, "hooks.json"), "utf8")).hooks;
  const settingsPath = join(dest, ".claude", "settings.json");
  const before = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : null;
  const settings = before ? JSON.parse(before) : {};
  const marker = ".claude/hooks/ai-dev-kit/";
  settings.hooks = settings.hooks ?? {};
  for (const [event, entries] of Object.entries(kitHooks)) {
    const kept = (settings.hooks[event] ?? [])
      .map((e) => ({
        ...e,
        hooks: (e.hooks ?? []).filter((h) => !String(h.command ?? "").includes(marker)),
      }))
      .filter((e) => e.hooks.length > 0);
    settings.hooks[event] = [...kept, ...entries];
  }
  const text = `${JSON.stringify(settings, null, 2)}\n`;
  if (text === before) {
    unchanged++;
  } else {
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, text);
    written++;
    console.log(`hooks → merged into ${label(settingsPath)}`);
  }
}

// 6. Version stamp — deterministic (no timestamp) so re-installs produce zero diff.
const stamp = {
  kit: manifest.version,
  skills: Object.fromEntries(manifest.skills.map((s) => [s.name, s.version])),
};
const stampText = `${JSON.stringify(stamp, null, 2)}\n`;
const stampPath = join(dest, ".claude", "ai-dev-kit.installed.json");
const haveStamp = existsSync(stampPath) ? readFileSync(stampPath, "utf8") : null;
if (haveStamp === stampText) {
  unchanged++;
} else if (checkMode) {
  drifted.push(label(stampPath));
} else {
  mkdirSync(dirname(stampPath), { recursive: true });
  writeFileSync(stampPath, stampText);
  written++;
}

// 7. Report.
if (checkMode) {
  if (drifted.length > 0) {
    console.error(`ai-dev-kit ${manifest.version}: DRIFT in ${drifted.length} file(s):`);
    for (const f of drifted) {
      console.error(`  ${f}`);
    }
    console.error("Fix: edit kit source, then re-run `node ai-dev-kit/install.mjs`.");
    process.exit(1);
  }
  console.log(
    `ai-dev-kit ${manifest.version}: installed copies match kit source (${unchanged} files).`,
  );
} else {
  console.log(
    `ai-dev-kit ${manifest.version}: ${written} file(s) written, ${unchanged} unchanged.`,
  );
  if (!withHooks) {
    console.log("Run with --hooks to merge the hook config into .claude/settings.json.");
  }
}
