import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  it("renders the accessible trigger button", () => {
    // Wrapped in the provider so useTheme() has context; we assert on the
    // closed-state trigger (the dropdown items render in a portal on open,
    // which is exercised live via Playwright rather than in jsdom).
    render(
      <ThemeProvider attribute="class">
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
  });
});
