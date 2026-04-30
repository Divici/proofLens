import type { LadderKind } from "./nuanced/ladder";
import type { FieldResult, FieldStatus, OverallStatus } from "./types";

/**
 * Status engine — pure 2-D matrix from `(matchStrength, aiConfidence)`
 * to one of the 8-state field-status enum values.
 *
 * Per `research-findings/03-verification-logic.md` §Q5:
 *
 *   - Strict fields (gov-warning, ABV, net-contents) collapse to
 *     `{Pass, Fail, Missing, Low Confidence}`. There is no "Likely Match"
 *     on a strict field.
 *   - Nuanced fields can land in any of the 8 states.
 *   - AI confidence < 0.6 always overrides to Low Confidence.
 *   - AI confidence in [0.6, 0.85) softens a strict-fail into a warning
 *     (only on the nuanced side — strict fields stay strict).
 *
 * Image-quality override (R-011, slice 0004): when `imageQualityPoor` is
 * true (any heuristic or LLM-flagged image-quality signal fired),
 * any non-Fail / non-Missing cell is demoted to `manual-review` with the
 * "Request Better Image" suggested action. Strict-fails are preserved
 * because a clearly-non-compliant label cannot be saved by a better
 * photo. Missing rows similarly stay Missing — re-shooting may help, but
 * the field is still absent in the current frame.
 */

export const AI_CONFIDENCE_HIGH = 0.85;
export const AI_CONFIDENCE_MID = 0.6;

export interface ResolveStrictArgs {
  matchPassed: boolean;
  aiConfidence: number;
  extractedNull?: boolean;
  imageQualityPoor?: boolean;
}

export function resolveStrictStatus({
  matchPassed,
  aiConfidence,
  extractedNull = false,
  imageQualityPoor = false,
}: ResolveStrictArgs): FieldStatus {
  if (extractedNull) return "missing";
  if (aiConfidence < AI_CONFIDENCE_MID) return "low-confidence";
  // Strict-fails take precedence over image-quality. A non-compliant
  // label can't be salvaged by a better photo of the same artwork.
  if (!matchPassed) return "fail";
  // Pass cell + poor quality → demote to manual-review.
  if (imageQualityPoor) return "manual-review";
  return "pass";
}

export interface ResolveNuancedArgs {
  ladderKind: LadderKind;
  aiConfidence: number;
  imageQualityPoor?: boolean;
}

export function resolveNuancedStatus({
  ladderKind,
  aiConfidence,
  imageQualityPoor = false,
}: ResolveNuancedArgs): FieldStatus {
  if (ladderKind === "missing") return "missing";
  if (aiConfidence < AI_CONFIDENCE_MID) return "low-confidence";

  // Image-quality override applies to every non-fail / non-missing cell.
  // Demote to manual-review so the reviewer requests a better image.
  if (imageQualityPoor && ladderKind !== "fail") return "manual-review";

  if (ladderKind === "pass") return "pass";
  if (ladderKind === "likely-match") return "likely-match";
  if (ladderKind === "manual-review") return "manual-review";

  // Ladder failed.
  // High AI confidence + ladder fail → strong fail signal.
  // Mid AI confidence (0.6 ≤ ai < 0.85) softens to a warning so the
  // reviewer can sanity-check before strict-failing.
  if (aiConfidence >= AI_CONFIDENCE_HIGH) return "fail";
  return "warning";
}

/**
 * Roll-up logic per PRD §9.6.
 *
 *   1. Any `fail` → overall fail.
 *   2. ≥ 2 `low-confidence` (or every present field low-confidence) → request-better-image.
 *   3. Any `manual-review` (and no fail) → needs-manual-review.
 *   4. Any `warning` or `likely-match` (and no fail / mr) → pass-with-warnings.
 *   5. Otherwise → pass.
 *
 * `not-required` rows are inert and don't affect the roll-up.
 */
export function rollUpOverall(fields: ReadonlyArray<FieldResult>): OverallStatus {
  let hasFail = false;
  let hasManualReview = false;
  let hasWarning = false;
  let hasLikelyMatch = false;
  let lowConfidenceCount = 0;
  let missingCount = 0;
  let activeCount = 0;

  for (const f of fields) {
    if (f.status === "not-required") continue;
    activeCount++;
    switch (f.status) {
      case "fail":
        hasFail = true;
        break;
      case "manual-review":
        hasManualReview = true;
        break;
      case "warning":
        hasWarning = true;
        break;
      case "likely-match":
        hasLikelyMatch = true;
        break;
      case "low-confidence":
        lowConfidenceCount++;
        break;
      case "missing":
        missingCount++;
        break;
      case "pass":
      default:
        break;
    }
  }

  if (hasFail) return "fail";
  // Image-quality issues — many missing values or many low-confidence
  // values → ask for a better image. Threshold is conservative so a single
  // missing optional field doesn't trigger it.
  if (lowConfidenceCount >= 2) return "request-better-image";
  if (missingCount >= 2 && missingCount > activeCount / 2)
    return "request-better-image";
  if (hasManualReview) return "needs-manual-review";
  if (missingCount > 0) return "needs-manual-review";
  if (hasWarning || hasLikelyMatch || lowConfidenceCount > 0)
    return "pass-with-warnings";
  return "pass";
}
