import type { BeverageType } from "@/lib/ai/schema";

/**
 * ABV / proof strict matcher.
 *
 * Hand-rolled regex parser — no library fits the variety of label
 * phrasings ("45% Alc./Vol.", "45% ABV", "Alcohol 45% by Volume",
 * "90 Proof"). Tolerances come from the cited regulations:
 *
 *   - Spirits (Part 5):           ± 0.3 pp  (27 CFR § 5.65)
 *   - Wine (Part 4) > 14% ABV:    ± 1.0 pp  (27 CFR § 4.36)
 *   - Wine (Part 4) ≤ 14% ABV:    ± 1.5 pp  (27 CFR § 4.36)
 *   - Malt beverages (Part 7):    ± 0.3 pp  (27 CFR § 7.65)
 *
 * Slice 0003 shipped spirits-only; slice 0004 wires the beverage-aware
 * tolerances and the 14% taxable-grade boundary check for wine.
 *
 * Recognised formats include:
 *   `45% Alc./Vol.`, `45% ABV`, `Alcohol 45% by Volume`, `45.0%`,
 *   `Alc. 40 percent by vol.`, `40 percent alcohol by volume`, `90 Proof`.
 */

export interface ParsedAbv {
  /** Percentage ABV detected on the label, or null if not present. */
  abv: number | null;
  /** Proof value detected on the label, or null if not present. */
  proof: number | null;
  /** The original input string. */
  raw: string;
}

export type AbvFailReason =
  | "unparseable"
  | "out_of_tolerance"
  | "internal_inconsistency";

export interface AbvOutcome {
  status: "pass" | "fail";
  reason?: AbvFailReason;
  /** ABV resolved from the label (proof converted if needed). */
  found: number | null;
  expected: number;
  delta: number | null;
  tolerance: number;
}

/** Spirits tolerance per 27 CFR § 5.65. */
export const SPIRITS_ABV_TOLERANCE_PP = 0.3;
/** Malt beverages tolerance per 27 CFR § 7.65. */
export const MALT_ABV_TOLERANCE_PP = 0.3;
/** Wine ≤ 14% ABV ("table" tier) tolerance per 27 CFR § 4.36. */
export const WINE_TABLE_ABV_TOLERANCE_PP = 1.5;
/** Wine > 14% ABV tolerance per 27 CFR § 4.36. */
export const WINE_OVER_14_ABV_TOLERANCE_PP = 1.0;
/**
 * Wine taxable-grade boundary. Per 27 CFR § 4.36, the tolerance band may
 * NOT span the 14% boundary — a 14% expected with 15.4% extracted does
 * not pass even though Δ = 1.4 pp ≤ ±1.5 pp.
 */
export const WINE_TAXABLE_BOUNDARY_PP = 14;

/**
 * Resolve the percentage-point tolerance for an ABV check given the
 * beverage type. For wine, the tolerance also depends on the expected
 * value (the ±1.0 / ±1.5 split at 14% ABV).
 */
export function abvToleranceFor(
  beverageType: BeverageType | undefined,
  expectedAbv: number,
): number {
  if (beverageType === "wine") {
    // 27 CFR § 4.36: ±1.0 pp for > 14% ABV, ±1.5 pp for ≤ 14% ABV.
    return expectedAbv > WINE_TAXABLE_BOUNDARY_PP
      ? WINE_OVER_14_ABV_TOLERANCE_PP
      : WINE_TABLE_ABV_TOLERANCE_PP;
  }
  if (beverageType === "malt-beverage") {
    // 27 CFR § 7.65.
    return MALT_ABV_TOLERANCE_PP;
  }
  // Spirits and unknown both fall back to the strictest spirits band.
  // Unknown defaults to the most conservative tolerance so an unclassified
  // product cannot accidentally pass on a sloppier wine-style band.
  return SPIRITS_ABV_TOLERANCE_PP;
}

// Anchored at the start so a number embedded in a paragraph doesn't
// match the wrong thing. We allow up to two decimal places.
//
// Example matches: `45% Alc./Vol.`, `45% ABV`, `Alcohol 45% by Volume`,
//                  `45.0%`, `Alc. 40 percent by vol.`,
//                  `40 percent alcohol by volume`, `12.5%alc/vol`.
const ABV_PATTERN_PERCENT =
  /(\d{1,2}(?:\.\d{1,2})?)\s*(?:%|percent)\s*(?:abv|alc(?:ohol)?\.?(?:\s*[/]\s*|\s+(?:by\s+)?)?vol(?:ume)?\.?)?/i;

