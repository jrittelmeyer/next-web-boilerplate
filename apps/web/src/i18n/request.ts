import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

// Per-request i18n config, wired into Next via createNextIntlPlugin in
// next.config.ts. `requestLocale` is the segment resolved by the [locale] route
// (validated against the allowlist so a bogus /xx falls back to the default
// rather than erroring). Messages are code-split per locale via dynamic import,
// so only the active locale's catalog ships.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Named value formats, inherited app-wide (the bare <NextIntlClientProvider>
    // auto-picks them up from here), so `format.dateTime(d, "short")` renders the
    // same on the server and the client. `short` ≈ the old `toLocaleString()`
    // (date + time). See docs/context/I18N.md → Formatting dates, numbers & currency.
    formats: {
      dateTime: { short: { dateStyle: "medium", timeStyle: "short" } },
    },
    // A global default timeZone is REQUIRED for absolute times: without it a date
    // SSRs in the server's zone but hydrates in the user's → markup mismatch (and a
    // dev ENVIRONMENT_FALLBACK warning). UTC is deterministic and matches the
    // /admin/audit convention. A real app that wants the user's local time should
    // override this per request (e.g. from a saved profile/`Intl` preference). Add
    // a global `now` here too once a `relativeTime` consumer lands (same class of
    // fix — none server-renders one yet).
    timeZone: "UTC",
  };
});
