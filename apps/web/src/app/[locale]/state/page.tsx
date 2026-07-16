import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { UiStoreDemo } from "@/components/demo/ui-store-demo";

// Public scaffold/demo route (like /billing, /uploads). Two independent components read
// the same Zustand store, so toggling one updates both — proof it's global
// client state, not local useState. Server state would live in TanStack Query
// instead; see docs/context/STATE.md.
export default function StatePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Zustand store demo</CardTitle>
          <CardDescription>
            Two components, one global <code className="font-mono text-xs">useUiStore</code>.
            Toggling either keeps both in sync — and the preference persists across reloads (the
            hydration-safe <code className="font-mono text-xs">persist</code> recipe, STATE.md).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <UiStoreDemo label="Component A" />
          <UiStoreDemo label="Component B" />
        </CardContent>
      </Card>
    </main>
  );
}
