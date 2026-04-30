import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  analyzeImageQuality,
  parseLlmQualityNotes,
} from "./heuristics";

async function makeUniform(luminance: number): Promise<Buffer> {
  const size = 64;
  const data = Buffer.alloc(size * size, luminance);
  return sharp(data, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toBuffer();
}

async function makeSharpEdges(): Promise<Buffer> {
  const size = 256;
  const cell = 8;
  const data = Buffer.alloc(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      data[y * size + x] =
        (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 255 : 0;
    }
  }
  return sharp(data, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toBuffer();
}

async function makeBlurry(): Promise<Buffer> {
  const sharpBuf = await makeSharpEdges();
  return sharp(sharpBuf).blur(8).png().toBuffer();
}

async function makeBalanced(): Promise<Buffer> {
  // Smooth 0..255 gradient at 256x256 — sharp enough for Laplacian
  // (high variance from the gradient steps) and balanced exposure-wise
  // (mean ~127, no bin saturation).
  const size = 256;
  const data = Buffer.alloc(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Add a small fine-grained pattern to keep Laplacian variance high.
      const base = Math.round((x / (size - 1)) * 255);
      const wiggle = (x + y) % 2 === 0 ? 0 : 8;
      data[y * size + x] = Math.max(0, Math.min(255, base - wiggle));
    }
  }
  return sharp(data, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toBuffer();
}

describe("parseLlmQualityNotes — regex-extract structured flags from prose", () => {
  it("extracts blur from a note mentioning blurry text", () => {
    expect(parseLlmQualityNotes(["The label is slightly blurry."])).toEqual([
      "blur",
    ]);
  });

  it("extracts glare and low-light from notes that mention both", () => {
    const flags = parseLlmQualityNotes([
      "Glare from a flash spot.",
      "The bottom-right is in low light / shadow.",
    ]);
    expect(flags).toContain("glare");
    expect(flags).toContain("low-light");
  });

  it("extracts skew/perspective and cropping from typical notes", () => {
    expect(
      parseLlmQualityNotes(["Image is taken at an angle (skewed)."]),
    ).toContain("skew");
    expect(
      parseLlmQualityNotes(["Top edge is cropped off."]),
    ).toContain("cropping");
  });

  it("extracts low-resolution and obstruction", () => {
    expect(
      parseLlmQualityNotes(["The crop is low resolution / pixelated."]),
    ).toContain("low-resolution");
    expect(
      parseLlmQualityNotes(["Fingers obstruct part of the warning."]),
    ).toContain("obstruction");
  });

  it("extracts multiple-labels", () => {
    expect(
      parseLlmQualityNotes(["The frame contains multiple labels."]),
    ).toContain("multiple-labels");
  });

  it("returns an empty list when no recognised keyword fires", () => {
    expect(
      parseLlmQualityNotes(["Looks great, no issues detected."]),
    ).toEqual([]);
  });

  it("dedupes overlapping mentions", () => {
    const flags = parseLlmQualityNotes([
      "blurry edge",
      "definitely blurry",
      "blur on left",
    ]);
    expect(flags).toEqual(["blur"]);
  });
});

describe("analyzeImageQuality — heuristics + LLM-notes merged + deduped", () => {
  it("merges Laplacian-flagged blur with LLM-flagged glare into a single deduped list", async () => {
    const buf = await makeBlurry();
    const result = await analyzeImageQuality(buf, [
      "Strong glare on the front label.",
    ]);
    expect(result.flags).toContain("blur");
    expect(result.flags).toContain("glare");
    expect(result.poor).toBe(true);
    // No duplicate entries.
    const unique = new Set(result.flags);
    expect(unique.size).toBe(result.flags.length);
  });

  it("dedupes when both heuristics + LLM raise the same flag", async () => {
    const buf = await makeUniform(20); // low-light
    const result = await analyzeImageQuality(buf, [
      "Image is dim / low light",
    ]);
    expect(result.flags.filter((f) => f === "low-light")).toHaveLength(1);
  });

  it("returns empty flags for a clean balanced image", async () => {
    const buf = await makeBalanced();
    const result = await analyzeImageQuality(buf, []);
    expect(result.poor).toBe(false);
    expect(result.flags).toHaveLength(0);
  });

  it("records source attribution per flag", async () => {
    const buf = await makeUniform(245); // glare from heuristic
    const result = await analyzeImageQuality(buf, [
      "Bottom is cropped.", // cropping from LLM
    ]);
    const glareSource = result.sources.find((s) => s.flag === "glare");
    const cropSource = result.sources.find((s) => s.flag === "cropping");
    expect(glareSource?.source).toBe("heuristic");
    expect(cropSource?.source).toBe("llm-notes");
  });

  it("includes raw signal values for diagnostics", async () => {
    const buf = await makeBlurry();
    const result = await analyzeImageQuality(buf, []);
    expect(result.signals.laplacianVariance).not.toBeNull();
    expect(result.signals.meanLuminance).not.toBeNull();
    expect(result.signals.extremeBinShare).not.toBeNull();
  });
});
