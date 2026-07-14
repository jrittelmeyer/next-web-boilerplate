import { describe, expect, it } from "vitest";
import { formatSseComment, formatSseEvent } from "./sse";

describe("formatSseEvent", () => {
  it("frames a named event with id, event, data and a terminating blank line", () => {
    expect(formatSseEvent({ event: "notification", data: '{"a":1}', id: "n1" })).toBe(
      'id: n1\nevent: notification\ndata: {"a":1}\n\n',
    );
  });

  it("omits the id line when no id is given", () => {
    expect(formatSseEvent({ event: "ping", data: "x" })).toBe("event: ping\ndata: x\n\n");
  });

  it("omits the event line when no event name is given (default 'message')", () => {
    expect(formatSseEvent({ data: "hello" })).toBe("data: hello\n\n");
  });

  it("splits a multi-line payload into one data: line per line", () => {
    // A raw newline in `data` would truncate the event at the first line unless split.
    expect(formatSseEvent({ data: "line1\nline2" })).toBe("data: line1\ndata: line2\n\n");
  });

  it("always terminates with a blank line", () => {
    expect(formatSseEvent({ data: "x" }).endsWith("\n\n")).toBe(true);
  });
});

describe("formatSseComment", () => {
  it("frames a comment line the EventSource parser ignores", () => {
    expect(formatSseComment("connected")).toBe(": connected\n\n");
  });

  it("frames the heartbeat ping", () => {
    expect(formatSseComment("ping")).toBe(": ping\n\n");
  });
});
