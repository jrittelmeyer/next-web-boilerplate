import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("renders a textbox carrying the data-slot marker", () => {
    render(<Textarea aria-label="Bio" />);
    const textarea = screen.getByRole("textbox", { name: "Bio" });
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute("data-slot", "textarea");
  });

  it("merges a caller-supplied className with the base classes", () => {
    render(<Textarea aria-label="Bio" className="custom-class" />);
    expect(screen.getByRole("textbox", { name: "Bio" })).toHaveClass("custom-class");
  });

  it("forwards native textarea props", () => {
    render(<Textarea aria-label="Bio" rows={4} placeholder="Write…" />);
    const textarea = screen.getByRole("textbox", { name: "Bio" });
    expect(textarea).toHaveAttribute("rows", "4");
    expect(textarea).toHaveAttribute("placeholder", "Write…");
  });
});
