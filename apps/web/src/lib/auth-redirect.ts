// Guard against open redirects: only honor a `?redirectTo` that is a same-origin
// absolute path (a single leading "/"), never a protocol-relative ("//evil.com")
// or absolute URL. "/\" is rejected too: WHATWG URL parsing normalizes "\" to "/"
// in special URLs, so "/\evil.com" would become protocol-relative at navigation
// time. Used by the (auth) login/signup pages to send the user back to where the
// proxy bounced them from after a successful sign-in.
export function safeRedirectPath(to: string | null | undefined, fallback = "/dashboard"): string {
  if (
    typeof to === "string" &&
    to.startsWith("/") &&
    !to.startsWith("//") &&
    !to.startsWith("/\\")
  ) {
    return to;
  }
  return fallback;
}
