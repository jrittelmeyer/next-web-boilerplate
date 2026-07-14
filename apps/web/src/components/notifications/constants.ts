// Shared by the RSC prefetch (app/[locale]/(dashboard)/notifications/page.tsx) and the
// client feed's tRPC query. They MUST pass the same limit or their query keys differ and
// the server prefetch won't hydrate the client cache (the POSTS_PAGE_SIZE precedent). A
// plain module (no `server-only`) so both the server and client sides can import it.
export const NOTIFICATIONS_PAGE_SIZE = 20;
