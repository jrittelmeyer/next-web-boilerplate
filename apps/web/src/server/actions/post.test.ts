import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock everything the action reaches for: Better Auth session, the DB client,
// the rate limiter, the search lib, the logger, and Next's cache/headers. The
// shared `@repo/validators` schema and `@repo/db/schema` table stay real (pure).
const {
  getSession,
  dbInsert,
  dbUpdate,
  dbDelete,
  dbSelect,
  dbTransaction,
  postsFindFirst,
  memberFindFirst,
  rateLimitMock,
  isSearchConfigured,
  getSearchClient,
  ensurePostsIndexSettings,
  updateTag,
  postsIndexSettings,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  dbDelete: vi.fn(),
  dbSelect: vi.fn(),
  dbTransaction: vi.fn(),
  postsFindFirst: vi.fn(),
  memberFindFirst: vi.fn(),
  rateLimitMock: vi.fn(),
  isSearchConfigured: vi.fn(),
  getSearchClient: vi.fn(),
  ensurePostsIndexSettings: vi.fn(),
  updateTag: vi.fn(),
  // Sentinel stand-in for the real POSTS_INDEX_SETTINGS — tests assert the action
  // passes the module's exported constant through by identity, not its contents
  // (the real values are type-checked against the SDK's Settings and live-verified).
  postsIndexSettings: { searchableAttributes: ["title", "content"] },
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@repo/db", () => ({
  db: {
    insert: dbInsert,
    update: dbUpdate,
    delete: dbDelete,
    select: dbSelect,
    // A15: create/update wrap their writes in db.transaction(cb). The mock (set in
    // beforeEach) runs the callback with a `tx` exposing the same insert/update mocks.
    transaction: dbTransaction,
    // `member.findFirst` backs the org-role read (lib/organization) the write actions
    // use to authorize an org admin/owner editing/deleting a member's org post.
    query: { posts: { findFirst: postsFindFirst }, member: { findFirst: memberFindFirst } },
  },
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: rateLimitMock }));
vi.mock("@/lib/search", () => ({
  isSearchConfigured,
  getSearchClient,
  ensurePostsIndexSettings,
  POSTS_INDEX: "posts",
  POSTS_INDEX_SETTINGS: postsIndexSettings,
}));
vi.mock("@logtail/next", () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

// The real schema tables stay unmocked (pure) — imported here so a test can route the
// mocked `tx.insert(table)` by identity (posts vs. postRevisions) for the A15 cases.
import { postRevisions } from "@repo/db/schema";
import { createPost, deletePost, reindexPosts, updatePost } from "./post";

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

// A search client whose `index(...).addDocuments(...)/deleteDocument(...)/
// updateSettings(...)` chain resolves; spies are returned so a test can assert
// what was indexed/removed and which settings were applied.
function mockSearchClientOk() {
  const waitTask = vi.fn().mockResolvedValue(undefined);
  const addDocuments = vi.fn().mockReturnValue({ waitTask });
  const deleteDocument = vi.fn().mockReturnValue({ waitTask });
  const updateSettings = vi.fn().mockReturnValue({ waitTask });
  getSearchClient.mockReturnValue({
    index: vi.fn().mockReturnValue({ addDocuments, deleteDocument, updateSettings }),
  });
  return { addDocuments, deleteDocument, updateSettings };
}

// Stub the `db.update(...).set(...).where(...).returning(...)` chain updatePost uses.
function mockUpdateReturning(rows: unknown[]) {
  dbUpdate.mockReturnValue({
    set: () => ({ where: () => ({ returning: () => Promise.resolve(rows) }) }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  rateLimitMock.mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 });
  isSearchConfigured.mockReturnValue(false);
  // A8: the write path ensures the pinned index settings once per process before the
  // first document write. Default it to a resolved no-op; specific tests override it.
  ensurePostsIndexSettings.mockResolvedValue(undefined);
  // A15: run the transaction callback with a `tx` that reuses the insert/update mocks,
  // so each test's existing dbInsert/dbUpdate setup drives the transactional path and
  // a thrown callback rejects (letting the action's catch return its typed error).
  dbTransaction.mockImplementation(async (cb) => cb({ insert: dbInsert, update: dbUpdate }));
  // Default insert chain so the in-tx revision insert doesn't crash tests that only set
  // up the primary write (create tests override dbInsert; update tests rely on this).
  dbInsert.mockReturnValue({ values: () => ({ returning: () => Promise.resolve([]) }) });
});

describe("createPost", () => {
  it("rejects an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);
    expect(await createPost(formData({ title: "T", content: "C" }))).toEqual({
      error: "Unauthorized",
    });
  });

  it("blocks when the per-user rate limit is exceeded", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    rateLimitMock.mockResolvedValue({ success: false, limit: 10, remaining: 0, reset: 0 });
    expect(await createPost(formData({ title: "T", content: "C" }))).toEqual({
      error: "Too many requests. Please wait a moment and try again.",
    });
  });

  it("returns per-field errors for invalid input (A7 — every field, not just the first)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    const r = await createPost(formData({ title: "", content: "" }));
    expect(r).toEqual({
      error: "Please fix the fields below.",
      fieldErrors: { title: "Title is required", content: "Content is required" },
    });
  });

  it("rejects a duplicate title in the workspace with a per-field error (A7)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    // A pre-existing post with the same title in the caller's workspace.
    postsFindFirst.mockResolvedValue({ id: "existing" });
    const r = await createPost(formData({ title: "Dup", content: "C" }));
    expect(r).toEqual({
      error: "You already have a post with this title.",
      fieldErrors: { title: "You already have a post with this title." },
    });
    // The write is refused before the insert.
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("returns an error when the insert yields no row", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    dbInsert.mockReturnValue({ values: () => ({ returning: () => Promise.resolve([]) }) });
    expect(await createPost(formData({ title: "T", content: "C" }))).toEqual({
      error: "Failed to create post.",
    });
  });

  it("creates the post and returns its id/title (search unconfigured)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    const created = { id: "p1", title: "T", content: "C" };
    dbInsert.mockReturnValue({ values: () => ({ returning: () => Promise.resolve([created]) }) });
    expect(await createPost(formData({ title: "T", content: "C" }))).toEqual({
      data: { id: "p1", title: "T" },
    });
    expect(getSearchClient).not.toHaveBeenCalled();
    // Busts the cached PostStats count (cacheTag("posts")) with read-your-own-writes.
    expect(updateTag).toHaveBeenCalledWith("posts");
  });

  it("indexes the new post when search is configured", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    isSearchConfigured.mockReturnValue(true);
    const created = { id: "p1", title: "T", content: "C" };
    dbInsert.mockReturnValue({ values: () => ({ returning: () => Promise.resolve([created]) }) });
    const { addDocuments } = mockSearchClientOk();
    expect(await createPost(formData({ title: "T", content: "C" }))).toEqual({
      data: { id: "p1", title: "T" },
    });
    expect(addDocuments).toHaveBeenCalledWith([created]);
    // A8: the pinned settings are ensured BEFORE the first document write, so an index
    // first created by this write is born with the right shape (not engine defaults).
    expect(ensurePostsIndexSettings).toHaveBeenCalledTimes(1);
    expect(ensurePostsIndexSettings.mock.invocationCallOrder[0]).toBeLessThan(
      addDocuments.mock.invocationCallOrder[0] as number,
    );
  });

  it("still succeeds when indexing throws (best-effort)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    isSearchConfigured.mockReturnValue(true);
    const created = { id: "p1", title: "T", content: "C" };
    dbInsert.mockReturnValue({ values: () => ({ returning: () => Promise.resolve([created]) }) });
    getSearchClient.mockReturnValue({
      index: vi.fn(() => {
        throw new Error("meili down");
      }),
    });
    expect(await createPost(formData({ title: "T", content: "C" }))).toEqual({
      data: { id: "p1", title: "T" },
    });
  });

  it("still succeeds when ensuring index settings throws, without indexing (A8 best-effort)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    isSearchConfigured.mockReturnValue(true);
    const created = { id: "p1", title: "T", content: "C" };
    dbInsert.mockReturnValue({ values: () => ({ returning: () => Promise.resolve([created]) }) });
    ensurePostsIndexSettings.mockRejectedValue(new Error("settings down"));
    const { addDocuments } = mockSearchClientOk();
    // A settings outage is swallowed like any index failure — the DB write still returns
    // data — and the document write is skipped (the shared try/catch short-circuits).
    expect(await createPost(formData({ title: "T", content: "C" }))).toEqual({
      data: { id: "p1", title: "T" },
    });
    expect(addDocuments).not.toHaveBeenCalled();
  });

  it("stamps the caller's active organization on the new post", async () => {
    // Authoritative active-org read (disableCookieCache) resolves via the same getSession mock.
    getSession.mockResolvedValue({ user: { id: "u1" }, session: { activeOrganizationId: "org1" } });
    const values = vi.fn().mockReturnValue({
      returning: () => Promise.resolve([{ id: "p1", title: "T", content: "C" }]),
    });
    dbInsert.mockReturnValue({ values });
    await createPost(formData({ title: "T", content: "C" }));
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: "u1", organizationId: "org1" }),
    );
  });

  it("stamps organization_id NULL (personal workspace) when there is no active org", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" }, session: { activeOrganizationId: null } });
    const values = vi.fn().mockReturnValue({
      returning: () => Promise.resolve([{ id: "p1", title: "T", content: "C" }]),
    });
    dbInsert.mockReturnValue({ values });
    await createPost(formData({ title: "T", content: "C" }));
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null }));
  });

  it("writes the post and its first revision in one transaction (A15)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    const revisionValues = vi.fn().mockReturnValue({ returning: () => Promise.resolve([]) });
    // Route the two in-tx inserts by table: posts returns the created row, post_revisions
    // captures its values.
    dbInsert.mockImplementation((table) =>
      table === postRevisions
        ? { values: revisionValues }
        : {
            values: () => ({
              returning: () => Promise.resolve([{ id: "p1", title: "T", content: "C" }]),
            }),
          },
    );
    expect(await createPost(formData({ title: "T", content: "C" }))).toEqual({
      data: { id: "p1", title: "T" },
    });
    // The dependent write records the just-created post's id + content as revision #1.
    expect(revisionValues).toHaveBeenCalledWith(
      expect.objectContaining({ postId: "p1", authorId: "u1", title: "T", content: "C" }),
    );
  });

  it("aborts the create without indexing when the revision write fails (A15 rollback)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    isSearchConfigured.mockReturnValue(true);
    const { addDocuments } = mockSearchClientOk();
    dbInsert.mockImplementation((table) =>
      table === postRevisions
        ? {
            values: () => {
              throw new Error("revision insert failed");
            },
          }
        : {
            values: () => ({
              returning: () => Promise.resolve([{ id: "p1", title: "T", content: "C" }]),
            }),
          },
    );
    // The thrown revision write rejects the transaction → the action returns its typed
    // error and nothing is indexed. (The real DB rollback is proven against Postgres in
    // the @repo/db integration lane — a mock can't roll back mock state.)
    expect(await createPost(formData({ title: "T", content: "C" }))).toEqual({
      error: "Failed to create post.",
    });
    expect(addDocuments).not.toHaveBeenCalled();
  });
});

