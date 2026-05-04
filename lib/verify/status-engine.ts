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
  // Match-passed means the deterministic strict matcher (gov-warning,
  // ABV tolerance, net-contents tolerance) confirmed the value matches
  // expected. The LLM's self-confidence becomes moot — we have ground
  // truth via the deterministic check. Phase-9 user report: angled /
  // glared real photo had ai=0 across the board but every value
  // matched expected; the UI showed "Low confidence 0%" with
  // explanation text "matches exactly", which read as a contradiction.
  if (matchPassed) {
    return imageQualityPoor ? "manual-review" : "pass";
  }
  // Match did not pass — now the AI confidence floor matters.
  if (aiConfidence < AI_CONFIDENCE_MID) return "low-confidence";
  return "fail";
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

  // Ladder = pass means the nuanced matcher (NFKC + smart-quote/dash
  // fold + case fold + punctuation strip) confirmed the value matches
  // expected. The LLM's self-confidence is moot — we have a
  // deterministic match. Phase-9 user report: real-photo nuanced
  // fields with ai=0 showed "Low confidence" despite a clean match.
  //
  // Pass-normalised collapses to the same "Pass" pill (Phase 2 §3 #5):
  // the values are byte-equal once Layer-1 normalisation runs, so the
  // at-a-glance signal should be unambiguous. Audit-trail distinction
  // is preserved via the RuleOutcome kind, not the FieldStatus.
  if (ladderKind === "pass" || ladderKind === "pass-normalised") {
    return imageQualityPoor ? "manual-review" : "pass";
  }

  // Ladder = likely-match: the matcher routed through the gray band
  // and the judge or fallback ladder said "probably matches". Treat
  // similarly — the deterministic chain validated; AI-floor is moot.
  if (ladderKind === "likely-match") {
    return imageQualityPoor ? "manual-review" : "likely-match";
  }

  // Ladder = manual-review: matcher itself wants a human eye, so
  // honor that regardless of AI confidence or image quality.
  if (ladderKind === "manual-review") return "manual-review";

  // Ladder = fail. Strict-fail signal at high AI confidence stays
  // strict regardless of image quality — a non-compliant label can't
  // be salvaged by a better photo of the same artwork.
  if (aiConfidence >= AI_CONFIDENCE_HIGH) return "fail";
  // LLM doesn't trust its own extraction → low-confidence (could be
  // a hallucinated value driven by glare / blur).
  if (aiConfidence < AI_CONFIDENCE_MID) return "low-confidence";
  // Mid AI confidence (0.6 ≤ ai < 0.85): under poor image quality
  // demote to manual-review; otherwise soften to a warning so the
  // reviewer sanity-checks before strict-failing.
  if (imageQualityPoor) return "manual-review";
  return "warning";
}

/**
 * Returns the field's effective status — human override takes precedence
 * over the AI status. Without honoring overrides here the rollup keeps
 * the original AI verdict even after a reviewer has overridden every
 * failed field to pass.
 */
export function effectiveFieldStatus(field: FieldResult): FieldStatus {
  return field.humanOverride?.humanStatus ?? field.status;
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
 * `not-required` rows are inert and don't affect the roll-up. Reads each
 * field's `effectiveFieldStatus` so reviewer overrides flow through.
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
    const status = effectiveFieldStatus(f);
    if (status === "not-required") continue;
    activeCount++;
    switch (status) {
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
