import { describe, expect, it } from "vitest";
import { renderExplanation, suggestedActionFor } from "./render";
import type { RuleOutcome, RuleOutcomeKind } from "@/lib/verify/types";

const ALL_KINDS: RuleOutcomeKind[] = [
  "gov_warning_pass",
  "gov_warning_prefix_missing",
  "gov_warning_prefix_capitalization",
  "gov_warning_wording_mismatch",
  "abv_pass",
  "abv_unparseable",
  "abv_out_of_tolerance",
  "abv_internal_inconsistency",
  "net_contents_pass",
  "net_contents_unparseable",
  "net_contents_volume_mismatch",
  "net_contents_non_standard_fill",
  "nuanced_pass",
  "nuanced_pass_normalised",
  "nuanced_likely_match",
  "nuanced_manual_review",
  "nuanced_fail",
  "nuanced_missing",
  "bottler_function_phrase_missing",
  "field_missing",
  "field_not_required",
  "field_low_confidence",
];

describe("renderExplanation — every RuleOutcome kind has a non-empty template", () => {
  it.each(ALL_KINDS)("renders a non-empty string for kind %s", (kind) => {
    const outcome: RuleOutcome = { kind, detail: {} };
    const result = renderExplanation(outcome);
    expect(result).toBeTypeOf("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("interpolates abv_out_of_tolerance with expected/found/delta/tolerance", () => {
    const text = renderExplanation({
      kind: "abv_out_of_tolerance",
      detail: { expected: 45, found: 40, delta: 5, tolerance: 0.3 },
    });
    expect(text).toMatch(/45/);
    expect(text).toMatch(/40/);
    expect(text).toMatch(/0\.3/);
  });

  it("interpolates net_contents_volume_mismatch with mL values", () => {
    const text = renderExplanation({
      kind: "net_contents_volume_mismatch",
      detail: { expectedMl: 750, foundMl: 700 },
    });
    expect(text).toMatch(/750/);
    expect(text).toMatch(/700/);
  });

  it("interpolates gov_warning_wording_mismatch with distance", () => {
    const text = renderExplanation({
      kind: "gov_warning_wording_mismatch",
      detail: { distance: 5 },
    });
    expect(text).toMatch(/5/);
  });
});

describe("suggestedActionFor", () => {
  it("returns 'Request better image' for low-confidence", () => {
    expect(suggestedActionFor("low-confidence")).toMatch(/image/i);
  });
  it("returns 'Reject application' for fail", () => {
    expect(suggestedActionFor("fail")).toMatch(/reject/i);
  });
  it("returns a non-empty string for every status", () => {
    const statuses = [
      "pass",
      "likely-match",
      "warning",
      "fail",
      "missing",
      "low-confidence",
      "manual-review",
      "not-required",
    ] as const;
    for (const s of statuses) {
      expect(suggestedActionFor(s).length).toBeGreaterThan(0);
    }
  });
});