const ABV_PATTERN_ALCOHOL_FIRST =
  /alc(?:ohol)?\.?\s*(\d{1,2}(?:\.\d{1,2})?)\s*(?:%|percent)/i;

const PROOF_PATTERN = /(\d{1,3}(?:\.\d{1,2})?)\s*proof\b/i;

export function parseAbvText(input: string): ParsedAbv {
  const result: ParsedAbv = { abv: null, proof: null, raw: input };
  if (typeof input !== "string" || input.trim().length === 0) return result;

  const proofMatch = input.match(PROOF_PATTERN);
  if (proofMatch?.[1]) {
    const n = Number(proofMatch[1]);
    if (Number.isFinite(n)) result.proof = n;
  }

  // Try `Alcohol 45%` form first since it's not anchored to the digit.
  const alcFirst = input.match(ABV_PATTERN_ALCOHOL_FIRST);
  if (alcFirst?.[1]) {
    const n = Number(alcFirst[1]);
    if (Number.isFinite(n)) result.abv = n;
  }

  if (result.abv === null) {
    const pct = input.match(ABV_PATTERN_PERCENT);
    if (pct?.[1]) {
      const n = Number(pct[1]);
      if (Number.isFinite(n)) result.abv = n;
    }
  }

  return result;
}

export interface AbvMatchInput {
  extracted: string | number | null;
  expected: number;
  /**
   * When provided, the tolerance is resolved per § 4.36 / § 5.65 / § 7.65
   * for the given beverage class. When omitted (or `unknown`), defaults to
   * the strictest spirits band (±0.3 pp) — the safest fallback for
   * unclassified products.
   */
  beverageType?: BeverageType;
  /**
   * Explicit tolerance override (percentage points). Useful for unit
   * tests; takes precedence over `beverageType`.
   */
  tolerance?: number;
}

export function abvMatch({
  extracted,
  expected,
  beverageType,
  tolerance,
}: AbvMatchInput): AbvOutcome {
  const resolvedTolerance =
    typeof tolerance === "number"
      ? tolerance
      : abvToleranceFor(beverageType, expected);

  if (extracted === null || extracted === undefined) {
    return {
      status: "fail",
      reason: "unparseable",
      found: null,
      expected,
      delta: null,
      tolerance: resolvedTolerance,
    };
  }

  const text = typeof extracted === "number" ? `${extracted}%` : String(extracted);
  const parsed = parseAbvText(text);

  let foundAbv = parsed.abv;
  if (foundAbv === null && parsed.proof !== null) {
    foundAbv = parsed.proof / 2;
  }

  if (foundAbv === null) {
    return {
      status: "fail",
      reason: "unparseable",
      found: null,
      expected,
      delta: null,
      tolerance: resolvedTolerance,
    };
  }

  // Internal inconsistency check: if both ABV and proof are on the label,
  // proof must equal 2× ABV within the tolerance band.
  if (parsed.abv !== null && parsed.proof !== null) {
    const expectedProof = parsed.abv * 2;
    if (Math.abs(parsed.proof - expectedProof) > resolvedTolerance * 2) {
      return {
        status: "fail",
        reason: "internal_inconsistency",
        found: parsed.abv,
        expected,
        delta: Math.abs(parsed.abv - expected),
        tolerance: resolvedTolerance,
      };
    }
  }

  // Wine-specific: the tolerance band must NOT span the 14% taxable-grade
  // boundary (27 CFR § 4.36). A 14% expected with a 15.4% extracted ABV
  // is a Fail even though Δ=1.4 ≤ ±1.5 pp, because the bands sit on
  // opposite sides of 14%.
  if (beverageType === "wine") {
    const expectedTier = expected > WINE_TAXABLE_BOUNDARY_PP ? "over" : "table";
    const foundTier = foundAbv > WINE_TAXABLE_BOUNDARY_PP ? "over" : "table";
    if (expectedTier !== foundTier) {
      return {
        status: "fail",
        reason: "out_of_tolerance",
        found: foundAbv,
        expected,
        delta: Math.abs(foundAbv - expected),
        tolerance: resolvedTolerance,
      };
    }
  }

  const delta = Math.abs(foundAbv - expected);
  // Floating-point: accept anything within tolerance + 1e-9 to avoid
  // false-fails at the boundary (e.g. 45.3 vs 45 with tol 0.3).
  if (delta <= resolvedTolerance + 1e-9) {
    return {
      status: "pass",
      found: foundAbv,
      expected,
      delta,
      tolerance: resolvedTolerance,
    };
  }

  return {
    status: "fail",
    reason: "out_of_tolerance",
    found: foundAbv,
    expected,
    delta,
    tolerance: resolvedTolerance,
  };
}
