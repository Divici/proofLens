import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProviderStatusList } from "./ProviderStatusList";

describe("ProviderStatusList", () => {
  it("lists all three providers with their reachability indicators", () => {
    render(
      <ProviderStatusList
        status={{ openrouter: "reachable", tesseract: "reachable", langfuse: "eval-only" }}
      />,
    );
    expect(screen.getByText(/openrouter/i)).toBeInTheDocument();
    expect(screen.getByText(/tesseract/i)).toBeInTheDocument();
    expect(screen.getByText(/langfuse/i)).toBeInTheDocument();
  });

  it("shows a 'Reachable' indicator with text + icon for reachable providers", () => {
    render(
      <ProviderStatusList
        status={{ openrouter: "reachable", tesseract: "reachable", langfuse: "eval-only" }}
      />,
    );
    // OpenRouter row should announce the reachable status as text (not just colour).
    const row = screen.getByTestId("provider-row-openrouter");
    expect(row).toHaveTextContent(/reachable/i);
    expect(row.querySelector("[data-testid='status-icon']")).not.toBeNull();
  });

  it("shows an 'Unreachable' label for unreachable providers (color + icon + text)", () => {
    render(
      <ProviderStatusList
        status={{ openrouter: "unreachable", tesseract: "reachable", langfuse: "eval-only" }}
      />,
    );
    const row = screen.getByTestId("provider-row-openrouter");
    expect(row).toHaveTextContent(/unreachable/i);
  });

  it("shows a 'Loading' shimmer when status is null (initial fetch in flight)", () => {
    render(<ProviderStatusList status={null} />);
    expect(screen.getAllByText(/checking/i).length).toBeGreaterThanOrEqual(1);
  });
});
