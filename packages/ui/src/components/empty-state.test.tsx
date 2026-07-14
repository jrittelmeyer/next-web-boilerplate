import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the title as a heading and the description", () => {
    render(<EmptyState title="Page not found" description="No such page." />);
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByText("No such page.")).toBeInTheDocument();
  });

  it("renders the action node", () => {
    render(
      <EmptyState title="Something went wrong" action={<button type="button">Retry</button>} />,
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
