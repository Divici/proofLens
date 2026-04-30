import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteNav } from "./site-nav";

describe("SiteNav", () => {
  it("renders the active /review link as a real anchor", () => {
    render(<SiteNav />);

    const review = screen.getByRole("link", { name: /new review/i });
    expect(review).toBeInTheDocument();
    expect(review).toHaveAttribute("href", "/review");
    expect(review).not.toHaveAttribute("aria-disabled", "true");
  });

  it("marks unshipped /batch and /history routes as coming-soon and non-actionable", () => {
    render(<SiteNav />);

    // Both labels are rendered (so users see what's coming)…
    expect(screen.getByText(/batch/i)).toBeInTheDocument();
    expect(screen.getByText(/history/i)).toBeInTheDocument();

    // …but neither is rendered as a real anchor — they are non-anchor
    // placeholders with role="link" + aria-disabled (so AT announces state).
    const batchPlaceholder = screen.getByTestId("nav-disabled-batch");
    const historyPlaceholder = screen.getByTestId("nav-disabled-history");

    for (const node of [batchPlaceholder, historyPlaceholder]) {
      expect(node).toHaveAttribute("aria-disabled", "true");
      expect(node).toHaveAttribute("tabIndex", "-1");
      expect(node).toHaveAttribute("title", "Coming soon");
      // Crucially, the placeholder is NOT a real <a> with an href the
      // browser would follow — only real Links have an `href`.
      expect(node.tagName).not.toBe("A");
      expect(node).not.toHaveAttribute("href");
    }
  });

  it("includes a 'Soon' pill on disabled nav items", () => {
    render(<SiteNav />);
    const pills = screen.getAllByText(/^soon$/i);
    expect(pills.length).toBeGreaterThanOrEqual(2);
  });
});
