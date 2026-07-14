import type { FieldValues, UseFormSetError } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { applyFieldErrors } from "./forms";

describe("applyFieldErrors (A7)", () => {
  it("calls setError once per field with its message", () => {
    const setError = vi.fn();
    applyFieldErrors(setError as unknown as UseFormSetError<FieldValues>, {
      title: "Title is required",
      content: "Content is required",
    });
    expect(setError).toHaveBeenCalledTimes(2);
    expect(setError).toHaveBeenCalledWith("title", { message: "Title is required" });
    expect(setError).toHaveBeenCalledWith("content", { message: "Content is required" });
  });

  it("does nothing for an empty field-errors map", () => {
    const setError = vi.fn();
    applyFieldErrors(setError as unknown as UseFormSetError<FieldValues>, {});
    expect(setError).not.toHaveBeenCalled();
  });
});
