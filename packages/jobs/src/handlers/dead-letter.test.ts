import type { JobWithMetadata } from "pg-boss";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { init, captureMessage } = vi.hoisted(() => ({
  init: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock("@sentry/node", () => ({ init, captureMessage }));

// A dead-lettered job as pg-boss delivers it with includeMetadata: the ORIGINAL
// payload in `data`, the final failure in `output` (the source queue name is not
// carried — the job's own name is the DLQ's).
const job = {
  id: "8f14e45f-ceea-4e17-9d4b-3a1c8e2f5b6a",
  name: "failed-jobs",
  data: { to: "a@b.com" },
  output: { message: "handler boom" },
} as unknown as JobWithMetadata<unknown>;

// The handler memoizes Sentry init in module state, so each test imports a
// FRESH copy after stubbing the env it should observe.
async function importFreshHandler() {
  vi.resetModules();
  return (await import("./dead-letter")).handleDeadLetteredJob;
}

describe("handleDeadLetteredJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("always logs id + payload + failure output to console", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handle = await importFreshHandler();
    handle(job);
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining(job.id),
      JSON.stringify({ data: job.data, output: job.output }),
    );
  });

  it("skips Sentry entirely when the DSN is unset (graceful degradation)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handle = await importFreshHandler();
    handle(job);
    expect(init).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("captures to Sentry when the DSN is set — init exactly once across jobs", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o0.ingest.sentry.io/0");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handle = await importFreshHandler();
    handle(job);
    handle(job);
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith({ dsn: "https://key@o0.ingest.sentry.io/0" });
    expect(captureMessage).toHaveBeenCalledTimes(2);
    expect(captureMessage).toHaveBeenCalledWith("Background job dead-lettered", {
      level: "error",
      extra: { jobId: job.id, data: job.data, output: job.output },
    });
  });
});
