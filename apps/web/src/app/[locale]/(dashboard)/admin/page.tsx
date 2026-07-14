import { db } from "@repo/db";
import { user } from "@repo/db/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { BanControl } from "@/components/admin/ban-control";
import { ImpersonateControl } from "@/components/admin/impersonate-control";
import { RoleControl } from "@/components/admin/role-control";
import { Link } from "@/i18n/navigation";
import { decodeKeysetCursor, encodeKeysetCursor } from "@/lib/keyset-cursor";
import { requireAdmin } from "@/lib/rbac";

// RBAC guard pattern (Step 21 · deepened in D2). The proxy (proxy.ts) does an
// OPTIMISTIC, cookie-only redirect for /admin (fast UX, no DB at the edge); the
// AUTHORITATIVE check lives HERE, in the Server Component, via requireAdmin() — a
// fresh DB role read. A logged-out caller is bounced to /login by the proxy; a
// logged-in non-admin reaches the page and gets a 404 (notFound), so the area's
// existence isn't revealed.
//
// Lives under the (dashboard) route group so it inherits the app shell (header /
// nav / user menu); the URL stays /admin (route groups don't affect the path).
//
// Reads its own data via direct DB access (sanctioned for Server Components; the
// same data is also exposed over tRPC as `admin.listUsers`). Each row's role is
// changed by the `setUserRole` Server Action via the client <RoleControl>, which is
// optimistic (React 19 `useOptimistic`) and lets the action's revalidatePath("/admin")
// reconcile this list — the Server-Action flavour of optimistic UI, distinct from
// /posts, which patches the TanStack infinite-query cache around tRPC mutations.
//
// Pagination (P3-5) is keyset, reusing the D1 pattern from post.list: the `?after=`
// param carries the (createdAt, id) of the last row on the previous page (encoded by
// lib/keyset-cursor), the WHERE selects rows strictly older than it, and a limit+1
// probe learns whether another page exists. In the Server-Action flavour the nav is
// plain server-rendered <Link>s — zero client JS — where /posts uses a TanStack
// infinite query for the same cursor shape. A missing or garbled cursor decodes to
// null → page 1, never an error. Backed by user_created_at_id_idx (migration 0006).
//
// Adapt this page for a real admin area; the guard wiring (proxy + requireAdmin) is
// the keeper. With no admin promoted yet, this 404s for everyone — the graceful
// default (see AUTH.md for how to promote the first admin).
const PAGE_SIZE = 20;

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ after?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const admin = await requireAdmin();
  if (!admin) notFound();

  const { after } = await searchParams;
  const cursor = decodeKeysetCursor(after);

  // Fetch one extra row to learn whether another page exists without a COUNT query.
  // The keyset predicate matches the (createdAt desc, id desc) ordering — same shape
  // as post.list (see trpc/routers/post.ts for the annotated original).
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(
      cursor
        ? or(
            lt(user.createdAt, cursor.createdAt),
            and(eq(user.createdAt, cursor.createdAt), lt(user.id, cursor.id)),
          )
        : undefined,
    )
    .orderBy(desc(user.createdAt), desc(user.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const users = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  // The cursor must be the last row we actually RENDER (not the probe row), or the
  // next page would skip it.
  const last = users[users.length - 1];
  const olderHref =
    hasMore && last ? `/admin?after=${encodeURIComponent(encodeKeysetCursor(last))}` : null;

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Admin area</CardTitle>
            <CardDescription>
              Signed in as {admin.session.user.email} (role: {admin.role}). Promote or demote any
              user below — you can&apos;t change your own role.
            </CardDescription>
          </div>
          <Link
            href="/admin/audit"
            className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Audit log →
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          // A stale/past-the-end cursor (e.g. the last row on this page was deleted)
          // lands here — render the empty page gracefully; "Newest" recovers.
          <p className="py-3 text-sm text-muted-foreground">No users on this page.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.name}</p>
                  <p className="truncate text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium">
                    {u.role}
                  </span>
                  <RoleControl userId={u.id} role={u.role} currentUserId={admin.session.user.id} />
                  <BanControl
                    userId={u.id}
                    banned={u.banned}
                    currentUserId={admin.session.user.id}
                  />
                  <ImpersonateControl
                    userId={u.id}
                    role={u.role}
                    currentUserId={admin.session.user.id}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {(cursor || olderHref) && (
          <nav
            aria-label="Pagination"
            className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm"
          >
            {cursor ? (
              <Link
                href="/admin"
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                ← Newest
              </Link>
            ) : (
              <span aria-hidden="true" />
            )}
            {olderHref && (
              <Link
                href={olderHref}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Older →
              </Link>
            )}
          </nav>
        )}
      </CardContent>
    </Card>
  );
}
