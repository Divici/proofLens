import "server-only";
import sharp from "sharp";
import type { ImageQualityFlag } from "./types";

/**
 * Histogram-based exposure heuristics.
 *
 * Two signals drive the `low-light` / `glare` flags:
 *   1. **Mean luminance** — a global average across the grayscale frame.
 *      Very dark images (mean < 50) are flagged `low-light`; very bright
 *      images (mean > 220) are flagged `glare`.
 *   2. **Extreme-bin share** — fraction of pixels in the top 8 of 256
 *      luminance bins. Used to catch hot spots even when the rest of the
 *      frame is mid-tone — a flash glint on a bottle, for example.
 *
 * The thresholds are tuned against the slice 0004 demo set: a candle-lit
 * shot (~40 mean) trips low-light, a glare-blown demo (~245 mean) trips
 * glare, and the balanced `01-spirits-pass` placeholder sits ~127.
 */

/** Mean luminance ≤ this → flag `low-light`. Tuned against demo fixtures. */
export const EXPOSURE_LOW_LIGHT_MEAN = 50;
/** Mean luminance ≥ this → flag `glare` (overexposed). Tuned similarly. */
export const EXPOSURE_OVEREXPOSED_MEAN = 220;
/**
 * Fraction of pixels in the top 8/256 luminance bins. Above this share
 * we flag `glare` even if the global mean is unremarkable — captures
 * hot spots on otherwise mid-tone labels.
 */
export const EXPOSURE_EXTREME_BIN_SHARE = 0.4;

/**
 * Top luminance band considered "saturated". 248 ≤ x ≤ 255 = 8 bins.
 * Standard 8-bit JPEG glare lands here.
 */
export const EXPOSURE_TOP_BIN_LOW = 248;

export interface ExposureResult {
  meanLuminance: number;
  /** Fraction of pixels with luminance ≥ EXPOSURE_TOP_BIN_LOW. */
  extremeBinShare: number;
  flags: ImageQualityFlag[];
}

export async function exposureSignals(input: Buffer): Promise<ExposureResult> {
  const { data, info } = await sharp(input)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const totalPixels = info.width * info.height;
  if (totalPixels === 0) {
    return { meanLuminance: 0, extremeBinShare: 0, flags: [] };
  }

  let sum = 0;
  let extreme = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i] ?? 0;
    sum += v;
    if (v >= EXPOSURE_TOP_BIN_LOW) extreme++;
  }

  const meanLuminance = sum / totalPixels;
  const extremeBinShare = extreme / totalPixels;

  const flags: ImageQualityFlag[] = [];
  if (meanLuminance <= EXPOSURE_LOW_LIGHT_MEAN) {
    flags.push("low-light");
  }
  if (
    meanLuminance >= EXPOSURE_OVEREXPOSED_MEAN ||
    extremeBinShare >= EXPOSURE_EXTREME_BIN_SHARE
  ) {
    flags.push("glare");
  }

  return { meanLuminance, extremeBinShare, flags };
}
