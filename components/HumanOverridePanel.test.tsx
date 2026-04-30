import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

/**
 * Open the shadcn / base-ui Select popup, then click the option with the
 * given visible label. The popup is portalled, so we query the whole
 * document (`screen`) rather than the panel container.
 */
async function pickStatus(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  const trigger = screen.getByRole("combobox", { name: /new status/i });
  await user.click(trigger);
  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByRole("option", { name: label }));
  await waitFor(() =>
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
  );
}

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

  it("enables save once a reason is typed (re-affirming the AI verdict is allowed)", async () => {
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
    // Reviewer wants to confirm the AI's "pass" with a note — no status
    // change required. Save unlocks once the reason is non-empty.
    const reason = screen.getByLabelText(/reason for override/i);
    await user.type(reason, "Confirmed Pass after manual zoom.");
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
    await pickStatus(user, "Fail");
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

  it("emits an audit record that re-affirms the AI verdict when status is unchanged", async () => {
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
    const reason = screen.getByLabelText(/reason for override/i);
    await user.type(reason, "Confirmed Pass after manual zoom.");
    await user.click(screen.getByRole("button", { name: /save override/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0]![0];
    expect(payload.originalAiStatus).toBe("pass");
    expect(payload.humanStatus).toBe("pass");
    expect(payload.reason).toBe("Confirmed Pass after manual zoom.");
  });

  it("offers all 8 status options", async () => {
    const user = userEvent.setup();
    render(
      <HumanOverridePanel
        fieldLabel="Brand name"
        originalAiStatus="pass"
        reviewerName="Jane Doe"
        onSave={() => {}}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: /new status/i });
    await user.click(trigger);
    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    const optionTexts = options.map((o) => o.textContent?.trim() ?? "");
    // Map enum values back to their labels exactly as STATUS_OPTIONS does.
    const expectedLabels: Record<FieldStatus, string> = {
      pass: "Pass",
      "likely-match": "Likely match",
      warning: "Warning",
      fail: "Fail",
      missing: "Missing",
      "low-confidence": "Low confidence",
      "manual-review": "Manual review",
      "not-required": "Not required",
    };
    for (const s of STATUSES) {
      expect(optionTexts).toContain(expectedLabels[s]);
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

  it("slugifies multi-word fieldLabel into space-free input ids (HTML validity)", () => {
    const { container } = render(
      <HumanOverridePanel
        fieldLabel="Brand name"
        originalAiStatus="pass"
        reviewerName="Jane Doe"
        onSave={() => {}}
      />,
    );
    // The previous implementation produced ids like "override-status-Brand name"
    // which is invalid HTML. After slugify the id should contain no spaces.
    const inputsAndTriggers = container.querySelectorAll("[id^='override-']");
    expect(inputsAndTriggers.length).toBeGreaterThan(0);
    for (const node of inputsAndTriggers) {
      expect(node.getAttribute("id")).not.toMatch(/\s/);
    }
  });

  it("uses the explicit fieldKey for input ids when provided", () => {
    const { container } = render(
      <HumanOverridePanel
        fieldLabel="Bottler address"
        fieldKey="bottlerAddress"
        originalAiStatus="pass"
        reviewerName="Jane Doe"
        onSave={() => {}}
      />,
    );
    expect(
      container.querySelector("#override-status-bottlerAddress"),
    ).not.toBeNull();
    expect(
      container.querySelector("#override-reason-bottlerAddress"),
    ).not.toBeNull();
  });
});
