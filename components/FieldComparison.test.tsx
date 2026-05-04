import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FieldComparison } from "./FieldComparison";

describe("FieldComparison", () => {
  it("renders both columns with the renamed Expected heading (no 'canonical' wording)", () => {
    render(<FieldComparison expected="Old Tom Distillery" extracted="Old Tom Distillery" />);
    expect(screen.getByLabelText(/expected vs extracted/i)).toBeInTheDocument();
    expect(screen.getByText(/^expected$/i)).toBeInTheDocument();
    expect(screen.getByText(/extracted from label/i)).toBeInTheDocument();
    expect(screen.queryByText(/canonical/i)).not.toBeInTheDocument();
  });

  it("annotates the Expected column with the 'from the application data tab' subtitle", () => {
    // Reviewer-feedback hint preserved from the inline 'Expected: …' line —
    // makes the source of truth for the comparison explicit without
    // forcing a tab switch.
    render(<FieldComparison expected="40" extracted="40" />);
    expect(
      screen.getByText(/from the application data tab/i),
    ).toBeInTheDocument();
  });

  it("renders no add/remove markup when expected and extracted match exactly", () => {
    const { container } = render(
      <FieldComparison expected="Old Tom Distillery" extracted="Old Tom Distillery" />,
    );
    expect(container.querySelector("del")).toBeNull();
    expect(container.querySelector("ins")).toBeNull();
  });

  it("strikethroughs the missing portion when extracted drops a word (case: bottlerName lost an LLC suffix)", () => {
    const { container } = render(
      <FieldComparison
        expected="Old Tom Distillery, LLC"
        extracted="Old Tom Distillery"
      />,
    );
    const dels = Array.from(container.querySelectorAll("del")).map(
      (el) => el.textContent ?? "",
    );
    expect(dels.join(" ")).toMatch(/LLC/);
  });

  it("highlights amber additions when extracted has tokens not in expected", () => {
    const { container } = render(
      <FieldComparison
        expected="Stone's Throw"
        extracted="Stone's Throw Brewing"
      />,
    );
    const inses = Array.from(container.querySelectorAll("ins")).map(
      (el) => el.textContent ?? "",
    );
    expect(inses.join(" ")).toMatch(/Brewing/);
  });

  it("surfaces case-only diffs as token swaps (Stone's Throw vs STONE'S THROW)", () => {
    // diffWords splits on word boundaries, so the case difference shows
    // up as several small token swaps ("Stone" → "STONE", "Throw" →
    // "THROW") rather than one bulk swap. Either way: every changed
    // token gets a paired `<del>` (mixed case) on the Expected side and
    // `<ins>` (upper case) on the Extracted side.
    const { container } = render(
      <FieldComparison
        expected="Stone's Throw"
        extracted="STONE'S THROW"
      />,
    );
    const dels = Array.from(container.querySelectorAll("del")).map(
      (el) => el.textContent ?? "",
    );
    const inses = Array.from(container.querySelectorAll("ins")).map(
      (el) => el.textContent ?? "",
    );
    expect(dels.join(" ")).toMatch(/Stone/);
    expect(dels.join(" ")).toMatch(/Throw/);
    expect(inses.join(" ")).toMatch(/STONE/);
    expect(inses.join(" ")).toMatch(/THROW/);
  });

  it("works for numeric fields (ABV 40 vs 38)", () => {
    const { container } = render(<FieldComparison expected={40} extracted={38} />);
    expect(container.querySelector("del")?.textContent).toBe("40");
    expect(container.querySelector("ins")?.textContent).toBe("38");
  });

  it("works for boolean fields (renders Yes / No)", () => {
    render(<FieldComparison expected={true} extracted={false} />);
    // Both values render in their respective columns.
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("renders the Expected-empty placeholder when only extracted is set", () => {
    render(<FieldComparison expected={null} extracted="OLD TOM" />);
    expect(
      screen.getByText(/not specified in the application/i),
    ).toBeInTheDocument();
  });

  it("renders the Extracted-empty placeholder when the label couldn't be read", () => {
    render(<FieldComparison expected="Old Tom Distillery" extracted={null} />);
    expect(
      screen.getByText(/not visible on the label/i),
    ).toBeInTheDocument();
  });

  it("returns null when both sides are blank (caller-gating safety net)", () => {
    const { container } = render(
      <FieldComparison expected={null} extracted={null} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
