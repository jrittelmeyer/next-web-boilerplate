"use client";

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Check, ChevronsUpDown, Plus, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { CreateOrgDialog } from "./create-org-dialog";

// Header workspace switcher (Tier 4 · Band 4). Reads the reactive Better Auth org
// hooks — useListOrganizations() for the menu and useActiveOrganization() for the
// current selection — both of which refetch automatically after any /organization*
// call (create / setActive / accept / …). Switching goes through the client
// `setActive` ({ organizationId: null } clears back to the Personal workspace).
//
// The selected id is tracked in optimistic local state so the checkmark moves the
// instant it's clicked and never depends on router.refresh() committing (which can
// race right after a client fetch — see the SessionsCard note / next-router-refresh
// memory). refresh() only reconciles the server-rendered surfaces (e.g. post.list
// scoping) in the background. A failed switch rolls the selection back.
export function OrgSwitcher() {
  const t = useTranslations("Organization.switcher");
  const router = useRouter();
  const { data: organizations } = authClient.useListOrganizations();
  const { data: activeOrg } = authClient.useActiveOrganization();
  // `undefined` = defer to the server truth; `null` = Personal; a string = that org.
  const [optimisticId, setOptimisticId] = useState<string | null | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const activeId = optimisticId !== undefined ? optimisticId : (activeOrg?.id ?? null);
  const activeName =
    activeId === null
      ? t("personal")
      : (organizations?.find((org) => org.id === activeId)?.name ??
        activeOrg?.name ??
        t("fallbackName"));

  async function switchTo(organizationId: string | null) {
    if (organizationId === activeId) return;
    setPending(true);
    setOptimisticId(organizationId);
    const { error } = await authClient.organization.setActive({ organizationId });
    setPending(false);
    if (error) {
      setOptimisticId(undefined); // roll back to server truth
      return;
    }
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            className="max-w-48 justify-between gap-2"
            aria-label={t("srLabel")}
          >
            <span className="truncate">{activeName}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>{t("workspace")}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => void switchTo(null)}>
            <span className="flex-1">{t("personal")}</span>
            {activeId === null ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
          {organizations && organizations.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              {organizations.map((org) => (
                <DropdownMenuItem key={org.id} onSelect={() => void switchTo(org.id)}>
                  <span className="flex-1 truncate">{org.name}</span>
                  {activeId === org.id ? <Check className="size-4" /> : null}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              // Let the (modal) menu close normally, THEN open the dialog on the next
              // tick. preventDefault-ing to keep the menu open would leave its
              // aria-hidden on the rest of the layout after we navigate away (the menu
              // never closes to restore it); deferring the open also avoids a focus
              // fight between the menu's close-focus return and the dialog's focus trap.
              setTimeout(() => setCreateOpen(true), 0);
            }}
          >
            <Plus className="size-4" />
            {t("create")}
          </DropdownMenuItem>
          {activeId !== null ? (
            <DropdownMenuItem asChild>
              <Link href="/organization">
                <Settings className="size-4" />
                {t("manage")}
              </Link>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
