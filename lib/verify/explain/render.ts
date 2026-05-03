import type { FieldStatus, RuleOutcome } from "@/lib/verify/types";
import { applyTemplate } from "./templates";

/**
 * Render a primary explanation string from a `RuleOutcome`. The renderer
 * delegates to the template registry — same inputs always produce the
 * same string.
 */
export function renderExplanation(outcome: RuleOutcome): string {
  return applyTemplate(outcome);
}

/**
 * Suggested-action prose per status. Short imperative phrasing matched to
 * the badge's verbal weight. When `imageQualityPoor` is true, manual-
 * review and low-confidence rows surface the canonical "Request Better
 * Image" copy that the PRD §19 image-quality scenarios call out — UNLESS
 * the deterministic matcher already validated the value, in which case
 * the softer "spot-check" message reads more honestly than asking for a
 * better image when we already know the value matches.
 */
export const REQUEST_BETTER_IMAGE_ACTION =
  "Request Better Image — image quality is too low for confident verification.";

export const SPOT_CHECK_VALIDATED_ACTION =
  "Image quality is low — spot-check the artwork; the value matches the expected entry.";

export function suggestedActionFor(
  status: FieldStatus,
  imageQualityPoor = false,
  matchValidated = false,
): string {
  if (
    imageQualityPoor &&
    (status === "manual-review" || status === "low-confidence")
  ) {
    return matchValidated
      ? SPOT_CHECK_VALIDATED_ACTION
      : REQUEST_BETTER_IMAGE_ACTION;
  }
  switch (status) {
    case "pass":
      return "No action needed.";
    case "likely-match":
      return "Spot-check the label image to confirm the match.";
    case "warning":
      return "Review the label and confirm whether to accept this difference.";
    case "fail":
      return "Reject the application or request a corrected label.";
    case "missing":
      return "Confirm the field is genuinely absent and decide whether to reject.";
    case "low-confidence":
      return "Request a higher-quality image of the label.";
    case "manual-review":
      return "Manual review required — see the explanation for context.";
    case "not-required":
      return "No action needed — informational only.";
    default:
      return "";
  }
}
