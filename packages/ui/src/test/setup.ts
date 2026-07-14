// Registers @testing-library/jest-dom matchers (e.g. toBeInTheDocument,
// toHaveAttribute) on Vitest's expect, and augments the matcher types globally.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Unmount + clear the DOM after each test. Testing Library's auto-cleanup only
// registers when Vitest `globals` is on (this config uses explicit imports), so we
// wire it here — otherwise renders accumulate across a file and queries that share
// an accessible name match multiple elements.
afterEach(cleanup);

// jsdom does not implement matchMedia. next-themes calls it (with enableSystem)
// to read the OS color-scheme preference, so stub a minimal no-match version for
// any component test that mounts ThemeProvider/ThemeToggle.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
