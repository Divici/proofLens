"use client";

import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Floating action button that appears in the viewport's top-right after
 * verification succeeds. Click → switch to Results tab (handled by the
 * page) and smooth-scroll to the FinalDecisionPanel anchor. The page
 * owns the tab-switching side effect; this component just fires the
 * callback.
 *
 * Intentionally minimal — one fixed-position button, no drawer/menu.
 */

export interface JumpToFinalReviewButtonProps {
  visible: boolean;
  onJump: () => void;
  className?: string;
}

export function JumpToFinalReviewButton({
  visible,
  onJump,
  className,
}: JumpToFinalReviewButtonProps) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onJump}
      aria-label="Jump to final review"
      data-testid="jump-to-final-review"
      className={cn(
        "fixed right-4 top-20 z-40 inline-flex cursor-pointer items-center gap-2 rounded-full",
        "bg-primary text-primary-foreground hover:bg-primary/90",
        "px-4 py-2 text-sm font-medium shadow-lg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "transition-transform hover:-translate-y-0.5",
        className,
      )}
    >
      <CheckCircle2 className="size-4" aria-hidden="true" />
      Jump to final review
    </button>
  );
}
