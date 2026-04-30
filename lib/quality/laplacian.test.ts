import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  laplacianVariance,
  LAPLACIAN_BLUR_THRESHOLD,
} from "./laplacian";

/**
 * The Laplacian-variance test uses dynamically-generated fixtures so the
 * test corpus stays in source rather than carrying binary blobs.
 *
 * `sharp({ create })` builds a synthetic checkerboard for the "sharp"
 * fixture (high-frequency edges → high variance) and applies a strong
 * Gaussian blur for the "blurry" fixture (smoothed → low variance).
 */

async function makeSharpEdges(): Promise<Buffer> {
  // 256×256 black/white 8-px checkerboard — lots of high-contrast edges.
  const size = 256;
  const cell = 8;
  const channels = 1;
  const data = Buffer.alloc(size * size * channels);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const isWhite = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      data[y * size + x] = isWhite ? 255 : 0;
    }
  }
  return sharp(data, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toBuffer();
}

async function makeBlurry(): Promise<Buffer> {
  const sharpBuf = await makeSharpEdges();
  // Heavy Gaussian blur — pixel intensities lose their high-frequency
  // content, so the Laplacian convolution returns near-zero values.
  return sharp(sharpBuf).blur(8).png().toBuffer();
}

describe("laplacianVariance", () => {
  it("returns a high variance for a sharp high-contrast image", async () => {
    const buf = await makeSharpEdges();
    const variance = await laplacianVariance(buf);
    expect(variance).toBeGreaterThan(LAPLACIAN_BLUR_THRESHOLD);
  });

  it("returns a low variance for a heavily-blurred image", async () => {
    const buf = await makeBlurry();
    const variance = await laplacianVariance(buf);
    expect(variance).toBeLessThan(LAPLACIAN_BLUR_THRESHOLD);
  });

  it("threshold is a positive named constant with rationale", () => {
    expect(LAPLACIAN_BLUR_THRESHOLD).toBeGreaterThan(0);
    // Sanity-check the order of magnitude. Empirically tuned against the
    // synthetic fixtures: sharp checkerboard → ~thousands, heavy blur →
    // single digits. Threshold should sit comfortably between.
    expect(LAPLACIAN_BLUR_THRESHOLD).toBeLessThan(1000);
  });
});
