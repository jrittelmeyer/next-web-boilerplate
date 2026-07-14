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
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * Passkeys / WebAuthn (Tier 4 · Band 3) on the /account page. Lets a signed-in user register
 * platform (Touch ID / Windows Hello) or roaming (security key) passkeys, rename them, and
 * remove them. All mutations go through the Better Auth client (the C1 convention —
 * re-validated server-side, `{ data, error }`, no throw, no new CSP origin; WebAuthn is a
 * same-origin browser API).
 *
 * Unlike the Two-factor card this is NOT password-gated and is shown to every user: adding a
 * passkey while signed in is already authorized by the session, and passkeys are ADDITIVE here
 * (they supplement password/OAuth), so removing one can never lock anyone out.
 *
 * The list is SSR-seeded from a direct `passkey`-table read in the page (like the Sessions
 * card) and then owned in local state — each mutation patches that state directly from its
 * result (add appends the returned row, rename patches it, delete filters it out), and
 * `router.refresh()` is background reconcile only. The UI must never gate on the refresh
 * committing (Next 16.2.9 race — see AUTH.md → Sessions).
 */

// A minimal projection of a passkey row — never the publicKey / credentialID (verification
// material the client has no need for). `createdAt` survives RSC serialization as a Date.
export type PasskeyRow = {
  id: string;
  name: string | null;
  createdAt: Date;
  deviceType: string;
  backedUp: boolean;
};

// A synced passkey (iCloud Keychain / Google Password Manager / 1Password) reports
// deviceType "multiDevice" and/or backedUp; otherwise it's bound to this authenticator.
function deviceHint(row: PasskeyRow): string {
  return row.deviceType === "multiDevice" || row.backedUp
    ? "Synced across your devices"
    : "This device only";
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Cancelling the browser passkey prompt (or letting it time out) surfaces as this code — a
// normal user action, so we swallow it rather than showing a scary error. (`message` is only
// here to overlap the Better Auth error union, whose non-coded variant carries no `code`.)
function isCancellation(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "REGISTRATION_CANCELLED" || error?.code === "AUTH_CANCELLED";
}

export function PasskeysCard({ initialPasskeys }: { initialPasskeys: PasskeyRow[] }) {
  const router = useRouter();
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>(initialPasskeys);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Feature-detect WebAuthn (secure context + platform support). Set in an effect so SSR and
  // the first client render agree (avoids a hydration mismatch); defaults to supported.
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported(typeof window !== "undefined" && typeof window.PublicKeyCredential === "function");
  }, []);

  async function onAdd() {
    setError(null);
    setBusy(true);
    const result = await authClient.passkey.addPasskey({ name: name.trim() || undefined });
    setBusy(false);
    // addPasskey resolves to `{ data, error }` (data is null on failure). A cancelled prompt
    // is not worth surfacing.
    if (!result || result.error || !result.data) {
      if (result?.error && !isCancellation(result.error)) {
        setError(result.error.message ?? "Could not add a passkey. Please try again.");
      }
      return;
    }
    const created = result.data;
    setPasskeys((prev) => [
      {
        id: created.id,
        name: created.name ?? null,
        createdAt: created.createdAt,
        deviceType: created.deviceType,
        backedUp: created.backedUp,
      },
      ...prev,
    ]);
    setName("");
    router.refresh();
  }

  async function onRename(id: string, nextName: string) {
    setError(null);
    const trimmed = nextName.trim();
    const { error: updateError } = await authClient.passkey.updatePasskey({ id, name: trimmed });
    if (updateError) {
      setError(updateError.message ?? "Could not rename the passkey. Please try again.");
      return false;
    }
    setPasskeys((prev) => prev.map((p) => (p.id === id ? { ...p, name: trimmed || null } : p)));
    router.refresh();
    return true;
  }

  async function onDelete(id: string) {
    setError(null);
    const { error: deleteError } = await authClient.passkey.deletePasskey({ id });
    if (deleteError) {
      setError(deleteError.message ?? "Could not remove the passkey. Please try again.");
      return;
    }
    setPasskeys((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passkeys</CardTitle>
        <CardDescription>
          Sign in without a password using your device&rsquo;s biometrics or a security key.
          Passkeys work alongside your existing sign-in methods.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {passkeys.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-md border">
            {passkeys.map((pk) => (
              <PasskeyItem key={pk.id} row={pk} onRename={onRename} onDelete={onDelete} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">You haven&rsquo;t added any passkeys yet.</p>
        )}

        {supported ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="passkey-name" className="text-sm font-medium">
                  Name <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Input
                  id="passkey-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. MacBook Touch ID"
                  className="max-w-xs"
                />
              </div>
              <Button type="button" onClick={() => void onAdd()} disabled={busy}>
                {busy ? "Waiting for your device…" : "Add a passkey"}
              </Button>
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This browser doesn&rsquo;t support passkeys.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// One passkey row: name + device/created metadata, with inline rename and remove. Owns its
// own edit state so the parent only needs the id-keyed callbacks.
function PasskeyItem({
  row,
  onRename,
  onDelete,
}: {
  row: PasskeyRow;
  onRename: (id: string, name: string) => Promise<boolean>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.name ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const ok = await onRename(row.id, draft);
    setSaving(false);
    if (ok) setEditing(false);
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-3">
      {editing ? (
        <form
          className="flex flex-1 flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Passkey name"
            aria-label="Passkey name"
            className="max-w-xs"
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setDraft(row.name ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{row.name || "Unnamed passkey"}</span>
            <span className="text-xs text-muted-foreground">
              {deviceHint(row)} · Added {formatDate(row.createdAt)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              Rename
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void onDelete(row.id)}>
              Remove
            </Button>
          </div>
        </>
      )}
    </li>
  );
}
