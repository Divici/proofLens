// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { preprocess, MAX_LONGEST_EDGE } from "./preprocess";

async function makeImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 60, b: 40 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function makeRotatedImage(): Promise<Buffer> {
  // 100×200 portrait stored with EXIF orientation 6 (CW 90°). When we rotate
  // by EXIF on read, the result must be 200×100 landscape.
  const buffer = await sharp({
    create: {
      width: 100,
      height: 200,
      channels: 3,
      background: { r: 0, g: 100, b: 0 },
    },
  })
    .jpeg({ quality: 90 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  return buffer;
}

describe("preprocess", () => {
  it("returns JPEG bytes regardless of input format", async () => {
    const png = await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 3,
        background: { r: 50, g: 60, b: 70 },
      },
    })
      .png()
      .toBuffer();

    const result = await preprocess(png);

    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("jpeg");
    expect(result.processedSizeBytes).toBe(result.buffer.byteLength);
  });

  it("resizes oversized images so the longest edge is ≤ MAX_LONGEST_EDGE", async () => {
    const big = await makeImage(3000, 2000);

    const result = await preprocess(big);

    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(
      MAX_LONGEST_EDGE,
    );
    // Aspect ratio preserved within rounding.
    const ratioIn = 3000 / 2000;
    const ratioOut = result.width / result.height;
    expect(Math.abs(ratioIn - ratioOut)).toBeLessThan(0.01);
  });

  it("passes through images already within bounds without upscaling", async () => {
    const small = await makeImage(800, 600);

    const result = await preprocess(small);

    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it("applies EXIF rotation so portrait+orientation:6 becomes landscape", async () => {
    const rotated = await makeRotatedImage();

    const result = await preprocess(rotated);

    // After rotate(): pixel content is landscape 200×100.
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
  });

  it("encodes JPEG output at quality 85", async () => {
    const big = await makeImage(2000, 1500);

    const result = await preprocess(big);

    // JPEG quantization tables vary across encoders; we round-trip through
    // sharp and check that recompressing at q85 yields ~same bytes.
    const recompressed = await sharp(result.buffer).jpeg({ quality: 85 }).toBuffer();
    // Allow up to 5% size delta between two q85 passes.
    const delta = Math.abs(recompressed.byteLength - result.buffer.byteLength);
    const ratio = delta / result.buffer.byteLength;
    expect(ratio).toBeLessThan(0.05);
  });

  it("reports both originalSizeBytes and processedSizeBytes", async () => {
    const big = await makeImage(2400, 1800);

    const result = await preprocess(big);

    expect(result.originalSizeBytes).toBe(big.byteLength);
    expect(result.processedSizeBytes).toBeGreaterThan(0);
    // A 2400×1800 image compressed to ≤1568 + q85 should be smaller.
    expect(result.processedSizeBytes).toBeLessThan(result.originalSizeBytes);
  });
});
