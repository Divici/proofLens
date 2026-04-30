import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  exposureSignals,
  EXPOSURE_LOW_LIGHT_MEAN,
  EXPOSURE_OVEREXPOSED_MEAN,
  EXPOSURE_EXTREME_BIN_SHARE,
} from "./exposure";

async function makeUniform(luminance: number): Promise<Buffer> {
  const size = 64;
  const data = Buffer.alloc(size * size, luminance);
  return sharp(data, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toBuffer();
}

async function makeGradient(): Promise<Buffer> {
  // Smooth 0..255 gradient — balanced exposure.
  const size = 64;
  const data = Buffer.alloc(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      data[y * size + x] = Math.round((x / (size - 1)) * 255);
    }
  }
  return sharp(data, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toBuffer();
}

describe("exposureSignals — mean luminance + extreme-bin share", () => {
  it("flags low-light when mean luminance is below the threshold", async () => {
    const buf = await makeUniform(20); // very dark
    const result = await exposureSignals(buf);
    expect(result.meanLuminance).toBeLessThan(EXPOSURE_LOW_LIGHT_MEAN);
    expect(result.flags).toContain("low-light");
  });

  it("flags glare when mean luminance is above the overexposed threshold", async () => {
    const buf = await makeUniform(245); // washed out
    const result = await exposureSignals(buf);
    expect(result.meanLuminance).toBeGreaterThan(EXPOSURE_OVEREXPOSED_MEAN);
    expect(result.flags).toContain("glare");
  });

  it("does not flag a balanced gradient image", async () => {
    const buf = await makeGradient();
    const result = await exposureSignals(buf);
    expect(result.flags).not.toContain("low-light");
    expect(result.flags).not.toContain("glare");
    // Mean of a 0..255 gradient is ~127.5.
    expect(result.meanLuminance).toBeGreaterThan(100);
    expect(result.meanLuminance).toBeLessThan(160);
  });

  it("flags glare when ≥ X% of pixels saturate the top luminance bins", async () => {
    // 75% saturated pixels, 25% mid-grey — mean alone might miss this
    // but the extreme-bin share catches it.
    const size = 64;
    const data = Buffer.alloc(size * size);
    for (let i = 0; i < data.length; i++) {
      data[i] = i < (data.length * 3) / 4 ? 252 : 100;
    }
    const buf = await sharp(data, {
      raw: { width: size, height: size, channels: 1 },
    })
      .png()
      .toBuffer();
    const result = await exposureSignals(buf);
    expect(result.extremeBinShare).toBeGreaterThan(
      EXPOSURE_EXTREME_BIN_SHARE,
    );
    expect(result.flags).toContain("glare");
  });

  it("thresholds are positive named constants", () => {
    expect(EXPOSURE_LOW_LIGHT_MEAN).toBeGreaterThan(0);
    expect(EXPOSURE_OVEREXPOSED_MEAN).toBeGreaterThan(EXPOSURE_LOW_LIGHT_MEAN);
    expect(EXPOSURE_EXTREME_BIN_SHARE).toBeGreaterThan(0);
    expect(EXPOSURE_EXTREME_BIN_SHARE).toBeLessThan(1);
  });
});
