import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders its children as a button", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("reflects the variant via the data-variant attribute", () => {
    render(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByRole("button", { name: "Secondary" })).toHaveAttribute(
      "data-variant",
      "secondary",
    );
  });

  it("renders as a child element when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/home">Home</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Home" });
    expect(link).toHaveAttribute("href", "/home");
    expect(link).toHaveAttribute("data-slot", "button");
  });
});
