"use client";

import { authClient } from "@repo/auth/client";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type OrgMember = {
  id: string;
  userId: string;
  role: string;
  user: { id: string; email: string; name: string; image?: string | null };
};

// Members list + role management + removal (Tier 4 · Band 4). Data comes from the
// reactive useActiveOrganization() hook in the parent, so any successful mutation here
// refetches the org (all /organization* paths signal it) and the list re-renders on its
// own. Role changes carry an optimistic override and removals hide the row immediately
// (the SessionsCard convention) so the UI never waits on a round trip; a failure reverts.
// Management controls only render when `canManage` (the caller is owner/admin) — but that
// is UX only; Better Auth re-checks authority on every endpoint (see lib/organization).
export function MembersPanel({
  members,
  currentUserId,
  canManage,
}: {
  members: OrgMember[];
  currentUserId: string | undefined;
  canManage: boolean;
}) {
  const t = useTranslations("Organization.members");
  const [optimisticRoles, setOptimisticRoles] = useState<Record<string, string>>({});
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = members.filter((member) => !removedIds.has(member.id));

  async function changeRole(member: OrgMember, nextRole: string) {
    setError(null);
    setPendingId(member.id);
    setOptimisticRoles((prev) => ({ ...prev, [member.id]: nextRole }));
    const { error: err } = await authClient.organization.updateMemberRole({
      memberId: member.id,
      role: nextRole,
    });
    setPendingId(null);
    if (err) {
      setOptimisticRoles((prev) => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      });
      setError(err.message ?? t("errorRole"));
    }
  }

  async function remove(member: OrgMember) {
    setError(null);
    setPendingId(member.id);
    const { error: err } = await authClient.organization.removeMember({
      memberIdOrEmail: member.id,
    });
    setPendingId(null);
    if (err) {
      setError(err.message ?? t("errorRemove"));
      return;
    }
    setRemovedIds((prev) => new Set([...prev, member.id]));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3">
          {visible.map((member) => {
            const role = optimisticRoles[member.id] ?? member.role;
            const isSelf = member.userId === currentUserId;
            const isOwner = role === "owner";
            const initial = (
              member.user.name.trim()[0] ??
              member.user.email[0] ??
              "?"
            ).toUpperCase();
            return (
              <li
                key={member.id}
                className="flex items-center justify-between gap-4 rounded-md border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-9">
                    {member.user.image ? <AvatarImage src={member.user.image} alt="" /> : null}
                    <AvatarFallback>{initial}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {member.user.name || member.user.email}
                      {isSelf ? (
                        <span className="ml-2 rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                          {t("you")}
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {member.user.email}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canManage && !isSelf && !isOwner ? (
                    <Select
                      value={role}
                      disabled={pendingId === member.id}
                      onValueChange={(next) => {
                        if (next !== role) void changeRole(member, next);
                      }}
                    >
                      <SelectTrigger className="w-28" aria-label={t("roleLabel")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">{t("roleMember")}</SelectItem>
                        <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="rounded-full border px-2.5 py-0.5 text-xs capitalize text-muted-foreground">
                      {role}
                    </span>
                  )}
                  {canManage && !isSelf && !isOwner ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pendingId === member.id}
                      onClick={() => void remove(member)}
                    >
                      {pendingId === member.id ? t("removing") : t("remove")}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
