"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { UploadButton } from "@/lib/uploadthing-client";

// Client demo for the `imageUploader` route. The button calls the auth-gated
// Server route in lib/uploadthing.ts and surfaces the result inline. Delete or
// rewire when a real upload surface lands.
export function UploadDemo() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-3">
      <UploadButton
        endpoint="imageUploader"
        onClientUploadComplete={(res) => {
          setStatus(`Uploaded: ${res[0]?.ufsUrl ?? "done"}`);
          // Background reconcile so the server-rendered "Your uploads" list (P2-3)
          // picks up the new row; the status line above is the immediate feedback.
          router.refresh();
        }}
        onUploadError={(error: Error) => {
          setStatus(`Error: ${error.message}`);
        }}
      />
      {status ? (
        <p className="text-sm text-muted-foreground" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
