import {
  runLadder,
  type CallJudgeFn,
  type LadderOutcome,
} from "./ladder";

/**
 * Bottler / producer name nuanced match.
 *
 * Bottler strings often carry corporate suffixes ("LLC", "Inc.", "Co.")
 * that the OCR may or may not capture. token_set_ratio handles those
 * extra/missing tokens gracefully.
 */
export function bottlerMatch(input: {
  extracted: string | null;
  expected: string;
  callJudge?: CallJudgeFn;
}): Promise<LadderOutcome> {
  return runLadder({ ...input, fieldName: "bottlerName" });
}
