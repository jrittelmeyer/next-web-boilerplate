import "@uploadthing/react/styles.css";
import { auth } from "@repo/auth";
import { db } from "@repo/db";
import { uploads } from "@repo/db/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { UploadDemo } from "@/components/uploads/upload-demo";
import { UploadsList } from "@/components/uploads/uploads-list";

// Public scaffold/demo route (like /billing, /state). The UploadButton
// hits the `imageUploader` route in lib/uploadthing.ts, which is auth-gated +
// rate-limited and needs UPLOADTHING_TOKEN to actually store files — without it
// uploads fail gracefully. Signed-in visitors also get their uploads back (P2-3
// read path — a direct `uploads`-table read, the same server-render pattern as the
// /account sessions card) with per-row Delete via the `deleteUpload` Server Action.
// Delete this route when a real upload surface lands. See SERVICES.md.
//
// The prebuilt Uploadthing stylesheet is imported here (not via the `withUt`
// Tailwind plugin, which targets a v3-style JS config) because the app is on
// Tailwind v4 (CSS-config). It styles the .ut-* classes self-containedly.
export default async function UploadsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const rows = session
    ? await db.query.uploads.findMany({
        columns: { id: true, name: true, url: true, size: true, type: true, createdAt: true },
        where: eq(uploads.userId, session.user.id),
        orderBy: [desc(uploads.createdAt)],
      })
    : [];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Upload demo</CardTitle>
          <CardDescription>
            Upload an image (max 4MB) via Uploadthing. Requires sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <UploadDemo />
        </CardContent>
      </Card>

      {session ? (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Your uploads</CardTitle>
            <CardDescription>
              Files you've uploaded. Deleting removes the file from storage and the record here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UploadsList rows={rows} />
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
