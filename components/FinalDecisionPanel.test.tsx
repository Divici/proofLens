import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FinalDecisionPanel } from "./FinalDecisionPanel";

describe("FinalDecisionPanel", () => {
  it("requires both a reviewer name and a decision before save is enabled", async () => {
    const user = userEvent.setup();
    render(
      <FinalDecisionPanel
        defaultReviewerName=""
        onSave={() => {}}
      />,
    );
    const save = screen.getByRole("button", { name: /save review/i });
    expect(save).toBeDisabled();
    // Pick a decision but no name -> still disabled
    const approved = screen.getByRole("radio", { name: /approve/i });
    await user.click(approved);
    expect(save).toBeDisabled();
    // Add the name -> enabled
    const name = screen.getByLabelText(/your name/i);
    await user.type(name, "Jane Doe");
    expect(save).toBeEnabled();
  });

  it("offers all four decisions", () => {
    render(
      <FinalDecisionPanel
        defaultReviewerName=""
        onSave={() => {}}
      />,
    );
    expect(screen.getByRole("radio", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /reject/i })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /needs manual review/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /request better image/i }),
    ).toBeInTheDocument();
  });

  it("emits the full decision payload when save is clicked", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <FinalDecisionPanel
        defaultReviewerName="Jane Doe"
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("radio", { name: /approve/i }));
    const notes = screen.getByLabelText(/notes/i);
    await user.type(notes, "All checks passed.");
    await user.click(screen.getByRole("button", { name: /save review/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0]![0];
    expect(payload.decision).toBe("approved");
    expect(payload.notes).toBe("All checks passed.");
    expect(payload.reviewerName).toBe("Jane Doe");
    expect(typeof payload.timestamp).toBe("string");
  });

  it("enforces 1000-char notes maximum and shows a counter", async () => {
    const user = userEvent.setup();
    render(
      <FinalDecisionPanel
        defaultReviewerName=""
        onSave={() => {}}
      />,
    );
    const notes = screen.getByLabelText(/notes/i);
    await user.type(notes, "abc");
    expect(screen.getByText(/3\s*\/\s*1000/)).toBeInTheDocument();
  });

  it("pre-fills the reviewer name from defaultReviewerName", () => {
    render(
      <FinalDecisionPanel
        defaultReviewerName="Persisted Name"
        onSave={() => {}}
      />,
    );
    expect(screen.getByDisplayValue("Persisted Name")).toBeInTheDocument();
  });

  it("emits onReviewerNameChange when the user edits the name", async () => {
    const user = userEvent.setup();
    const onReviewerNameChange = vi.fn();
    render(
      <FinalDecisionPanel
        defaultReviewerName=""
        onSave={() => {}}
        onReviewerNameChange={onReviewerNameChange}
      />,
    );
    const name = screen.getByLabelText(/your name/i);
    await user.type(name, "J");
    expect(onReviewerNameChange).toHaveBeenLastCalledWith("J");
  });

  it("renders an existing-decision summary when one is provided", () => {
    render(
      <FinalDecisionPanel
        defaultReviewerName="Jane Doe"
        existingDecision={{
          decision: "rejected",
          notes: "Bad colour.",
          reviewerName: "Jane Doe",
          timestamp: "2026-04-29T12:00:00Z",
        }}
        onSave={() => {}}
      />,
    );
    const reject = screen.getByRole("radio", {
      name: /reject/i,
    }) as HTMLInputElement;
    expect(reject.checked).toBe(true);
    expect(screen.getByDisplayValue("Bad colour.")).toBeInTheDocument();
  });
});
