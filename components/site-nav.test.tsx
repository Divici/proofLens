import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteNav } from "./site-nav";

describe("SiteNav", () => {
  it("renders the /queue link as a real anchor (post-Phase-9 redesign)", () => {
    render(<SiteNav />);

    const queue = screen.getByRole("link", { name: /^queue$/i });
    expect(queue).toBeInTheDocument();
    expect(queue).toHaveAttribute("href", "/queue");
    expect(queue).not.toHaveAttribute("aria-disabled", "true");
  });

  it("renders the /batch link as a real anchor", () => {
    render(<SiteNav />);
    const batch = screen.getByRole("link", { name: /^batch$/i });
    expect(batch).toBeInTheDocument();
    expect(batch).toHaveAttribute("href", "/batch");
    expect(batch).not.toHaveAttribute("aria-disabled", "true");
  });

  it("renders the /history link as a real anchor", () => {
    render(<SiteNav />);
    const history = screen.getByRole("link", { name: /^history$/i });
    expect(history).toBeInTheDocument();
    expect(history).toHaveAttribute("href", "/history");
    expect(history).not.toHaveAttribute("aria-disabled", "true");
  });

  it("renders the /settings link as a real anchor", () => {
    render(<SiteNav />);
    const settings = screen.getByRole("link", { name: /^settings$/i });
    expect(settings).toBeInTheDocument();
    expect(settings).toHaveAttribute("href", "/settings");
    expect(settings).not.toHaveAttribute("aria-disabled", "true");
  });

  it("does not expose a 'New review' nav entry — agents start from the queue", () => {
    render(<SiteNav />);
    expect(screen.queryByRole("link", { name: /new review/i })).toBeNull();
  });

  it("renders no 'Soon' pills — every nav entry is shipped", () => {
    render(<SiteNav />);
    expect(screen.queryAllByText(/^soon$/i).length).toBe(0);
  });

  it("the proofLens wordmark links back to /queue", () => {
    render(<SiteNav />);
    const wordmark = screen.getByRole("link", { name: /^prooflens$/i });
    expect(wordmark).toHaveAttribute("href", "/queue");
  });
});
