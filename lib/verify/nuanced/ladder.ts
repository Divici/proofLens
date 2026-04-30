import * as fuzzball from "fuzzball";

/**
 * Nuanced match ladder for non-strict identity-bearing fields (brand,
 * class/type, bottler name, country of origin).
 *
 * Algorithm (per `research-findings/03-verification-logic.md` §Q2):
 *
 *     1. Normalise: NFKC → smart-quote/dash fold → case fold (en-US) →
 *        punctuation strip → whitespace collapse.
 *     2. Score with `fuzzball.token_set_ratio` (rapidfuzz-style; handles
 *        token reordering and missing/extra tokens like "LLC").
 *     3. Banded decision:
 *
 *           similarity ≥ 0.92  → Pass (or Likely Match if not byte-equal
 *                                after normalisation)
 *           0.78 ≤ s < 0.92    → callJudge() — verdict drives status
 *           similarity <  0.78 → Fail
 *
 * The judge is invoked only for the gray band, never for strict fields.
 * If `callJudge` is not provided (e.g. judge endpoint not yet wired) we
 * route gray-band cases to Manual Review.
 */

export const NUANCED_PASS_THRESHOLD = 0.92;
export const NUANCED_FAIL_THRESHOLD = 0.78;

export type LadderKind =
  | "pass"
  | "likely-match"
  | "fail"
  | "manual-review"
  | "missing";

export type JudgeVerdict =
  | "equivalent"
  | "not_equivalent"
  | "uncertain";

export interface LadderJudgeResult {
  verdict: JudgeVerdict;
  reasoning: string;
}

export type CallJudgeFn = (args: {
  extracted: string;
  expected: string;
  fieldName?: string;
}) => Promise<LadderJudgeResult>;

export interface LadderOutcome {
  kind: LadderKind;
  similarity: number;
  /** Normalised candidate (after Layer 1 transforms). */
  normalisedFound: string;
  /** Normalised expected (after Layer 1 transforms). */
  normalisedExpected: string;
  /** Present when the gray-band judge was invoked. */
  judgeVerdict?: JudgeVerdict;
  /** Present when the judge was invoked — its rationale. */
  judgeReasoning?: string;
}

export interface RunLadderInput {
  extracted: string | null;
  expected: string;
  callJudge?: CallJudgeFn;
  fieldName?: string;
}

/**
 * Layer 1 normaliser — same shape used by both nuanced ladder rungs and
 * the bbox locator (so an `evidenceQuote` and a Tesseract word stream
 * normalise the same way).
 */
export function normaliseForLadder(text: string): string {
  let out = text.normalize("NFKC");
  // Fold smart quotes / dashes — same minimal table as the gov-warning
  // matcher, repeated here so neither file depends on the other.
  out = out
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—‐‑‒−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[  ]/g, " ");
  // Case fold to en-US (the regulation is US English).
  out = out.toLocaleLowerCase("en-US");
  // Drop apostrophes and inner-word quotes outright so "Stone's" → "stones".
  // Internal apostrophes carry no semantic weight for nuanced identity matching.
  out = out.replace(/['"]/g, "");
  // Strip remaining non-alphanumeric punctuation, leaving spaces.
  out = out.replace(/[^\p{L}\p{N}\s]/gu, " ");
  // Collapse whitespace.
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

export async function runLadder({
  extracted,
  expected,
  callJudge,
  fieldName,
}: RunLadderInput): Promise<LadderOutcome> {
  const normalisedExpected = normaliseForLadder(expected);

  if (extracted === null || extracted === undefined) {
    return {
      kind: "missing",
      similarity: 0,
      normalisedFound: "",
      normalisedExpected,
    };
  }

  const extractedStr = String(extracted);
  const normalisedFound = normaliseForLadder(extractedStr);

  // Rung 0 — byte-for-byte equality on the raw inputs → unambiguous Pass.
  if (extractedStr === expected) {
    return {
      kind: "pass",
      similarity: 1,
      normalisedFound,
      normalisedExpected,
    };
  }

  // Rung 1+ — equality after Layer 1 normalisation → Likely Match (the
  // values agree once case + punctuation noise is folded out).
  if (normalisedFound === normalisedExpected) {
    return {
      kind: "likely-match",
      similarity: 1,
      normalisedFound,
      normalisedExpected,
    };
  }

  // Token-set ratio (rapidfuzz-style; handles "Stone's Throw, LLC" vs
  // "Stone's Throw"). Returns 0–100; we normalise to [0, 1].
  const score =
    fuzzball.token_set_ratio(normalisedFound, normalisedExpected) / 100;

  if (score >= NUANCED_PASS_THRESHOLD) {
    return {
      kind: "likely-match",
      similarity: score,
      normalisedFound,
      normalisedExpected,
    };
  }

  if (score < NUANCED_FAIL_THRESHOLD) {
    return {
      kind: "fail",
      similarity: score,
      normalisedFound,
      normalisedExpected,
    };
  }

  // Gray band — invoke the judge if available.
  if (!callJudge) {
    return {
      kind: "manual-review",
      similarity: score,
      normalisedFound,
      normalisedExpected,
    };
  }

  let judgeResult: LadderJudgeResult;
  try {
    judgeResult = await callJudge({
      extracted: extractedStr,
      expected,
      fieldName,
    });
  } catch {
    // Judge call failed — fall back to manual review rather than guessing.
    return {
      kind: "manual-review",
      similarity: score,
      normalisedFound,
      normalisedExpected,
    };
  }

  if (judgeResult.verdict === "equivalent") {
    return {
      kind: "likely-match",
      similarity: score,
      normalisedFound,
      normalisedExpected,
      judgeVerdict: "equivalent",
      judgeReasoning: judgeResult.reasoning,
    };
  }
  if (judgeResult.verdict === "not_equivalent") {
    return {
      kind: "fail",
      similarity: score,
      normalisedFound,
      normalisedExpected,
      judgeVerdict: "not_equivalent",
      judgeReasoning: judgeResult.reasoning,
    };
  }
  return {
    kind: "manual-review",
    similarity: score,
    normalisedFound,
    normalisedExpected,
    judgeVerdict: "uncertain",
    judgeReasoning: judgeResult.reasoning,
  };
}
