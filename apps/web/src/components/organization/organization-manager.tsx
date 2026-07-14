"use client";

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Building2 } from "lucide-react";
import { useState } from "react";
import { CreateOrgDialog } from "./create-org-dialog";
import { InviteMemberForm } from "./invite-member-form";
import { MembersPanel } from "./members-panel";
import { OrgSettings } from "./org-settings";
import { PendingInvitations } from "./pending-invitations";

// Client orchestrator for /organization. Everything is driven by the reactive
// useActiveOrganization() hook (which bundles members + invitations and refetches after
// every /organization* mutation) plus useSession() to identify the caller, so the whole
// page stays live as members are invited, promoted, removed, or the org is switched from
// the header — no router.refresh() dependency for its own state. The caller's org role
// (derived from the members list) gates the management controls for UX only; Better Auth
// re-checks authority on every endpoint (see lib/organization / orgProcedure).
export function OrganizationManager({ emailConfigured }: { emailConfigured: boolean }) {
  const { data: session } = authClient.useSession();
  const { data: org, isPending } = authClient.useActiveOrganization();
  const [createOpen, setCreateOpen] = useState(false);

  if (isPending && !org) {
    return <p className="text-sm text-muted-foreground">Loading organization…</p>;
  }

  if (!org) {
    return (
      <>
        <EmptyState
          icon={<Building2 className="size-10" />}
          title="No organization selected"
          description="You're in your Personal workspace. Create an organization, or switch to one from the workspace menu in the header, to manage its members and invitations."
          action={
            <Button type="button" onClick={() => setCreateOpen(true)}>
              Create organization
            </Button>
          }
        />
        <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
      </>
    );
  }

  const currentUserId = session?.user?.id;
  const myMember = org.members.find((member) => member.userId === currentUserId);
  const myRole = myMember?.role ?? null;
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">{org.name}</h2>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono">{org.slug}</span>
          {myRole ? (
            <>
              {" · your role: "}
              <span className="capitalize">{myRole}</span>
            </>
          ) : null}
        </p>
      </div>

      <MembersPanel members={org.members} currentUserId={currentUserId} canManage={canManage} />
      {canManage ? <InviteMemberForm emailConfigured={emailConfigured} /> : null}
      <PendingInvitations invitations={org.invitations} canManage={canManage} />
      <OrgSettings
        orgId={org.id}
        orgName={org.name}
        isOwner={isOwner}
        isMember={Boolean(myMember)}
      />
    </div>
  );
}
