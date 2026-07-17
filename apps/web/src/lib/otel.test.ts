import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOtelSpanProcessors } from "./otel";

describe("buildOtelSpanProcessors", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns no processors when OTEL_EXPORTER_OTLP_ENDPOINT is unset", () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", undefined);
    expect(buildOtelSpanProcessors()).toEqual([]);
  });

  // dotenv-loaded blanks (`VAR=""`) must behave like unset — the same falsy
  // convention every other env gate in the repo uses (isEmailConfigured, DSN).
  it("returns no processors when the endpoint is an empty string", () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    expect(buildOtelSpanProcessors()).toEqual([]);
  });

  it("returns exactly one BatchSpanProcessor when the endpoint is set", () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318");
    const processors = buildOtelSpanProcessors();
    expect(processors).toHaveLength(1);
    expect(processors[0]).toBeInstanceOf(BatchSpanProcessor);
  });
});
