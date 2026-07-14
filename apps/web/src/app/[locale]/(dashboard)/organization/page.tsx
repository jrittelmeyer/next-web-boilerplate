import { auth } from "@repo/auth";
import { isEmailConfigured } from "@repo/email";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { OrganizationManager } from "@/components/organization/organization-manager";

export const metadata: Metadata = { title: "Organization" };

// Organization management surface (Tier 4 · Band 4), inside the (dashboard) shell. The
// layout is the authoritative session gate; we re-read it here (cheap under the Step-19
// cookie cache) for defense-in-depth. The page is intentionally thin — all org data is
// driven client-side by the reactive Better Auth hooks in OrganizationManager, so
// switching the active org from the header updates this page without a full reload. Only
// `emailConfigured` is resolved server-side, to shape the invite copy (email-off → the
// copyable accept link). This is a REAL surface (like /account), not a throwaway demo.
export default async function OrganizationPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
        <p className="text-muted-foreground">
          Manage the active organization&rsquo;s members and invitations.
        </p>
      </div>
      <OrganizationManager emailConfigured={isEmailConfigured()} />
    </div>
  );
}