describe("updatePost", () => {
  const validInput = { id: "p1", title: "New title", content: "New content" };

  it("rejects an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);
    expect(await updatePost(formData(validInput))).toEqual({ error: "Unauthorized" });
  });

  it("blocks when the per-user rate limit is exceeded", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    rateLimitMock.mockResolvedValue({ success: false, limit: 10, remaining: 0, reset: 0 });
    expect(await updatePost(formData(validInput))).toEqual({
      error: "Too many requests. Please wait a moment and try again.",
    });
  });

  it("maps a validation failure to per-field errors, every field (A7)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    const r = await updatePost(formData({ id: "p1", title: "", content: "" }));
    expect(r).toEqual({
      error: "Please fix the fields below.",
      fieldErrors: { title: "Title is required", content: "Content is required" },
    });
  });

  it("maps a single failing field without dragging the others in (A7)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    const r = await updatePost(formData({ id: "p1", title: "", content: "C" }));
    expect(r).toEqual({
      error: "Please fix the fields below.",
      fieldErrors: { title: "Title is required" },
    });
  });

  it("returns not-found when the post is missing", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    postsFindFirst.mockResolvedValue(undefined);
    expect(await updatePost(formData(validInput))).toEqual({ error: "Post not found" });
  });

  it("forbids editing another author's personal post (no org-role read)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    postsFindFirst.mockResolvedValue({ id: "p1", authorId: "someone-else", organizationId: null });
    expect(await updatePost(formData(validInput))).toEqual({ error: "Forbidden" });
    // A personal post (organization_id NULL) is author-only — no membership lookup.
    expect(memberFindFirst).not.toHaveBeenCalled();
  });

  it("lets an org admin/owner edit another member's org post", async () => {
    getSession.mockResolvedValue({ user: { id: "admin1" } });
    postsFindFirst.mockResolvedValue({ id: "p1", authorId: "author1", organizationId: "org1" });
    memberFindFirst.mockResolvedValue({ role: "admin" });
    mockUpdateReturning([{ id: "p1", title: "New title", content: "New content" }]);
    expect(await updatePost(formData(validInput))).toEqual({
      data: { id: "p1", title: "New title" },
    });
  });

  it("forbids a plain member editing another author's org post", async () => {
    getSession.mockResolvedValue({ user: { id: "member1" } });
    postsFindFirst.mockResolvedValue({ id: "p1", authorId: "author1", organizationId: "org1" });
    memberFindFirst.mockResolvedValue({ role: "member" });
    expect(await updatePost(formData(validInput))).toEqual({ error: "Forbidden" });
  });

  it("returns an error when the update yields no row", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    postsFindFirst.mockResolvedValue({ id: "p1", authorId: "u1" });
    mockUpdateReturning([]);
    expect(await updatePost(formData(validInput))).toEqual({ error: "Failed to update post." });
  });

  it("updates the author's own post and returns its id/title (search unconfigured)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    postsFindFirst.mockResolvedValue({ id: "p1", authorId: "u1" });
    mockUpdateReturning([{ id: "p1", title: "New title", content: "New content" }]);
    expect(await updatePost(formData(validInput))).toEqual({
      data: { id: "p1", title: "New title" },
    });
    expect(getSearchClient).not.toHaveBeenCalled();
  });

  it("re-indexes the updated post when search is configured", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    postsFindFirst.mockResolvedValue({ id: "p1", authorId: "u1" });
    const updated = { id: "p1", title: "New title", content: "New content" };
    mockUpdateReturning([updated]);
    isSearchConfigured.mockReturnValue(true);
    const { addDocuments } = mockSearchClientOk();
    expect(await updatePost(formData(validInput))).toEqual({
      data: { id: "p1", title: "New title" },
    });
    expect(addDocuments).toHaveBeenCalledWith([updated]);
    // Both write paths flow through indexPost, so update also ensures the settings first.
    expect(ensurePostsIndexSettings.mock.invocationCallOrder[0]).toBeLessThan(
      addDocuments.mock.invocationCallOrder[0] as number,
    );
  });

  it("records a new revision in the same transaction as the update (A15)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    postsFindFirst.mockResolvedValue({ id: "p1", authorId: "u1" });
    mockUpdateReturning([{ id: "p1", title: "New title", content: "New content" }]);
    const revisionValues = vi.fn().mockReturnValue({ returning: () => Promise.resolve([]) });
    dbInsert.mockImplementation((table) =>
      table === postRevisions
        ? { values: revisionValues }
        : { values: () => ({ returning: () => Promise.resolve([]) }) },
    );
    expect(await updatePost(formData(validInput))).toEqual({
      data: { id: "p1", title: "New title" },
    });
    // The edit's new version is appended as a revision inside the same atomic unit.
    expect(revisionValues).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: "p1",
        authorId: "u1",
        title: "New title",
        content: "New content",
      }),
    );
  });
});

