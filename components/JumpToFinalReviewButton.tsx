"use client";

import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_OVERALL_TONE,
  OVERALL_TONES,
} from "@/lib/verify/overall-tone";
import type { OverallStatus } from "@/lib/verify/types";

/**
 * Floating action button that appears in the viewport's top-right
 * after verification completes. Click → page switches to the Results
 * tab (if not already) and smooth-scrolls to the FinalDecisionPanel
 * anchor.
 *
 * Color matches the overall verdict — emerald for pass, sky for
 * pass-with-warnings, rose for fail, violet for manual-review, orange
 * for request-better-image. The FinalDecisionPanel uses the same tone
 * for its border so the FAB visually points at a same-color zone.
 */

export interface JumpToFinalReviewButtonProps {
  visible: boolean;
  onJump: () => void;
  /**
   * Overall verdict — drives the FAB color. When undefined (pre-verify
   * render windows), falls back to the emerald pass tone — but the FAB
   * is also gated by `visible`, so this default is mostly defensive.
   */
  overall?: OverallStatus;
  className?: string;
}

export function JumpToFinalReviewButton({
  visible,
  onJump,
  overall,
  className,
}: JumpToFinalReviewButtonProps) {
  if (!visible) return null;
  const tone = overall ? OVERALL_TONES[overall] : DEFAULT_OVERALL_TONE;
  return (
    <button
      type="button"
      onClick={onJump}
      aria-label="Jump to final review"
      data-testid="jump-to-final-review"
      className={cn(
        "fixed right-4 top-20 z-40 inline-flex cursor-pointer items-center gap-2 rounded-full",
        // Tone-driven background + hover + shadow tint + focus ring.
        tone.solid,
        "shadow-lg",
        tone.shadow,
        "px-4 py-2 text-sm font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        tone.ring,
        "transition-transform hover:-translate-y-0.5",
        className,
      )}
    >
      <CheckCircle2 className="size-4" aria-hidden="true" />
      Jump to final review
    </button>
  );
}
