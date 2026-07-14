// Root route-level loading UI. Streamed in via Suspense during navigation and the
// initial server render. Uses Tailwind's built-in animate-spin — no dependency.
export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div
        role="status"
        aria-label="Loading"
        className="size-8 animate-spin rounded-full border-2 border-muted border-t-foreground"
      />
    </main>
  );
}
