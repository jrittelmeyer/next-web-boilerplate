"use client";

import "@uploadthing/react/styles.css";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { UploadButton } from "@/lib/uploadthing-client";
import { removeUserAvatar } from "@/server/actions/avatar";

// Avatar section of the /account Profile card (Band-1 Tier-4). Upload goes through
// the auth-gated `avatarUploader` route (server persists `user.image` in
// onUploadComplete); Remove calls the `removeUserAvatar` action. The DISPLAYED
// avatar is driven by local optimistic state, never by router.refresh() committing
// (Next 16.2.9 race, see AUTH.md) — refresh is a background reconcile so the next
// server render (header + card) agrees. Outcomes surface as toasts (A1).
export function AvatarCard({
  image,
  name,
  email,
}: {
  image: string | null;
  name: string;
  email: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<string | null>(image);
  const [removing, setRemoving] = useState(false);

  const initial = (name.trim()[0] ?? email[0] ?? "?").toUpperCase();

  async function remove() {
    setRemoving(true);
    const previous = current;
    setCurrent(null); // optimistic
    const result = await removeUserAvatar();
    setRemoving(false);
    if ("error" in result) {
      setCurrent(previous); // roll back on failure
      toast.error(result.error);
      return;
    }
    toast.success("Photo removed.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Photo</span>
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {current ? <AvatarImage src={current} alt="" /> : null}
          <AvatarFallback className="text-xl">{initial}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <UploadButton
              endpoint="avatarUploader"
              onClientUploadComplete={(res) => {
                // The DB write lands via onUploadComplete; show the new file now.
                const url = res[0]?.ufsUrl;
                if (url) setCurrent(url);
                toast.success("Photo updated.");
                router.refresh();
              }}
              onUploadError={(error: Error) => {
                toast.error(error.message);
              }}
            />
            {current ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={removing}
                onClick={() => void remove()}
              >
                {removing ? "Removing…" : "Remove"}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">JPG, PNG or GIF, up to 2MB.</p>
        </div>
      </div>
    </div>
  );
}
