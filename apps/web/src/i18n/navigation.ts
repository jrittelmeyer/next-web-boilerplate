import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware replacements for next/link + next/navigation. Using these instead
// of the framework primitives keeps the active locale sticky across client
// navigation (a plain <Link href="/dashboard"> from an `/es` page would drop back
// to the default locale). Import { Link, redirect, usePathname, useRouter,
// getPathname } from "@/i18n/navigation" throughout the app.
/** @public — the canonical next-intl nav set; `redirect` is API surface ahead of first in-app use. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
