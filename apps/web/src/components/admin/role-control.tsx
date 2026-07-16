"use client";

import type { Role } from "@repo/db/schema";
import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";
import { setUserRole } from "@/server/actions/admin";

// The per-row write control for the admin user list (D2). Optimistic via React 19's
// `useOptimistic`: the button label flips immediately on click, then the `setUserRole`
// Server Action runs and its `revalidatePath("/admin")` refreshes the row's real `role`
// prop — which replaces the optimistic value when the transition settles (so a slow
// round-trip never stalls the UI). On a typed error the optimistic value is discarded
// and the row reverts; the outcome (success or error) surfaces as a toast (A1). This is
// the Server-Action flavour of optimistic UI — distinct from /posts, which patches the
// TanStack infinite-query cache around tRPC mutations.
//
// The caller's own row can't be changed (the action enforces this anti-lockout rule
// server-side; we mirror it here by rendering a "(you)" marker instead of a button, so
// the only-admin can't strip their own access).
export function RoleControl({
  userId,
  role,
  currentUserId,
}: {
  userId: string;
  role: Role;
  currentUserId: string;
}) {
  const t = useTranslations("Admin.role");
  const [, startTransition] = useTransition();
  const [optimisticRole, setOptimisticRole] = useOptimistic(role);

  if (userId === currentUserId) {
    return <span className="text-xs text-muted-foreground">{t("you")}</span>;
  }

  const nextRole: Role = optimisticRole === "admin" ? "user" : "admin";
  const label = optimisticRole === "admin" ? t("makeUser") : t("makeAdmin");

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          startTransition(async () => {
            setOptimisticRole(nextRole);
            const result = await setUserRole({ userId, role: nextRole });
            if ("error" in result) {
              toast.error(result.error);
              return;
            }
            toast.success(t("updated", { role: nextRole }));
          });
        }}
      >
        {label}
      </Button>
    </div>
  );
}
