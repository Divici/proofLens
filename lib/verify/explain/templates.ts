import type { RuleOutcome, RuleOutcomeKind } from "@/lib/verify/types";

/**
 * Templated, rule-sourced explanations. One entry per `RuleOutcomeKind`.
 *
 * These strings are the audit-of-record — same inputs always produce
 * the same explanation. Optional LLM narrative on Manual-Review
 * rows is a separate, secondary field that the UI may surface but the
 * audit log keeps the templated string.
 */

type TemplateFn = (detail: Record<string, unknown>) => string;

function num(value: unknown, fallback = "?"): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Trim trailing zeros for clean ABV strings (45.0 → 45).
    return value % 1 === 0 ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }
  return fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export const RULE_TEMPLATES: Record<RuleOutcomeKind, TemplateFn> = {
  // ── gov-warning ────────────────────────────────────────────────────
  gov_warning_pass: () =>
    "Government warning text matches 27 CFR § 16.21 verbatim.",
  gov_warning_prefix_missing: () =>
    "The required prefix “GOVERNMENT WARNING:” is missing from the label.",
  gov_warning_prefix_capitalization: () =>
    "The required prefix “GOVERNMENT WARNING:” must appear in all capital letters with a colon. Found a non-uppercase variant.",
  gov_warning_wording_mismatch: ({ distance }) =>
    `Warning text differs from the canonical 27 CFR § 16.21 statement (off by ${num(
      distance,
    )} character${distance === 1 ? "" : "s"} after normalisation). The text must match verbatim.`,

  // ── ABV ───────────────────────────────────────────────────────────
  abv_pass: ({ found, expected }) =>
    `Alcohol content ${num(found)}% matches the expected ${num(expected)}% within tolerance.`,
  abv_unparseable: () =>
    "Could not parse a numeric ABV (or proof) value from the label.",
  abv_out_of_tolerance: ({ expected, found, delta, tolerance }) =>
    `Expected ${num(expected)}% ABV; found ${num(
      found,
    )}% (Δ ${num(delta)} pp, tolerance ±${num(tolerance)} pp).`,
  abv_internal_inconsistency: ({ found }) =>
    `The ABV (${num(found)}%) and proof statements on the label disagree — proof should equal 2× ABV.`,

  // ── Net contents ──────────────────────────────────────────────────
  net_contents_pass: ({ foundMl, expectedMl }) =>
    `Net contents match (${num(foundMl)} mL ≈ ${num(expectedMl)} mL).`,
  net_contents_unparseable: () =>
    "Could not parse a volume from the label.",
  net_contents_volume_mismatch: ({ expectedMl, foundMl }) =>
    `Expected ${num(expectedMl)} mL; found ${num(foundMl)} mL — outside the 0.1% tolerance.`,
  net_contents_non_standard_fill: ({ foundMl, beverageType, cfrSection }) => {
    const bevLabel =
      beverageType === "wine"
        ? "wine"
        : beverageType === "distilled-spirits"
          ? "distilled spirits"
          : "this beverage class";
    const cite = str(cfrSection, "§ 4.72 / § 5.203");
    return `Net contents (${num(foundMl)} mL) match the application's expected value, but ${num(
      foundMl,
    )} mL is not on the TTB authorized standards of fill for ${bevLabel} (27 CFR ${cite}). Reviewer should flag for non-standard fill or correct the application.`;
  },

  // ── Nuanced ladder ────────────────────────────────────────────────
  nuanced_pass: () => "Value matches the expected entry exactly.",
  nuanced_pass_normalised: () =>
    "Value matches the expected entry after case and punctuation normalisation.",
  nuanced_likely_match: ({ similarity }) =>
    `Value matches after case + punctuation normalisation (similarity ${num(
      typeof similarity === "number" ? similarity * 100 : 0,
    )}%).`,
  nuanced_manual_review: ({ similarity, reasoning }) => {
    const base = `Value is similar but not a confident match (${num(
      typeof similarity === "number" ? similarity * 100 : 0,
    )}%) — please review.`;
    const why = str(reasoning);
    return why ? `${base} (${why})` : base;
  },
  nuanced_fail: ({ similarity }) =>
    `Value does not match the expected entry (similarity ${num(
      typeof similarity === "number" ? similarity * 100 : 0,
    )}%).`,
  nuanced_missing: () =>
    "Value not visible on the label.",
  bottler_function_phrase_missing: () =>
    "Bottler name matches the application's entry, but no TTB-approved function-describing phrase ('bottled by', 'distilled by', 'brewed and bottled by', etc.) was found near the bottler name in the OCR. § 5.66 / § 4.35 / § 7.66 require this phrase. Reviewer should confirm the verb is present on the artwork.",

  // ── Generic ───────────────────────────────────────────────────────
  field_missing: () => "This required field is not visible on the label.",
  field_not_required: () =>
    "This field is not required for this beverage class — informational only.",
  field_low_confidence: ({ aiConfidence }) =>
    `The vision model's confidence in this field is low (${num(
      typeof aiConfidence === "number" ? aiConfidence * 100 : 0,
    )}%). Request a clearer image before relying on this value.`,
};

export function templateFor(kind: RuleOutcomeKind): TemplateFn {
  return RULE_TEMPLATES[kind];
}

export function applyTemplate(outcome: RuleOutcome): string {
  const fn = templateFor(outcome.kind);
  return fn(outcome.detail ?? {});
}
