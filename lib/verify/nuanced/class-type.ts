import {
  runLadder,
  type CallJudgeFn,
  type LadderOutcome,
} from "./ladder";

/**
 * Class / type designation nuanced match.
 *
 * E.g. "Kentucky Straight Bourbon Whiskey" vs "Kentucky Straight Bourbon
 * Whisky" (one letter off). Token-set ratio handles "Bourbon Whiskey, Aged
 * 10 Years" vs "Bourbon Whiskey".
 */
export function classTypeMatch(input: {
  extracted: string | null;
  expected: string;
  callJudge?: CallJudgeFn;
}): Promise<LadderOutcome> {
  return runLadder({ ...input, fieldName: "classType" });
}
