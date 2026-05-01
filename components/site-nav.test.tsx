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

  it("renders the /batch link as a real anchor (slice 0007)", () => {
    render(<SiteNav />);
    const batch = screen.getByRole("link", { name: /^batch$/i });
    expect(batch).toBeInTheDocument();
    expect(batch).toHaveAttribute("href", "/batch");
    expect(batch).not.toHaveAttribute("aria-disabled", "true");
  });

  it("does not render any 'Soon' pill once /batch ships", () => {
    render(<SiteNav />);
    expect(screen.queryAllByText(/^soon$/i).length).toBe(0);
  });

  it("renders the /settings link as a real anchor (slice 0009)", () => {
    render(<SiteNav />);
    const settings = screen.getByRole("link", { name: /^settings$/i });
    expect(settings).toBeInTheDocument();
    expect(settings).toHaveAttribute("href", "/settings");
    expect(settings).not.toHaveAttribute("aria-disabled", "true");
  });
});
