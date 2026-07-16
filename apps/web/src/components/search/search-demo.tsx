"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc/client";
import { reindexPosts } from "@/server/actions/post";

type IndexStatus =
  | { kind: "idle" }
  | { kind: "indexing" }
  | { kind: "done"; indexed: number }
  | { kind: "error"; message: string };

// Client demo for the search scaffold: a search box reads via the tRPC
// `search.search` query (server/trpc/routers/search.ts) over the real `posts`
// index, and — for admins only (`canReindex`, resolved server-side by the page)
// — a button bulk-rebuilds that index from the database via the ADMIN-gated
// `reindexPosts` action, handy after `db:seed`, which is DB-only. Hiding the
// button is UX; the Server Action's `requireAdmin()` is the authority (a
// non-admin invoking the action directly gets a typed "Forbidden"). Unset env
// shows "not configured". Create posts on /posts to index them on write.
export function SearchDemo({ canReindex }: { canReindex: boolean }) {
  const t = useTranslations("Search.demo");
  const trpc = useTRPC();
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({ kind: "idle" });

  const search = useQuery(
    trpc.search.search.queryOptions({ query }, { enabled: query.length > 0 }),
  );

  async function onIndex() {
    setIndexStatus({ kind: "indexing" });
    const result = await reindexPosts();
    if ("error" in result) {
      setIndexStatus({ kind: "error", message: result.error });
      return;
    }
    setIndexStatus({ kind: "done", indexed: result.data.indexed });
    if (query.length > 0) void search.refetch();
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(term.trim());
        }}
      >
        <Input
          name="q"
          placeholder={t("placeholder")}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <Button type="submit">{t("submit")}</Button>
      </form>

      {canReindex ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onIndex}
            disabled={indexStatus.kind === "indexing"}
          >
            {indexStatus.kind === "indexing" ? t("reindexing") : t("reindex")}
          </Button>
          {indexStatus.kind === "done" ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("reindexed", { count: indexStatus.indexed })}
            </p>
          ) : null}
          {indexStatus.kind === "error" ? (
            <p className="text-sm text-destructive" role="alert">
              {indexStatus.message}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2" aria-live="polite">
        {query.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canReindex ? t("emptyHintAdmin") : t("emptyHint")}
          </p>
        ) : search.isFetching ? (
          <p className="text-sm text-muted-foreground">{t("searching")}</p>
        ) : search.data && !search.data.configured ? (
          <p className="text-sm text-muted-foreground">{t("notConfigured")}</p>
        ) : search.data && search.data.hits.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noResults", { query })}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {search.data?.hits.map((hit) => (
              <li key={hit.id} className="rounded-md border p-3">
                <p className="font-medium">{hit.title}</p>
                <p className="text-sm text-muted-foreground">{hit.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
