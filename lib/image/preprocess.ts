import "server-only";
import sharp from "sharp";

/**
 * Server-side image preprocessing for label uploads.
 *
 * Pipeline (in order):
 *   1. `rotate()` — corrects EXIF orientation, then strips the metadata
 *       so the on-the-wire bytes have a true upright orientation.
 *   2. `resize()` — downscales so the longest edge ≤ MAX_LONGEST_EDGE
 *       (1568 px). Smaller images pass through; we never upscale.
 *   3. `jpeg({ quality: 85 })` — re-encodes as JPEG q85 for OpenRouter.
 *
 * The buffer is held in memory only; we never write a temp file. This
 * keeps the API route compatible with the stateless-server requirement.
 */

export const MAX_LONGEST_EDGE = 1568;
const JPEG_QUALITY = 85;

export interface PreprocessResult {
  buffer: Buffer;
  width: number;
  height: number;
  originalSizeBytes: number;
  processedSizeBytes: number;
}

export async function preprocess(input: Buffer): Promise<PreprocessResult> {
  const originalSizeBytes = input.byteLength;

  const pipeline = sharp(input, { failOn: "error" })
    .rotate() // EXIF auto-rotate
    .resize({
      width: MAX_LONGEST_EDGE,
      height: MAX_LONGEST_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: false });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    width: info.width,
    height: info.height,
    originalSizeBytes,
    processedSizeBytes: data.byteLength,
  };
}
