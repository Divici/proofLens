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

  it("renders the /history link as a real anchor (slice 0005)", () => {
    render(<SiteNav />);
    const history = screen.getByRole("link", { name: /history/i });
    expect(history).toBeInTheDocument();
    expect(history).toHaveAttribute("href", "/history");
    expect(history).not.toHaveAttribute("aria-disabled", "true");
  });

  it("marks unshipped /batch route as coming-soon and non-actionable", () => {
    render(<SiteNav />);

    // The label is rendered (so users see what's coming)…
    expect(screen.getByText(/batch/i)).toBeInTheDocument();

    // …but it is not rendered as a real anchor — it is a non-anchor
    // placeholder with role="link" + aria-disabled (so AT announces state).
    const batchPlaceholder = screen.getByTestId("nav-disabled-batch");
    expect(batchPlaceholder).toHaveAttribute("aria-disabled", "true");
    expect(batchPlaceholder).toHaveAttribute("tabIndex", "-1");
    expect(batchPlaceholder).toHaveAttribute("title", "Coming soon");
    expect(batchPlaceholder.tagName).not.toBe("A");
    expect(batchPlaceholder).not.toHaveAttribute("href");
  });

  it("includes a 'Soon' pill on disabled nav items", () => {
    render(<SiteNav />);
    const pills = screen.getAllByText(/^soon$/i);
    expect(pills.length).toBeGreaterThanOrEqual(1);
  });
});
