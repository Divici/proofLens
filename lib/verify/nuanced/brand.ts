import {
  runLadder,
  type CallJudgeFn,
  type LadderOutcome,
} from "./ladder";

/**
 * Brand-name nuanced match. Brand strings are short and identity-bearing
 * (e.g. "Stone's Throw" vs "Stones Throw") so we use the standard ladder
 * with the default thresholds.
 */
export function brandMatch(input: {
  extracted: string | null;
  expected: string;
  callJudge?: CallJudgeFn;
}): Promise<LadderOutcome> {
  return runLadder({ ...input, fieldName: "brand" });
}
