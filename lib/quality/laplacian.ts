import "server-only";
import sharp from "sharp";

/**
 * Blur detection via Laplacian-of-grayscale variance.
 *
 * The Laplacian (a discrete second-derivative operator) responds strongly
 * to edges and weakly to flat regions. The variance of the Laplacian
 * across a whole image is a long-standing focus-quality metric — Pech-
 * Pacheco et al. (2000), "Diatom autofocusing in brightfield microscopy:
 * a comparative study" — and is widely used in OpenCV blur-detection
 * recipes (e.g. Adrian Rosebrock, PyImageSearch).
 *
 * We compute it without an external CV dependency:
 *   1. Convert to single-channel grayscale via sharp's `greyscale()` +
 *      `raw()` so we get a `Uint8Array` of luminance bytes.
 *   2. Apply the 3×3 Laplacian kernel
 *
 *        [  0  -1   0 ]
 *        [ -1   4  -1 ]
 *        [  0  -1   0 ]
 *
 *      across every interior pixel; clamp at edges by skipping the
 *      one-pixel border (cheap and accurate enough for thresholding).
 *   3. Compute the variance of the resulting per-pixel responses.
 *
 * The threshold below was tuned against the slice 0004 fixture set
 * (a 256x256 high-contrast checkerboard yields variance > 8000; the
 * same image after sharp's blur(8) yields variance < 50). 100 sits
 * comfortably between.
 */

/**
 * Laplacian-variance threshold below which an image is flagged as blurry.
 *
 * Tuned against the synthetic test fixtures and the slice-0009 demo set
 * (sharp screenshots: ~1k+; blurred demo: <100). The value is intentionally
 * conservative — false-positives are recoverable (operator can override),
 * false-negatives let a blurry label through to OCR.
 */
export const LAPLACIAN_BLUR_THRESHOLD = 100;

export async function laplacianVariance(input: Buffer): Promise<number> {
  // Convert to single-channel grayscale and grab the raw bytes.
  const { data, info } = await sharp(input)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  if (width < 3 || height < 3) {
    // Degenerate input — return 0 (treated as blurry by the caller).
    return 0;
  }

  // Apply the 3x3 Laplacian kernel and accumulate stats in a single pass.
  // We compute responses for the (width-2) × (height-2) interior region.
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowAbove = (y - 1) * width;
    const rowMid = y * width;
    const rowBelow = (y + 1) * width;
    for (let x = 1; x < width - 1; x++) {
      const center = data[rowMid + x] ?? 0;
      const top = data[rowAbove + x] ?? 0;
      const bottom = data[rowBelow + x] ?? 0;
      const left = data[rowMid + x - 1] ?? 0;
      const right = data[rowMid + x + 1] ?? 0;
      const lap = 4 * center - top - bottom - left - right;
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  // Numerical safety: clamp tiny negatives that arise from floating point
  // catastrophic cancellation on near-uniform images.
  return Math.max(0, variance);
}
