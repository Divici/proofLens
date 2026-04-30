/**
 * Image-quality flag enum (PRD R-011).
 *
 * The flag set is closed: every recognised image-quality concern maps to
 * exactly one of these values. The set is small enough to keep the UI
 * banner readable; richer detail (per-region) lives in the heuristic
 * outputs themselves.
 *
 * The status engine demotes any non-Pass cell to "Needs Manual Review"
 * when at least one flag is present (see `lib/verify/status-engine.ts`).
 */

export const IMAGE_QUALITY_FLAGS = [
  "blur",
  "glare",
  "low-light",
  "skew",
  "cropping",
  "low-resolution",
  "obstruction",
  "multiple-labels",
] as const;

export type ImageQualityFlag = (typeof IMAGE_QUALITY_FLAGS)[number];

export interface ImageQualityResult {
  /** Deduped, ordered list of detected flags. */
  flags: ImageQualityFlag[];
  /** True if any flag is present — drives the status-engine override. */
  poor: boolean;
  /**
   * Per-heuristic raw signals, retained for diagnostics + future tuning.
   * The UI does not surface these directly; they back the audit log.
   */
  signals: {
    laplacianVariance: number | null;
    meanLuminance: number | null;
    extremeBinShare: number | null;
  };
  /** Source attribution for each flag — heuristic vs LLM-notes. */
  sources: Array<{
    flag: ImageQualityFlag;
    source: "heuristic" | "llm-notes";
  }>;
}

/**
 * Display labels for the per-flag chips on the verification detail
 * banner. Keep terse — the banner is a single horizontal row.
 */
export const FLAG_LABELS: Record<ImageQualityFlag, string> = {
  blur: "Blur",
  glare: "Glare",
  "low-light": "Low light",
  skew: "Skew",
  cropping: "Cropping",
  "low-resolution": "Low resolution",
  obstruction: "Obstruction",
  "multiple-labels": "Multiple labels",
};
