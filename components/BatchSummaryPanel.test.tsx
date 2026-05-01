/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BatchSummaryPanel } from "./BatchSummaryPanel";

describe("BatchSummaryPanel", () => {
  const summary = {
    total: 30,
    pass: 22,
    fail: 3,
    needsManualReview: 2,
    requestBetterImage: 1,
    passWithWarnings: 2,
    failures: 0,
    qualityIssues: 5,
    avgProcessingTimeMs: 4200,
    totalDurationMs: 90_000,
  };

  it("shows every PRD §9.2 counter", () => {
    render(
      <BatchSummaryPanel
        summary={summary}
        completed={28}
        total={30}
        running={false}
      />,
    );
    expect(screen.getAllByText(/total/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText(/passed/i)).toBeInTheDocument();
    expect(screen.getByText(/manual review/i)).toBeInTheDocument();
    expect(screen.getByText(/quality issues/i)).toBeInTheDocument();
    expect(screen.getByText(/avg time/i)).toBeInTheDocument();
    expect(screen.getByText(/total time/i)).toBeInTheDocument();
  });

  it("formats avg time and total time using s/min units", () => {
    render(
      <BatchSummaryPanel
        summary={summary}
        completed={28}
        total={30}
        running={false}
      />,
    );
    expect(screen.getByText(/4\.2 s/)).toBeInTheDocument();
    expect(screen.getByText(/1 min 30 s/)).toBeInTheDocument();
  });

  it("renders a progress bar with percentage when running", () => {
    render(
      <BatchSummaryPanel
        summary={summary}
        completed={15}
        total={30}
        running
      />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "15");
    expect(bar).toHaveAttribute("aria-valuemax", "30");
  });
});
