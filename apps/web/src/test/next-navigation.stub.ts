// Test stub for `next/navigation`. lib/i18n-metadata.ts imports @/i18n/navigation,
// whose next-intl createNavigation (react-client build, the one the node vitest env
// resolves) imports { useRouter, usePathname } and its shared module imports
// { redirect, permanentRedirect } from `next/navigation` AT MODULE LOAD. The unit
// tests only exercise the PURE getPathname, never these — but ESM still link-checks
// the named imports, and the real module needs the Next runtime. These no-ops let
// the module graph load under the node (non-Next) env. Mirrors the server-only /
// @/env stubs already wired in vitest.config.ts.

export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  };
}

export function usePathname() {
  return "/";
}

export function redirect(): never {
  throw new Error("redirect() is not available in the vitest next/navigation stub");
}

export function permanentRedirect(): never {
  throw new Error("permanentRedirect() is not available in the vitest next/navigation stub");
}
