import {
  runLadder,
  type CallJudgeFn,
  type LadderOutcome,
  normaliseForLadder,
} from "./ladder";

interface NuancedMatchInput {
  extracted: string | null;
  expected: string;
  callJudge?: CallJudgeFn;
}

/**
 * Brand-name nuanced match. Brand strings are short and identity-bearing
 * (e.g. "Stone's Throw" vs "Stones Throw") so we use the standard ladder
 * with the default thresholds.
 */
export function brandMatch(input: NuancedMatchInput): Promise<LadderOutcome> {
  return runLadder({ ...input, fieldName: "brand" });
}

/**
 * Class / type designation nuanced match.
 *
 * E.g. "Kentucky Straight Bourbon Whiskey" vs "Kentucky Straight Bourbon
 * Whisky" (one letter off). Token-set ratio handles "Bourbon Whiskey, Aged
 * 10 Years" vs "Bourbon Whiskey".
 */
export function classTypeMatch(
  input: NuancedMatchInput,
): Promise<LadderOutcome> {
  return runLadder({ ...input, fieldName: "classType" });
}

/**
 * Bottler / producer name nuanced match.
 *
 * Bottler strings often carry corporate suffixes ("LLC", "Inc.", "Co.")
 * that the OCR may or may not capture. token_set_ratio handles those
 * extra/missing tokens gracefully.
 */
export function bottlerMatch(
  input: NuancedMatchInput,
): Promise<LadderOutcome> {
  return runLadder({ ...input, fieldName: "bottlerName" });
}

/**
 * Country-of-origin nuanced match.
 *
 * Per TTB labeling guidance (27 CFR §§ 5.66 / 4.35 / 7.66), accepted
 * phrasings include `Product of [Country]`, `Made in [Country]`,
 * `Imported from [Country]`, or just the country name. We light-pre-
 * process the extracted value to strip those leading phrases before
 * running the standard ladder against the expected country name.
 */
const LEADING_PHRASES = [
  /^product of\s+/i,
  /^made in\s+/i,
  /^imported from\s+/i,
  /^bottled in\s+/i,
  /^distilled in\s+/i,
];

const US_ALIAS_LIST = [
  "usa",
  "u s a",
  "us",
  "u s",
  "united states",
  "united states of america",
  "america",
];

const US_ALIASES = new Set(US_ALIAS_LIST.map((s) => normaliseForLadder(s)));

/**
 * True when the supplied country string is a US alias under the same
 * Layer-1 normalisation used by the nuanced ladder. Empty / null /
 * non-string inputs return false (treat as imported by default — a
 * blank country in the application is suspicious).
 *
 * Used by the pipeline to auto-derive `isImported` for the country-of-
 * origin requirement rule. The brief's "country of origin for imports"
 * maps cleanly to "if it isn't US, it's imported" — no separate UI
 * checkbox needed.
 */
export function isUnitedStates(country: string | null | undefined): boolean {
  if (typeof country !== "string" || country.trim().length === 0) return false;
  return US_ALIASES.has(normaliseForLadder(country));
}

function stripLeading(text: string): string {
  let out = text.trim();
  for (const re of LEADING_PHRASES) {
    out = out.replace(re, "");
  }
  return out.trim();
}

export async function countryMatch(
  input: NuancedMatchInput,
): Promise<LadderOutcome> {
  const cleanedExtracted =
    typeof input.extracted === "string"
      ? stripLeading(input.extracted)
      : input.extracted;

  // Special-case the United States — TTB labels use a wide range of
  // aliases ("U.S.A.", "America", "United States of America") that
  // token_set_ratio doesn't always score above 0.92.
  const expectedNorm = normaliseForLadder(input.expected);
  if (US_ALIASES.has(expectedNorm) && typeof cleanedExtracted === "string") {
    const foundNorm = normaliseForLadder(cleanedExtracted);
    if (US_ALIASES.has(foundNorm)) {
      // Alias-driven equivalence is morally rung 1 — the values are
      // equal once a small alias table is consulted. Render as Pass
      // for the same reason rung-1 byte-equality does (Phase 2 §3 #5).
      return {
        kind: "pass-normalised",
        similarity: 1,
        normalisedFound: foundNorm,
        normalisedExpected: expectedNorm,
      };
    }
  }

  return runLadder({
    extracted: cleanedExtracted,
    expected: input.expected,
    callJudge: input.callJudge,
    fieldName: "countryOfOrigin",
  });
}
