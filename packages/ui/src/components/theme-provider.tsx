"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type * as React from "react";

// Thin wrapper over next-themes' provider (shadcn's canonical pattern). It is a
// "use client" boundary, but renders `children` straight through, so Server
// Components passed into the app's root layout stay server-rendered — adding it
// does not widen the RSC boundary (same posture as PostHogProvider). The app
// supplies the config (attribute="class", defaultTheme, enableSystem, …) when it
// mounts this in layout.tsx, so theme behavior lives with the app, not @repo/ui.
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
