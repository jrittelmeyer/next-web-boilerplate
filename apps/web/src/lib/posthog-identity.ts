// Client-side PostHog identity sync (P2-5) — the DECISION LOGIC, extracted from
// the PostHogAuthSync component (components/observability/posthog-provider.tsx)
// so it's unit-testable in the node Vitest project (the user-agent.ts pattern; the
// component itself is a thin useSession→effect shell). No "server-only": this runs
// in the browser against the posthog-js singleton.

/** The slice of posthog-js this module touches (also what tests mock). */
export type PostHogLike = {
  get_distinct_id(): string;
  identify(distinctId: string, properties?: Record<string, unknown>): void;
  reset(): void;
};

export type SessionUser = { id: string; email: string; name?: string };

/**
 * Reconcile PostHog's identity with the current Better Auth session. Called from
 * a session watcher, NOT from the sign-in forms: OAuth sign-in is a top-level
 * redirect whose success path never runs a client callback, and sessions also end
 * outside the sign-out button (remote revoke, account deletion) — a watcher covers
 * every path with one component.
 *
 * - Signed in and PostHog still carries a different (anonymous) id → `identify`
 *   with the Better Auth user id, merging the device's pre-login anonymous events
 *   into the person. The id matches what server-side flag checks pass as
 *   `distinctId` (lib/posthog.ts), so client + server land on one person profile.
 * - Signed out after a session was seen this pageload → `reset`, so on a shared
 *   device the next visitor's events don't attribute to the signed-out user.
 *   Deliberately transition-based: reopening the app with an expired session does
 *   NOT reset — PostHog ties `reset` to explicit logout, and the device is still
 *   that person.
 * - Direct user-A→user-B flip without a signed-out step (cookie swap — rare) →
 *   `reset` first so A's identified events never merge into B, then `identify` B.
 *
 * @param hadSession whether a signed-in session was already observed this
 *   pageload (the caller keeps it in a ref and feeds back the return value).
 * @returns the next `hadSession` state.
 */
export function syncPostHogIdentity(
  posthog: PostHogLike,
  user: SessionUser | null,
  hadSession: boolean,
): boolean {
  if (user) {
    if (posthog.get_distinct_id() !== user.id) {
      if (hadSession) posthog.reset();
      posthog.identify(
        user.id,
        user.name ? { email: user.email, name: user.name } : { email: user.email },
      );
    }
    return true;
  }
  if (hadSession) posthog.reset();
  return false;
}
