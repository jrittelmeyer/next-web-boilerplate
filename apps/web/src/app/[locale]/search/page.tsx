import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { SearchDemo } from "@/components/search/search-demo";
import { requireAdmin } from "@/lib/rbac";

// Public scaffold/demo route (like /uploads, /billing, /state). Search
// reads via the tRPC `search.search` query; the "Reindex posts from database"
// button writes via the ADMIN-gated `reindexPosts` Server Action (2026-07-16 —
// supersedes the P1-2 any-signed-in-user demo decision), so the button is only
// rendered for admins (`requireAdmin`, the same authoritative check the action
// enforces — hiding it is UX, the action is the authority). Both need a running
// Meilisearch (docker/docker-compose.yml) + MEILISEARCH_HOST/API_KEY; without
// them the page still renders and degrades gracefully. Delete this when a real
// search surface lands. See SERVICES.md.
export default async function SearchPage() {
  const canReindex = (await requireAdmin()) !== null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Search demo</CardTitle>
          <CardDescription>
            Full-text search over the <code>posts</code> index via Meilisearch. Create posts on
            /posts to index them on write; admins can bulk-reindex from the database.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SearchDemo canReindex={canReindex} />
        </CardContent>
      </Card>
    </main>
  );
}
