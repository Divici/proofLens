import {
  runLadder,
  type CallJudgeFn,
  type LadderOutcome,
  normaliseForLadder,
} from "./ladder";

/**
 * Country-of-origin nuanced match.
 *
 * Per `research-findings/01-ttb-regulatory.md` §Q7, accepted phrasings
 * include `Product of [Country]`, `Made in [Country]`, `Imported from
 * [Country]`, or just the country name. We light-pre-process the
 * extracted value to strip those leading phrases before running the
 * standard ladder against the expected country name.
 */
const LEADING_PHRASES = [
  /^product of\s+/i,
  /^made in\s+/i,
  /^imported from\s+/i,
  /^bottled in\s+/i,
  /^distilled in\s+/i,
];

const US_ALIASES = new Set(
  [
    "usa",
    "u s a",
    "us",
    "u s",
    "united states",
    "united states of america",
    "america",
  ].map((s) => normaliseForLadder(s)),
);

function stripLeading(text: string): string {
  let out = text.trim();
  for (const re of LEADING_PHRASES) {
    out = out.replace(re, "");
  }
  return out.trim();
}

export async function countryMatch(input: {
  extracted: string | null;
  expected: string;
  callJudge?: CallJudgeFn;
}): Promise<LadderOutcome> {
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
      return {
        kind: "likely-match",
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
