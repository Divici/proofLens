import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HumanOverridePanel } from "./HumanOverridePanel";
import type { FieldStatus } from "@/lib/verify/types";

const STATUSES: FieldStatus[] = [
  "pass",
  "likely-match",
  "warning",
  "fail",
  "missing",
  "low-confidence",
  "manual-review",
  "not-required",
];

describe("HumanOverridePanel", () => {
  it("renders the original AI status as a static label", () => {
    render(
      <HumanOverridePanel
        fieldLabel="Brand name"
        originalAiStatus="pass"
        reviewerName="Jane Doe"
        onSave={() => {}}
      />,
    );
    expect(screen.getByText(/AI verdict:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/pass/i).length).toBeGreaterThan(0);
  });

  it("disables save until a different status is selected", async () => {
    const user = userEvent.setup();
    render(
      <HumanOverridePanel
        fieldLabel="Brand name"
        originalAiStatus="pass"
        reviewerName="Jane Doe"
        onSave={() => {}}
      />,
    );
    const save = screen.getByRole("button", { name: /save override/i });
    expect(save).toBeDisabled();
    // Pick a different status (native select for testability).
    const statusSelect = screen.getByLabelText(/new status/i);
    await user.selectOptions(statusSelect, "fail");
    // Reason still empty, save still disabled
    expect(save).toBeDisabled();
    const reason = screen.getByLabelText(/reason for override/i);
    await user.type(reason, "Brand colour was wrong; reviewer caught it.");
    expect(save).toBeEnabled();
  });

  it("emits the override payload when save is clicked", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <HumanOverridePanel
        fieldLabel="Brand name"
        originalAiStatus="pass"
        reviewerName="Jane Doe"
        onSave={onSave}
      />,
    );
    const statusSelect = screen.getByLabelText(/new status/i);
    await user.selectOptions(statusSelect, "fail");
    const reason = screen.getByLabelText(/reason for override/i);
    await user.type(reason, "Bad colour.");
    await user.click(screen.getByRole("button", { name: /save override/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0]![0];
    expect(payload.originalAiStatus).toBe("pass");
    expect(payload.humanStatus).toBe("fail");
    expect(payload.reason).toBe("Bad colour.");
    expect(payload.reviewerName).toBe("Jane Doe");
    expect(typeof payload.timestamp).toBe("string");
    expect(new Date(payload.timestamp).getTime()).not.toBeNaN();
  });

  it("offers all 8 status options", () => {
    render(
      <HumanOverridePanel
        fieldLabel="Brand name"
        originalAiStatus="pass"
        reviewerName="Jane Doe"
        onSave={() => {}}
      />,
    );
    const select = screen.getByLabelText(/new status/i) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    for (const s of STATUSES) {
      expect(optionValues).toContain(s);
    }
  });

  it("warns when reviewer name is missing and disables save", async () => {
    const user = userEvent.setup();
    render(
      <HumanOverridePanel
        fieldLabel="Brand name"
        originalAiStatus="pass"
        reviewerName=""
        onSave={() => {}}
      />,
    );
    const select = screen.getByLabelText(/new status/i);
    await user.selectOptions(select, "fail");
    const reason = screen.getByLabelText(/reason for override/i);
    await user.type(reason, "Bad colour.");
    expect(
      screen.getByRole("button", { name: /save override/i }),
    ).toBeDisabled();
    expect(screen.getByText(/enter your name first/i)).toBeInTheDocument();
  });

  it("limits the reason to 500 chars and surfaces a counter", async () => {
    const user = userEvent.setup();
    render(
      <HumanOverridePanel
        fieldLabel="Brand name"
        originalAiStatus="pass"
        reviewerName="Jane Doe"
        onSave={() => {}}
      />,
    );
    const reason = screen.getByLabelText(/reason for override/i);
    await user.type(reason, "x");
    expect(screen.getByText(/1\s*\/\s*500/)).toBeInTheDocument();
  });

  it("shows existing override values when one is already saved", () => {
    render(
      <HumanOverridePanel
        fieldLabel="Brand name"
        originalAiStatus="pass"
        reviewerName="Jane Doe"
        existingOverride={{
          originalAiStatus: "pass",
          humanStatus: "fail",
          reason: "Bad colour.",
          timestamp: "2026-04-29T12:00:00Z",
          reviewerName: "Jane Doe",
        }}
        onSave={() => {}}
      />,
    );
    expect(screen.getByDisplayValue("Bad colour.")).toBeInTheDocument();
  });
});
