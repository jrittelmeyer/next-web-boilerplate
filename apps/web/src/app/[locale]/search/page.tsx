import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { SearchDemo } from "@/components/search/search-demo";

// Public scaffold/demo route (like /uploads, /billing, /state). Search
// reads via the tRPC `search.search` query; the "Index sample documents" button
// writes via the auth-gated `indexExampleDocuments` Server Action. Both need a
// running Meilisearch (docker/docker-compose.yml) + MEILISEARCH_HOST/API_KEY;
// without them the page still renders and degrades gracefully. Delete this when a
// real search surface lands. See SERVICES.md.
export default function SearchPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Search demo</CardTitle>
          <CardDescription>
            Full-text search over the <code>posts</code> index via Meilisearch. Reindex from the
            database (requires sign-in) or create posts on /posts, then search.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SearchDemo />
        </CardContent>
      </Card>
    </main>
  );
}
