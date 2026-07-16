"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";
import { banUser, unbanUser } from "@/server/actions/admin";

// The per-row ban control for the admin user list (Admin plugin, Tier 4 · Band 4).
// Optimistic via React 19's `useOptimistic`, the same posture as RoleControl: the row's
// banned state flips immediately on submit, then the Server Action runs and its
// `revalidatePath("/admin")` reconciles the real `banned` prop when the transition
// settles (a slow round-trip never stalls the UI); a typed error reverts the optimistic
// value and toasts. Banning REVOKES the target's sessions + blocks their sign-in — done
// by the plugin endpoint the `banUser` action wraps.
//
// The banned badge lives here (not server-rendered in the page) so it moves with the
// optimistic state. The caller's own row renders nothing — an admin can't ban themselves
// (the action enforces this anti-lockout rule server-side; RoleControl already marks the
// row "(you)").
export function BanControl({
  userId,
  banned,
  currentUserId,
}: {
  userId: string;
  banned: boolean;
  currentUserId: string;
}) {
  const t = useTranslations("Admin.ban");
  const [, startTransition] = useTransition();
  const [optimisticBanned, setOptimisticBanned] = useOptimistic(banned);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (userId === currentUserId) return null;

  function runUnban() {
    startTransition(async () => {
      setOptimisticBanned(false);
      const result = await unbanUser({ userId });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(t("unbannedToast"));
    });
  }

  function runBan() {
    const trimmed = reason.trim();
    startTransition(async () => {
      setOptimisticBanned(true);
      const result = await banUser({
        userId,
        ...(trimmed ? { banReason: trimmed } : {}),
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setReasonOpen(false);
      setReason("");
      toast.success(t("bannedToast"));
    });
  }

  if (optimisticBanned) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
          {t("banned")}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={runUnban}>
          {t("unban")}
        </Button>
      </div>
    );
  }

  if (reasonOpen) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          runBan();
        }}
      >
        <Input
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("reasonPlaceholder")}
          aria-label={t("reasonLabel")}
          maxLength={500}
          className="h-8 w-40 text-xs"
        />
        <Button type="submit" variant="destructive" size="sm">
          {t("confirm")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setReasonOpen(false);
            setReason("");
          }}
        >
          {t("cancel")}
        </Button>
      </form>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => setReasonOpen(true)}>
      {t("ban")}
    </Button>
  );
}
