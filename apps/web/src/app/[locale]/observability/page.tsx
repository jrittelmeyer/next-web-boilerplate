import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { ObservabilityDemo } from "@/components/observability/observability-demo";
import { getPostHogServer, isPostHogConfigured } from "@/lib/posthog";

// Server-side PostHog feature-flag evaluation. Done on the server so the UI never
// flickers between the default and the resolved value. Returns a neutral
// "unconfigured" (never throws) when analytics isn't set up.
async function getExampleFlag(): Promise<boolean | "unconfigured"> {
  if (!isPostHogConfigured()) return "unconfigured";
  try {
    const enabled = await getPostHogServer().isFeatureEnabled(
      "example-flag",
      "observability-demo-user",
    );
    return enabled ?? false;
  } catch {
    return "unconfigured";
  }
}

// Public scaffold/demo route (like /search, /uploads, /billing, /state).
// Exercises all three observability integrations — Sentry (error capture),
// BetterStack (structured log via a Server Action), and PostHog (a client event
// plus this server-side flag check). Everything degrades gracefully when the
// observability env vars are unset. Delete this when real instrumentation lands.
// See SERVICES.md.
export default async function ObservabilityPage() {
  const exampleFlag = await getExampleFlag();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Observability demo</CardTitle>
          <CardDescription>
            Error tracking (Sentry), structured logging (BetterStack), and analytics + feature flags
            (PostHog). Each button is a no-op until its env vars are set.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ObservabilityDemo exampleFlag={exampleFlag} />
        </CardContent>
      </Card>
    </main>
  );
}
