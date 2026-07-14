import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { config } from "dotenv";

/**
 * Local-dev Postgres backup & restore for the Dockerized dev database. Run with:
 *
 *   pnpm --filter @repo/db db:backup                          # dump appdb → backups/*.dump
 *   pnpm --filter @repo/db db:restore                         # restore the newest dump
 *   pnpm --filter @repo/db db:restore --file backups/x.dump   # restore a specific dump
 *   pnpm --filter @repo/db db:restore --into appdb_scratch    # restore into a scratch DB
 *
 * This is the LOCAL-DEV path only: it runs `pg_dump` / `pg_restore` INSIDE the
 * `postgres` compose service (`nwb-postgres`), so the client binaries always match the
 * server version and nothing needs installing on the host — pure Node child_process,
 * so it's Windows-safe. The PRODUCTION path (a direct `pg_dump "$DATABASE_URL"` and
 * provider snapshots / PITR) is documented in DATABASE.md, not scripted here.
 *
 * Dumps are custom-format (`-Fc`) so restore is `pg_restore --clean --if-exists` — it
 * DROPs and recreates every object in the target DB. `--into` restores into a different
 * (scratch) database instead, creating it first, which is the safe way to inspect a
 * backup without touching the live dev DB.
 *
 * `dotenv` loads the repo-root `.env` so DATABASE_URL is available to parse (user + db
 * name); commands run via `pnpm --filter @repo/db`, so cwd is this package (root = ../..).
 */
config({ path: resolve(process.cwd(), "../../.env") });

const REPO_ROOT = resolve(process.cwd(), "../..");
const COMPOSE_FILE = resolve(REPO_ROOT, "docker/docker-compose.yml");
const BACKUPS_DIR = resolve(REPO_ROOT, "backups");
const SERVICE = "postgres";

interface DbCredentials {
  user: string;
  password: string;
  database: string;
}

function parseDatabaseUrl(): DbCredentials {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is not set — expected it in the repo-root .env.");
  }
  const url = new URL(raw);
  return {
    user: decodeURIComponent(url.username) || "postgres",
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, "") || "postgres",
  };
}

/**
 * Run a command inside the `postgres` compose service via `docker compose exec -T`.
 * Optionally stream a local file into the command's stdin (restore) or capture its
 * stdout to a local file (backup). Rejects on a non-zero exit or a launch failure.
 */
function dockerExec(
  inContainer: string[],
  opts: { pgPassword?: string; stdinFile?: string; stdoutFile?: string } = {},
): Promise<void> {
  const args = ["compose", "-f", COMPOSE_FILE, "exec", "-T"];
  if (opts.pgPassword !== undefined) {
    args.push("-e", `PGPASSWORD=${opts.pgPassword}`);
  }
  args.push(SERVICE, ...inContainer);

  return new Promise((resolvePromise, reject) => {
    const child = spawn("docker", args, {
      stdio: [opts.stdinFile ? "pipe" : "ignore", opts.stdoutFile ? "pipe" : "inherit", "inherit"],
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to launch docker (${err.message}). Is Docker running and on PATH?`));
    });

    if (opts.stdinFile && child.stdin) {
      const input = createReadStream(opts.stdinFile);
      input.on("error", reject);
      input.pipe(child.stdin);
    }

    // Wait for the capture file to finish flushing before resolving, so a backup file
    // is complete by the time this promise settles.
    let stdoutFlushed: Promise<void> = Promise.resolve();
    if (opts.stdoutFile && child.stdout) {
      const out = createWriteStream(opts.stdoutFile);
      stdoutFlushed = new Promise((res, rej) => {
        out.on("finish", () => res());
        out.on("error", rej);
      });
      child.stdout.pipe(out);
    }

    child.on("close", (code) => {
      stdoutFlushed.then(() => {
        if (code === 0) {
          resolvePromise();
        } else {
          reject(new Error(`\`${inContainer[0]}\` exited with code ${code}.`));
        }
      }, reject);
    });
  });
}

