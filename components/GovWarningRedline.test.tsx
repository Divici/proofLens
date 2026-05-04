import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GovWarningRedline } from "./GovWarningRedline";
import { GOV_WARNING_CANONICAL } from "@/lib/verify/strict/gov-warning-canonical";

describe("GovWarningRedline", () => {
  it("renders both expected and extracted columns", () => {
    render(<GovWarningRedline candidate={GOV_WARNING_CANONICAL} />);
    expect(screen.getByLabelText(/government warning red-line/i)).toBeInTheDocument();
    // Heading reads 'Expected' (not 'Canonical 27 CFR § 16.21') so the
    // wording matches the rest of the panel. The cite still surfaces in
    // the explanation prose under the row.
    expect(screen.getByText(/^expected$/i)).toBeInTheDocument();
    expect(screen.getByText(/extracted from label/i)).toBeInTheDocument();
  });

  it("when extracted matches canonical exactly, neither column shows highlight markup", () => {
    const { container } = render(
      <GovWarningRedline candidate={GOV_WARNING_CANONICAL} />,
    );
    expect(container.querySelector("del")).toBeNull();
    expect(container.querySelector("ins")).toBeNull();
  });

  it("strikethroughs the missing portion when the candidate drops the prefix entirely", () => {
    // Reviewer reading the canonical column should see "GOVERNMENT WARNING:"
    // marked as missing; reading the candidate column they should see the
    // full warning body without that prefix.
    const noPrefix = GOV_WARNING_CANONICAL.replace(
      "GOVERNMENT WARNING: ",
      "",
    );
    const { container } = render(<GovWarningRedline candidate={noPrefix} />);
    const dels = Array.from(container.querySelectorAll("del"));
    expect(dels.length).toBeGreaterThan(0);
    const removedText = dels.map((el) => el.textContent ?? "").join(" ");
    expect(removedText).toMatch(/GOVERNMENT WARNING/);
  });

  it("highlights extra wording on the candidate side when the label adds tokens not in the canonical", () => {
    const withExtra = `${GOV_WARNING_CANONICAL} EXTRA WORDS HERE`;
    const { container } = render(<GovWarningRedline candidate={withExtra} />);
    const inses = Array.from(container.querySelectorAll("ins"));
    expect(inses.length).toBeGreaterThan(0);
    const addedText = inses.map((el) => el.textContent ?? "").join(" ");
    expect(addedText).toMatch(/EXTRA WORDS HERE/);
  });

  it("surfaces the title-case prefix as a swap (canonical 'GOVERNMENT' missing AND extracted 'Government' added)", () => {
    // Jenny Park's specific bug: "Government Warning" instead of all caps.
    const titleCase = GOV_WARNING_CANONICAL.replace(
      "GOVERNMENT WARNING:",
      "Government Warning:",
    );
    const { container } = render(<GovWarningRedline candidate={titleCase} />);
    const dels = Array.from(container.querySelectorAll("del")).map(
      (el) => el.textContent ?? "",
    );
    const inses = Array.from(container.querySelectorAll("ins")).map(
      (el) => el.textContent ?? "",
    );
    expect(dels.some((t) => /GOVERNMENT/.test(t))).toBe(true);
    expect(inses.some((t) => /Government/.test(t))).toBe(true);
  });

  it("renders an empty-message placeholder on the candidate side when the extracted text is empty", () => {
    render(<GovWarningRedline candidate="" />);
    expect(
      screen.getByText(/label warning could not be extracted/i),
    ).toBeInTheDocument();
  });
});