describe("deletePost", () => {
  it("rejects an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);
    expect(await deletePost("p1")).toEqual({ error: "Unauthorized" });
  });

  it("returns not-found when the post is missing", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    postsFindFirst.mockResolvedValue(undefined);
    expect(await deletePost("p1")).toEqual({ error: "Post not found" });
  });

  it("forbids deleting another author's personal post (no org-role read)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    postsFindFirst.mockResolvedValue({ id: "p1", authorId: "someone-else", organizationId: null });
    expect(await deletePost("p1")).toEqual({ error: "Forbidden" });
    expect(memberFindFirst).not.toHaveBeenCalled();
  });

  it("lets an org owner/admin delete another member's org post", async () => {
    getSession.mockResolvedValue({ user: { id: "owner1" } });
    postsFindFirst.mockResolvedValue({ id: "p1", authorId: "author1", organizationId: "org1" });
    memberFindFirst.mockResolvedValue({ role: "owner" });
    dbDelete.mockReturnValue({ where: () => Promise.resolve() });
    expect(await deletePost("p1")).toEqual({ data: { id: "p1" } });
  });

  it("forbids a plain member deleting another author's org post", async () => {
    getSession.mockResolvedValue({ user: { id: "member1" } });
    postsFindFirst.mockResolvedValue({ id: "p1", authorId: "author1", organizationId: "org1" });
    memberFindFirst.mockResolvedValue({ role: "member" });
    expect(await deletePost("p1")).toEqual({ error: "Forbidden" });
  });

  it("deletes the author's own post (search unconfigured)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    postsFindFirst.mockResolvedValue({ id: "p1", authorId: "u1" });
    dbDelete.mockReturnValue({ where: () => Promise.resolve() });
    expect(await deletePost("p1")).toEqual({ data: { id: "p1" } });
  });

  it("removes the search document when configured", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    postsFindFirst.mockResolvedValue({ id: "p1", authorId: "u1" });
    dbDelete.mockReturnValue({ where: () => Promise.resolve() });
    isSearchConfigured.mockReturnValue(true);
    const { deleteDocument } = mockSearchClientOk();
    expect(await deletePost("p1")).toEqual({ data: { id: "p1" } });
    expect(deleteDocument).toHaveBeenCalledWith("p1");
  });

  it("still deletes when de-indexing throws (best-effort)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    postsFindFirst.mockResolvedValue({ id: "p1", authorId: "u1" });
    dbDelete.mockReturnValue({ where: () => Promise.resolve() });
    isSearchConfigured.mockReturnValue(true);
    getSearchClient.mockReturnValue({
      index: vi.fn(() => {
        throw new Error("meili down");
      }),
    });
    expect(await deletePost("p1")).toEqual({ data: { id: "p1" } });
  });
});

