import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FieldRow } from "./FieldRow";
import type { FieldResult } from "@/lib/verify/types";

function makeField(overrides: Partial<FieldResult> = {}): FieldResult {
  return {
    field: "brand",
    label: "Brand name",
    status: "pass",
    value: "Old Tom Distillery",
    expected: "Old Tom Distillery",
    confidence: 0.96,
    explanation: "Value matches the expected entry exactly.",
    suggestedAction: "No action needed.",
    evidenceQuote: "OLD TOM DISTILLERY",
    bbox: null,
    outcomes: [],
    ...overrides,
  };
}

describe("FieldRow", () => {
  it("renders the field label, value, and status badge text", () => {
    render(<FieldRow result={makeField()} onSelect={() => {}} selected={false} />);
    expect(screen.getByText("Brand name")).toBeInTheDocument();
    // The value appears at least once (so does Expected for byte-equal pairs).
    expect(screen.getAllByText("Old Tom Distillery").length).toBeGreaterThan(0);
    // Field-level pass renders as "Match" per the Phase-9 design language
    // (TTB reviewers think in match/mismatch at the field level; the
    // overall pill keeps the "Pass" verb per PRD R-008).
    expect(screen.getByText(/^match$/i)).toBeInTheDocument();
  });

  it("renders distinct text + icon for fail status (never colour-only)", () => {
    render(
      <FieldRow
        result={makeField({ status: "fail" })}
        onSelect={() => {}}
        selected={false}
      />,
    );
    // Badge text — not just colour.
    expect(screen.getByText(/fail/i)).toBeInTheDocument();
    // Icon is present (rendered as an svg with a label or aria attrs).
    expect(screen.getByTestId("status-icon-fail")).toBeInTheDocument();
  });

  it("calls onSelect when the row button is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <FieldRow
        result={makeField()}
        onSelect={onSelect}
        selected={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /brand name/i }));
    expect(onSelect).toHaveBeenCalledWith("brand");
  });

  it("shows the explanation prose", () => {
    render(
      <FieldRow
        result={makeField({ explanation: "Custom rule output here." })}
        onSelect={() => {}}
        selected={false}
      />,
    );
    expect(screen.getByText(/custom rule output here/i)).toBeInTheDocument();
  });

  it("shows the evidence quote when present", () => {
    render(
      <FieldRow
        result={makeField({ evidenceQuote: "BOTTLED BY OLD TOM" })}
        onSelect={() => {}}
        selected={false}
      />,
    );
    expect(screen.getByText(/bottled by old tom/i)).toBeInTheDocument();
  });

  it("renders 'Not visible' when the value is null", () => {
    render(
      <FieldRow
        result={makeField({ value: null, status: "missing" })}
        onSelect={() => {}}
        selected={false}
      />,
    );
    expect(screen.getByText(/not visible/i)).toBeInTheDocument();
  });

  it("applies a selected state when selected=true", () => {
    render(
      <FieldRow result={makeField()} onSelect={() => {}} selected={true} />,
    );
    expect(screen.getByRole("button", { name: /brand name/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("renders the human-override badge and uses the human status when overridden", () => {
    render(
      <FieldRow
        result={makeField({
          status: "pass",
          humanOverride: {
            originalAiStatus: "pass",
            humanStatus: "fail",
            reason: "Bad colour.",
            timestamp: "2026-04-29T12:00:00Z",
            reviewerName: "Jane Doe",
          },
        })}
        onSelect={() => {}}
        selected={false}
      />,
    );
    // Human badge appears
    expect(screen.getByTestId("override-indicator")).toBeInTheDocument();
    // Status badge should now be Fail (the human verdict)
    expect(screen.getByTestId("status-icon-fail")).toBeInTheDocument();
    expect(screen.getByText(/override note/i)).toBeInTheDocument();
  });

  it("shows the inline override panel when expanded with onOverrideSave", () => {
    render(
      <FieldRow
        result={makeField()}
        onSelect={() => {}}
        selected={true}
        reviewerName="Jane Doe"
        onOverrideSave={() => {}}
      />,
    );
    expect(screen.getByTestId("human-override-panel")).toBeInTheDocument();
  });

  it("does not render the override panel when collapsed", () => {
    render(
      <FieldRow
        result={makeField()}
        onSelect={() => {}}
        selected={false}
        reviewerName="Jane Doe"
        onOverrideSave={() => {}}
      />,
    );
    expect(
      screen.queryByTestId("human-override-panel"),
    ).not.toBeInTheDocument();
  });
});
