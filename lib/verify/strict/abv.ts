/**
 * ABV / proof strict matcher.
 *
 * Per `research-findings/03-verification-logic.md` §Q3, this is a hand-
 * rolled regex parser — no library fits. The tolerances come from
 * `research-findings/01-ttb-regulatory.md` §Q4:
 *
 *   - Spirits (Part 5):           ± 0.3 percentage points (this slice).
 *   - Wine (Part 4) > 14% ABV:    ± 1.0 pp  (slice 0004 — beverage-aware).
 *   - Wine (Part 4) ≤ 14% ABV:    ± 1.5 pp  (slice 0004 — beverage-aware).
 *   - Malt beverages (Part 7):    ± 0.3 pp  (slice 0004).
 *
 * Slice 0003 ships only the spirits tolerance (±0.3 pp) — beverage-aware
 * routing lands in slice 0004.
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

/** Default spirits tolerance per § 5.65. */
export const SPIRITS_ABV_TOLERANCE_PP = 0.3;

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
  tolerance?: number;
}

export function abvMatch({
  extracted,
  expected,
  tolerance = SPIRITS_ABV_TOLERANCE_PP,
}: AbvMatchInput): AbvOutcome {
  if (extracted === null || extracted === undefined) {
    return {
      status: "fail",
      reason: "unparseable",
      found: null,
      expected,
      delta: null,
      tolerance,
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
      tolerance,
    };
  }

  // Internal inconsistency check: if both ABV and proof are on the label,
  // proof must equal 2× ABV within the tolerance band.
  if (parsed.abv !== null && parsed.proof !== null) {
    const expectedProof = parsed.abv * 2;
    if (Math.abs(parsed.proof - expectedProof) > tolerance * 2) {
      return {
        status: "fail",
        reason: "internal_inconsistency",
        found: parsed.abv,
        expected,
        delta: Math.abs(parsed.abv - expected),
        tolerance,
      };
    }
  }

  const delta = Math.abs(foundAbv - expected);
  // Floating-point: accept anything within tolerance + 1e-9 to avoid
  // false-fails at the boundary (e.g. 45.3 vs 45 with tol 0.3).
  if (delta <= tolerance + 1e-9) {
    return {
      status: "pass",
      found: foundAbv,
      expected,
      delta,
      tolerance,
    };
  }

  return {
    status: "fail",
    reason: "out_of_tolerance",
    found: foundAbv,
    expected,
    delta,
    tolerance,
  };
}
