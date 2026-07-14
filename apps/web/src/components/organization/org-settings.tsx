"use client";

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

// Organization settings + danger zone (Tier 4 · Band 4). Rename is owner-only; the
// danger zone is Delete (owner — type-to-confirm, mirroring DeleteAccountCard's intent
// gate) or Leave (any non-owner member). All go through the Better Auth client, which
// re-checks authority server-side. Destructive success drops the caller out of the org,
// so we clear the active workspace and route to /dashboard; the reactive hooks + refresh
// reconcile the switcher and server-rendered surfaces.
export function OrgSettings({
  orgId,
  orgName,
  isOwner,
  isMember,
}: {
  orgId: string;
  orgName: string;
  isOwner: boolean;
  isMember: boolean;
}) {
  const router = useRouter();

  return (
    <>
      {isOwner ? <RenameCard orgId={orgId} orgName={orgName} /> : null}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>
            {isOwner
              ? "Deleting the organization removes it and all its memberships. This can't be undone."
              : "Leaving removes your access to this organization. An owner or admin would have to re-invite you."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isOwner ? (
            <DeleteOrg orgId={orgId} orgName={orgName} onDone={() => leaveToDashboard(router)} />
          ) : isMember ? (
            <LeaveOrg orgId={orgId} onDone={() => leaveToDashboard(router)} />
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

// Clear the (now-departed) active org and return to the dashboard. router.refresh()
// reconciles the server-rendered shell in the background.
async function leaveToDashboard(router: ReturnType<typeof useRouter>) {
  await authClient.organization.setActive({ organizationId: null });
  router.push("/dashboard");
  router.refresh();
}

function RenameCard({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [name, setName] = useState(orgName);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<
    { kind: "idle" | "saved" } | { kind: "error"; message: string }
  >({
    kind: "idle",
  });
  const trimmed = name.trim();
  const unchanged = trimmed === orgName || trimmed.length === 0;

  async function save() {
    setStatus({ kind: "idle" });
    setSaving(true);
    const { error } = await authClient.organization.update({
      organizationId: orgId,
      data: { name: trimmed },
    });
    setSaving(false);
    if (error) {
      setStatus({ kind: "error", message: error.message ?? "Could not rename the organization." });
      return;
    }
    setStatus({ kind: "saved" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization name</CardTitle>
        <CardDescription>The display name your members see.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="org-name">Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setStatus({ kind: "idle" });
              }}
            />
          </div>
          <Button type="button" disabled={saving || unchanged} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        {status.kind === "error" ? (
          <p className="text-sm text-destructive" role="alert">
            {status.message}
          </p>
        ) : null}
        {status.kind === "saved" ? (
          <p className="text-sm text-muted-foreground" role="status">
            Name updated.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DeleteOrg({
  orgId,
  orgName,
  onDone,
}: {
  orgId: string;
  orgName: string;
  onDone: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    setPending(true);
    const { error: err } = await authClient.organization.delete({ organizationId: orgId });
    if (err) {
      setPending(false);
      setError(err.message ?? "Could not delete the organization.");
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-delete">
          Type <span className="font-medium text-foreground">{orgName}</span> to confirm
        </Label>
        <Input
          id="confirm-delete"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="off"
        />
      </div>
      <div>
        <Button
          type="button"
          variant="destructive"
          disabled={pending || confirm !== orgName}
          onClick={() => void remove()}
        >
          {pending ? "Deleting…" : "Delete organization"}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function LeaveOrg({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setError(null);
    setPending(true);
    const { error: err } = await authClient.organization.leave({ organizationId: orgId });
    if (err) {
      setPending(false);
      setError(err.message ?? "Could not leave the organization.");
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button type="button" variant="destructive" disabled={pending} onClick={() => void leave()}>
          {pending ? "Leaving…" : "Leave organization"}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
