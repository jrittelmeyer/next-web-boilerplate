import { db } from "@repo/db";
import { auditLog, user } from "@repo/db/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { describeAuditEvent } from "@/lib/audit-format";
import { decodeKeysetCursor, encodeKeysetCursor } from "@/lib/keyset-cursor";
import { requireAdmin } from "@/lib/rbac";

// Admin-only READ surface over the `audit_log` table (B2). The write side shipped first
// (recordAuditEvent, migration 0011 — see AUTH.md → Persisted audit trail); this is the
// documented follow-up that turns the queryable trail into a usable page.
//
// Guard + shell are identical to /admin: it lives under (dashboard) for the app shell,
// the proxy's `/admin/:path*` matcher gives it the optimistic cookie-only edge redirect,
// and the AUTHORITATIVE check is requireAdmin() HERE (a fresh DB role read) → a non-admin
// with a session gets notFound(), so the area's existence isn't revealed.
//
// Pagination is the same keyset pattern as /admin (P3-5), reusing lib/keyset-cursor: the
// `?after=` param carries the (createdAt, id) of the last row on the previous page, the
// WHERE selects rows strictly older than it under a (createdAt desc, id desc) ordering,
// and a limit+1 probe learns whether another page exists. A missing/garbled cursor decodes
// to null → page 1, never an error. Served by audit_log_created_at_idx (migration 0011).
//
// actor_id / target_id are denormalized FK-less text (they must outlive the users they
// reference — see the schema note), so two aliased LEFT JOINs resolve them to an email
// when the user still exists, falling back to the raw id when it's gone. Read-only: no
// mutation happens here, so there's nothing to revalidate. A real admin area would add
// action/actor filters on top of this list.
const PAGE_SIZE = 20;

// audit_log.id is a uuid, so a decoded cursor's id must be validated before it reaches
// the keyset comparison: Postgres throws `invalid input syntax for type uuid` on a
// non-uuid, which would 500 the page on a hand-edited `?after=`. (The /admin page skips
// this — user.id is text, which accepts any value.) Canonical 8-4-4-4-12 hex.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ after?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin.audit");
  const tPagination = await getTranslations("Admin.pagination");
  // Deterministic, server-rendered timestamp (no client JS → no hydration drift):
  // the A32 "short" named format under the request config's global UTC timeZone —
  // locale-aware where the old hand-rolled en-US Intl instance wasn't.
  const format = await getFormatter();
  const admin = await requireAdmin();
  if (!admin) notFound();

  const { after } = await searchParams;
  // Drop a structurally-valid cursor whose id isn't a uuid (a garbled URL) → page 1, the
  // same graceful degradation decodeKeysetCursor gives an unparseable string. A cursor
  // this page emits always carries a real row uuid, so this only ever rejects bad input.
  const decoded = decodeKeysetCursor(after);
  const cursor = decoded && UUID_RE.test(decoded.id) ? decoded : null;

  const actorUser = alias(user, "actor_user");
  const targetUser = alias(user, "target_user");

  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorId: auditLog.actorId,
      targetId: auditLog.targetId,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
      actorEmail: actorUser.email,
      targetEmail: targetUser.email,
    })
    .from(auditLog)
    .leftJoin(actorUser, eq(actorUser.id, auditLog.actorId))
    .leftJoin(targetUser, eq(targetUser.id, auditLog.targetId))
    .where(
      cursor
        ? or(
            lt(auditLog.createdAt, cursor.createdAt),
            and(eq(auditLog.createdAt, cursor.createdAt), lt(auditLog.id, cursor.id)),
          )
        : undefined,
    )
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const events = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  // The cursor must be the last row we actually RENDER (not the probe row).
  const last = events[events.length - 1];
  const olderHref =
    hasMore && last ? `/admin/audit?after=${encodeURIComponent(encodeKeysetCursor(last))}` : null;

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
          <Link
            href="/admin"
            className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("backLink")}
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          // A stale/past-the-end cursor lands here — render gracefully; "Newest" recovers.
          <p className="py-3 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          // A26: real <table> (not a <ul> of flex rows) so the tabular data carries proper
          // column-header semantics for assistive tech. Event/actor cells wrap; only the
          // timestamp stays nowrap. The container's overflow-x-auto handles any overflow.
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colEvent")}</TableHead>
                <TableHead>{t("colActorTarget")}</TableHead>
                <TableHead className="text-right">{t("colTime")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => {
                const { label, detail } = describeAuditEvent({
                  action: e.action,
                  metadata: e.metadata,
                });
                const actor = e.actorEmail ?? e.actorId;
                const target = e.targetEmail ?? e.targetId;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-normal">
                      <span className="font-medium">{label}</span>
                      {detail ? <span className="text-muted-foreground"> · {detail}</span> : null}
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {actor ? t("byActor", { actor }) : t("bySystem")}
                      {target && target !== actor ? ` → ${target}` : null}
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <time
                        dateTime={e.createdAt.toISOString()}
                        className="whitespace-nowrap text-xs text-muted-foreground"
                      >
                        {format.dateTime(e.createdAt, "short")} UTC
                      </time>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {(cursor || olderHref) && (
          <nav
            aria-label={tPagination("label")}
            className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm"
          >
            {cursor ? (
              <Link
                href="/admin/audit"
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {tPagination("newest")}
              </Link>
            ) : (
              <span aria-hidden="true" />
            )}
            {olderHref && (
              <Link
                href={olderHref}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {tPagination("older")}
              </Link>
            )}
          </nav>
        )}
      </CardContent>
    </Card>
  );
}
