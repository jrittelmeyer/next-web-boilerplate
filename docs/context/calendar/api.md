# Calendar — reads and writes

Load when adding or changing a calendar endpoint. The domain model (civil vs instant,
the derived-instant guard, the constraints) is
[model.md](model.md); who may do what is [acl.md](acl.md).

Follows the repo-wide split ([API.md](../API.md)): **reads are tRPC procedures**,
**writes are Server Actions**. Nothing calendar-related is public — `/calendar` is in
`PROTECTED_PREFIXES` and `proxy.ts` matches it with `startsWith`.

## Writes — `apps/web/src/server/actions/calendar.ts`

`createCalendar` · `updateCalendar` · `deleteCalendar` · `createEvent` · `updateEvent` ·
`deleteEvent`. Every one returns `ActionResult<T>` and runs the same six steps **in this
order**:

1. **Session gate** → `{ error: "Unauthorized" }`.
2. **`rateLimit`** per user (10/min for calendars, 20/min for events) → the typed
   too-many-requests error, since a Server Action cannot set a 429 status.
3. **Schema parse** with `@repo/validators/calendar`; failures become a `fieldErrors`
   map via `zodFieldErrors` so the form marks each input.
4. **`getCalendarRole`** authorization.
5. **`deriveEventInstants`** — the only writer of `start_at` / `end_at` /
   `*_offset_minutes` anywhere in the codebase.
6. **Write**, then `revalidatePath`.

The order is load-bearing. Authorizing before parsing would tell a caller sending
garbage whether a calendar id exists; deriving before authorizing would spend zone
maths on a request about to be refused.

### Errors a form can act on

| Failure | Surfaces as |
| --- | --- |
| Zod issue | `fieldErrors[field]`, inline |
| Zone the runtime doesn't know | `fieldErrors.startTzid` / `.endTzid` — checked with `canonicalizeTimeZone`, which the Zod grammar cannot do |
| Impossible civil reading (Feb 30) | `fieldErrors.startWall` / `.endWall` — `parseLocalDateTime` throws; the action attributes it |
| End before start, or a span over 366 days | `fieldErrors.endWall`, compared on **instants** |
| SQLSTATE `23514` / `22023` | One form-level message; logged with the constraint name |

`deriveEventInstants` throws one `RangeError` for four different bad inputs, so the
action pre-checks each input separately to attribute the failure. Drizzle puts the
violated constraint on **`error.cause.constraint`**, not in the message — a
`toThrow(/name/)` assertion would pass for any constraint at all.

### Two write rules that are not obvious

- **`uid` and `sequence` are never written by `updateEvent`.** The UID is immutable
  (Phase 6 subscribers identify an event by it — changing it reads as
  delete-and-recreate), and `SEQUENCE` is bumped only on a *significant* change, which
  Phase 4 defines. Bumping it on a description edit would re-prompt every attendee.
- **`deleteEvent` stamps `deleted_at` and nothing else.** It deliberately does not set
  `status = 'cancelled'`: deletion is one fact in one column, Phase 4 derives
  `STATUS:CANCELLED` from it at emission time, and the Phase-6 upsert resurrects
  soft-deleted rows — at which point an overwritten status would be unrecoverable.

`deleteCalendar`, by contrast, is a **hard** delete. Events cascade. A soft-deleted
calendar would leave its events reachable by id while invisible in every list, which is
a worse state than gone; and nobody subscribes to a calendar that no longer exists.

## Reads — `apps/web/src/server/trpc/routers/calendar.ts`

All three are `userRateLimitedProcedure`: authenticated, but a window query over twenty
calendars is expensive enough to want a per-account bucket rather than a per-IP one.

| Procedure | Reads | Notes |
| --- | --- | --- |
| `calendar.list` | `calendars` | Owner-scoped, primary first. Phase 6 widens the scope behind `lib/calendar-acl`. |
| `calendar.range` | **`calendar_events` directly** | The documented exception — see below. |
| `calendar.byId` | `calendar_event_masters` | The rule. The view already excludes soft-deleted rows and overrides. |

### `calendar.range`

Caps, all enforced in the schema so a hostile caller cannot widen them: **≤20
calendars**, a **≤400-day** window, and a hard **2,000-row** limit. The query fetches
`cap + 1` rows as a probe and returns `{ truncated: true }` when the extra row comes
back. The UI **must** render that flag — a month that silently loses its 2,001st event
is precisely the failure the cap would otherwise introduce.

It reads the raw table and spells out `rrule IS NULL AND deleted_at IS NULL` rather than
going through the masters view. Both halves of the reason are measured; see
[model.md → The read surface is split](model.md#the-read-surface-is-split). An
`EXPLAIN (FORMAT JSON)` assertion in `packages/db/__tests__/integration/` pins the index
choice, because nothing else catches a regression here before Phase 2 makes it wrong as
well as slow.

The window also carries a redundant lower bound, `start_at >= from - 367 days`, which is
what lets Postgres range-scan `start_at` instead of scanning open-ended. **367, not
366**: `calendar_events_span_bounded` measures elapsed time (`end_at - start_at`), so a
366-day span crossing a DST transition is 366 days ± 1 hour, and a 366-day bound would
drop it.

Access is enforced by scoping to calendars the caller owns — one `IN` list against an
indexed `user_id` — rather than by asking the ACL per calendar. An id the caller cannot
see simply contributes nothing.

## The client boundary

`monthGridWindowMs` in `apps/web/src/lib/calendar/grid.ts` computes the window, padded a
day either side **in the viewer's zone**: the first cell's midnight in Tokyo is the
previous afternoon in UTC, so naive UTC bounds clip the corners of the grid.

The month view fetches from the client rather than being SSR-seeded, because the month
changes without a navigation. Editing an event loads it through `calendar.byId` rather
than reusing the grid row — `calendar.range` deliberately omits `description` and `url`,
so seeding the composer from a grid row would submit `null` for both and erase them.
