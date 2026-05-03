import type { OverallStatus } from "./types";

/**
 * CTA-ish color tokens per overall verdict — shared by the
 * JumpToFinalReviewButton (the floating action button) and the
 * FinalDecisionPanel border so the FAB visually points at a
 * same-color zone.
 *
 * Tone choices mirror the per-result palette already used by
 * VerificationDetail's verdict pill (`OVERALL_VISUALS`):
 *   - pass → emerald (positive go-ahead)
 *   - pass-with-warnings → sky (informational caution)
 *   - fail → rose (regulatory rejection)
 *   - needs-manual-review → violet (human judgment required)
 *   - request-better-image → orange (image quality issue)
 *
 * Each entry exposes Tailwind class fragments for:
 *   - `solid`       : FAB background + hover (saturated)
 *   - `shadow`      : FAB drop-shadow tint
 *   - `ring`        : FAB focus-visible ring color
 *   - `border`      : FinalDecisionPanel border color
 *   - `panelRing`   : FinalDecisionPanel inner ring
 *   - `panelBg`     : FinalDecisionPanel surface tint
 */
export interface OverallTone {
  solid: string;
  shadow: string;
  ring: string;
  border: string;
  panelRing: string;
  panelBg: string;
}

export const OVERALL_TONES: Record<OverallStatus, OverallTone> = {
  pass: {
    solid: "bg-emerald-600 text-white hover:bg-emerald-700",
    shadow: "shadow-emerald-600/25",
    ring: "focus-visible:ring-emerald-400",
    border: "border-emerald-500/50",
    panelRing: "ring-emerald-500/15",
    panelBg: "bg-emerald-50/40 dark:bg-emerald-500/5",
  },
  "pass-with-warnings": {
    solid: "bg-sky-600 text-white hover:bg-sky-700",
    shadow: "shadow-sky-600/25",
    ring: "focus-visible:ring-sky-400",
    border: "border-sky-500/50",
    panelRing: "ring-sky-500/15",
    panelBg: "bg-sky-50/40 dark:bg-sky-500/5",
  },
  fail: {
    solid: "bg-rose-600 text-white hover:bg-rose-700",
    shadow: "shadow-rose-600/25",
    ring: "focus-visible:ring-rose-400",
    border: "border-rose-500/50",
    panelRing: "ring-rose-500/15",
    panelBg: "bg-rose-50/40 dark:bg-rose-500/5",
  },
  "needs-manual-review": {
    solid: "bg-violet-600 text-white hover:bg-violet-700",
    shadow: "shadow-violet-600/25",
    ring: "focus-visible:ring-violet-400",
    border: "border-violet-500/50",
    panelRing: "ring-violet-500/15",
    panelBg: "bg-violet-50/40 dark:bg-violet-500/5",
  },
  "request-better-image": {
    solid: "bg-orange-600 text-white hover:bg-orange-700",
    shadow: "shadow-orange-600/25",
    ring: "focus-visible:ring-orange-400",
    border: "border-orange-500/50",
    panelRing: "ring-orange-500/15",
    panelBg: "bg-orange-50/40 dark:bg-orange-500/5",
  },
};

/**
 * Default tone — used before a verdict is known (e.g., the FAB renders
 * with `visible=false` in that case so this default is mostly a safety
 * net for the FinalDecisionPanel during the brief render-after-mount
 * window). Defaulting to the emerald pass tone keeps the look stable
 * for the most common case.
 */
export const DEFAULT_OVERALL_TONE: OverallTone = OVERALL_TONES["pass"];