async function backup(): Promise<void> {
  const { user, password, database } = parseDatabaseUrl();
  await mkdir(BACKUPS_DIR, { recursive: true });
  // ISO timestamp, colons/dots swapped for dashes so the filename is Windows-safe and
  // still sorts chronologically (lexical order == time order).
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = resolve(BACKUPS_DIR, `${database}-${stamp}.dump`);

  console.log(`Backing up "${database}" → ${relative(REPO_ROOT, outFile)}`);
  try {
    await dockerExec(
      // `--exclude-schema=pgboss`: the pg-boss job queue owns its own schema and
      // rebuilds it on boss.start() (see DATABASE.md — it's a managed black box). It's
      // transient state, not app data, and its PARTITIONED tables also make a
      // `pg_restore --clean` over a populated DB fail (can't drop an inherited
      // constraint). Excluding it keeps the backup to the app's `public` data and makes
      // restore clean. Add more `--exclude-schema` flags if you introduce other
      // engine-owned schemas.
      [
        "pg_dump",
        "-U",
        user,
        "-d",
        database,
        "-Fc",
        "--no-owner",
        "--no-privileges",
        "--exclude-schema=pgboss",
      ],
      { pgPassword: password, stdoutFile: outFile },
    );
  } catch (err) {
    await rm(outFile, { force: true }); // drop the partial/empty file on failure
    throw err;
  }

  const { size } = await stat(outFile);
  if (size === 0) {
    await rm(outFile, { force: true });
    throw new Error("pg_dump produced an empty file — is the postgres container up?");
  }
  console.log(`✓ Backup complete (${(size / 1024).toFixed(1)} KiB).`);
  console.log("  Restore it with: pnpm --filter @repo/db db:restore");
}

function flagValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

async function latestBackup(): Promise<string> {
  let entries: string[] = [];
  try {
    entries = await readdir(BACKUPS_DIR);
  } catch {
    // dir doesn't exist yet — handled below
  }
  const dumps = entries.filter((f) => f.endsWith(".dump")).sort();
  const newest = dumps.at(-1);
  if (!newest) {
    throw new Error(
      `No .dump files in ${relative(REPO_ROOT, BACKUPS_DIR)}. Run "db:backup" first.`,
    );
  }
  return resolve(BACKUPS_DIR, newest);
}

/** CREATE DATABASE for a scratch restore target (no-op if it already exists). */
async function ensureDatabase(name: string, creds: DbCredentials): Promise<void> {
  try {
    await dockerExec(
      [
        "psql",
        "-U",
        creds.user,
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `CREATE DATABASE "${name}"`,
      ],
      { pgPassword: creds.password },
    );
    console.log(`  Created database "${name}".`);
  } catch {
    console.log(`  Database "${name}" already exists — restoring into it.`);
  }
}

async function restore(argv: string[]): Promise<void> {
  const creds = parseDatabaseUrl();
  const into = flagValue(argv, "--into") ?? creds.database;
  const fileArg = flagValue(argv, "--file");
  const file = fileArg ? resolve(process.cwd(), fileArg) : await latestBackup();

  console.warn(
    `\n⚠  Restoring ${relative(REPO_ROOT, file)} into "${into}".\n` +
      `   pg_restore --clean --if-exists will DROP and recreate every object in "${into}".`,
  );

  if (into !== creds.database) {
    await ensureDatabase(into, creds);
  }

  await dockerExec(
    [
      "pg_restore",
      "-U",
      creds.user,
      "-d",
      into,
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
    ],
    { pgPassword: creds.password, stdinFile: file },
  );
  console.log(`✓ Restore into "${into}" complete.`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "backup":
      await backup();
      break;
    case "restore":
      await restore(rest);
      break;
    default:
      console.error(
        "Usage:\n" +
          "  pnpm --filter @repo/db db:backup\n" +
          "  pnpm --filter @repo/db db:restore [--file <path>] [--into <db>]",
      );
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error("✗", error instanceof Error ? error.message : error);
  process.exit(1);
});
