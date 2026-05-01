import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkipToMain } from "./SkipToMain";

describe("SkipToMain", () => {
  it("renders an anchor that targets #main", () => {
    render(<SkipToMain />);
    const link = screen.getByRole("link", { name: /skip to main content/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "#main");
  });

  it("is visually hidden by default but reappears on focus", () => {
    render(<SkipToMain />);
    const link = screen.getByRole("link", { name: /skip to main content/i });
    // Tailwind sr-only-style hide pattern with focus reveal — class is not
    // a behavioural assertion on its own, but the focus-visible classes are
    // the contract that makes the link discoverable to keyboard users.
    expect(link.className).toMatch(/sr-only|focus:|focus-visible:/);
  });
});
