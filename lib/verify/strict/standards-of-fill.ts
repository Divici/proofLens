import type { BeverageType } from "@/lib/ai/schema";

/**
 * TTB authorized standards of fill for wine and distilled spirits.
 *
 * Sources (verbatim from research-findings/01-ttb-regulatory.md §Q5):
 *   - Wine: 27 CFR § 4.72 (T.D. TTB-200, eff. 2025-01-10)
 *   - Spirits: 27 CFR § 5.203 (T.D. TTB-200, eff. 2025-01-10)
 *
 * Malt beverages (§ 7.70) have no fixed list — they use US customary
 * units. We return true for malt unconditionally so the warning never
 * fires for them.
 *
 * "Unknown / other" returns true to avoid false-flagging unclassified
 * products. The reviewer can re-classify and re-run if needed.
 *
 * Wine authorizes sizes > 3 L in even-liter increments (4 L, 5 L,
 * etc.); we encode this with a separate predicate.
 */

const WINE_SIZES_ML: ReadonlyArray<number> = [
  3000, 2250, 1800, 1500, 1000, 750, 720, 700, 620, 600, 568, 550, 500,
  473, 375, 360, 355, 330, 300, 250, 200, 187, 180, 100, 50,
];

const SPIRITS_SIZES_ML: ReadonlyArray<number> = [
  3750, 3000, 2000, 1800, 1750, 1500, 1000, 945, 900, 750, 720, 710, 700,
  570, 500, 475, 375, 355, 350, 331, 250, 200, 187, 100, 50,
];

const FLOAT_TOLERANCE_ML = 0.5;

function nearlyEquals(a: number, b: number): boolean {
  return Math.abs(a - b) <= FLOAT_TOLERANCE_ML;
}

function isAuthorizedWineSize(volumeMl: number): boolean {
  if (WINE_SIZES_ML.some((v) => nearlyEquals(v, volumeMl))) return true;
  // Even-liter increments above 3 L.
  if (volumeMl > 3000) {
    const remainder = volumeMl % 1000;
    if (
      remainder <= FLOAT_TOLERANCE_ML ||
      remainder >= 1000 - FLOAT_TOLERANCE_ML
    ) {
      return true;
    }
  }
  return false;
}

function isAuthorizedSpiritsSize(volumeMl: number): boolean {
  return SPIRITS_SIZES_ML.some((v) => nearlyEquals(v, volumeMl));
}

export function isAuthorizedFillSize(
  volumeMl: number,
  beverageType: BeverageType,
): boolean {
  if (beverageType === "wine") return isAuthorizedWineSize(volumeMl);
  if (beverageType === "distilled-spirits")
    return isAuthorizedSpiritsSize(volumeMl);
  // Malt + unknown: pass through.
  return true;
}