describe("reindexPosts", () => {
  it("rejects an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);
    expect(await reindexPosts()).toEqual({ error: "Unauthorized" });
  });

  it("blocks when the per-user rate limit is exceeded", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    rateLimitMock.mockResolvedValue({ success: false, limit: 3, remaining: 0, reset: 0 });
    expect(await reindexPosts()).toEqual({
      error: "Too many requests. Please wait a moment and try again.",
    });
    // Reindex gets its own (tighter) bucket — never shared with create/update.
    expect(rateLimitMock).toHaveBeenCalledWith("post:reindex:u1", { limit: 3, windowSec: 60 });
  });

  it("returns an error when search is not configured", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    isSearchConfigured.mockReturnValue(false);
    expect(await reindexPosts()).toEqual({ error: "Search is not configured" });
  });

  it("applies the pinned index settings, then indexes all rows", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    isSearchConfigured.mockReturnValue(true);
    dbSelect.mockReturnValue({
      from: () => Promise.resolve([{ id: "p1", title: "T", content: "C" }]),
    });
    const { addDocuments, updateSettings } = mockSearchClientOk();
    expect(await reindexPosts()).toEqual({ data: { indexed: 1 } });
    // The exported constant is passed through by identity (its contents are
    // type-checked against the SDK's Settings type in lib/search.ts).
    expect(updateSettings).toHaveBeenCalledWith(postsIndexSettings);
    expect(addDocuments).toHaveBeenCalled();
    // Settings land before documents, so the first write into a fresh index
    // already happens under the pinned shape.
    expect(updateSettings.mock.invocationCallOrder[0]).toBeLessThan(
      addDocuments.mock.invocationCallOrder[0] as number,
    );
  });

  it("returns indexed: 0 (but still pins settings) when there are no posts", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    isSearchConfigured.mockReturnValue(true);
    dbSelect.mockReturnValue({ from: () => Promise.resolve([]) });
    const { addDocuments, updateSettings } = mockSearchClientOk();
    expect(await reindexPosts()).toEqual({ data: { indexed: 0 } });
    expect(updateSettings).toHaveBeenCalledWith(postsIndexSettings);
    expect(addDocuments).not.toHaveBeenCalled();
  });

  it("returns an error when the settings update fails", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    isSearchConfigured.mockReturnValue(true);
    dbSelect.mockReturnValue({
      from: () => Promise.resolve([{ id: "p1", title: "T", content: "C" }]),
    });
    const { addDocuments, updateSettings } = mockSearchClientOk();
    updateSettings.mockReturnValue({
      waitTask: vi.fn().mockRejectedValue(new Error("settings boom")),
    });
    expect(await reindexPosts()).toEqual({ error: "settings boom" });
    expect(addDocuments).not.toHaveBeenCalled();
  });

  it("returns an error message when reindexing throws", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    isSearchConfigured.mockReturnValue(true);
    dbSelect.mockReturnValue({ from: () => Promise.reject(new Error("db boom")) });
    expect(await reindexPosts()).toEqual({ error: "db boom" });
  });
});
