"use client";

import { useTheme } from "next-themes";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// App-wide transient notifications (Band-1 A1). Thin themed wrapper over sonner's
// Toaster: it reads the active theme from next-themes (the same provider that drives
// dark mode) so toasts follow light/dark, and maps sonner's color slots to our shadcn
// design tokens (--popover*/--border from tooling/tailwind/base.css) instead of
// sonner's built-in palette. Like ThemeProvider it's a "use client" leaf mounted once
// in the app's root layout; it renders no children, so it doesn't widen the RSC boundary.
//
// `toast` is re-exported from here so app code has a SINGLE import site
// (`@repo/ui/components/sonner`) for both mounting the Toaster and firing toasts. That
// keeps sonner a dependency of @repo/ui alone — no second, hand-synced pin in apps/web
// (unlike lucide-react, which app code imports directly; `toast` is a companion to this
// primitive, not a standalone library).
export { toast } from "sonner";

export function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as CSSProperties
      }
      {...props}
    />
  );
}
