import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAPTURE_MAX_EDGE_PX,
  CAPTURE_JPEG_QUALITY,
  fitToMaxEdge,
  preprocessCapturedImage,
} from "./preprocess-worker";

/**
 * The real worker shells the heavy work to `OffscreenCanvas` /
 * `convertToBlob`. jsdom doesn't ship those, so we cover the public
 * helper surface (sizing math, fallback selection, JPEG defaults) here
 * and rely on the Playwright e2e for the real `OffscreenCanvas` path.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fitToMaxEdge", () => {
  it("scales a wide image down to the max edge", () => {
    expect(fitToMaxEdge(3136, 1568, 1568)).toEqual({ width: 1568, height: 784 });
  });

  it("scales a tall image down to the max edge", () => {
    expect(fitToMaxEdge(1568, 3136, 1568)).toEqual({ width: 784, height: 1568 });
  });

  it("never upscales", () => {
    expect(fitToMaxEdge(800, 600, 1568)).toEqual({ width: 800, height: 600 });
  });

  it("handles a square image at the boundary", () => {
    expect(fitToMaxEdge(1568, 1568, 1568)).toEqual({ width: 1568, height: 1568 });
  });

  it("rounds dimensions to the nearest integer", () => {
    const out = fitToMaxEdge(3000, 2001, 1568);
    expect(Number.isInteger(out.width)).toBe(true);
    expect(Number.isInteger(out.height)).toBe(true);
  });
});

describe("constants", () => {
  it("targets the documented Anthropic vision limit (1568px)", () => {
    expect(CAPTURE_MAX_EDGE_PX).toBe(1568);
  });

  it("uses JPEG quality 0.85 to stay within ~200 KB at 1568px", () => {
    expect(CAPTURE_JPEG_QUALITY).toBeCloseTo(0.85, 5);
  });
});

describe("preprocessCapturedImage (main-thread fallback)", () => {
  it("uses a provided ImageBitmap source and returns a JPEG Blob via canvas", async () => {
    const blob = new Blob(["jpeg"], { type: "image/jpeg" });

    // Stub a 3000×2000 ImageBitmap-shape source so the resize math runs.
    const bitmap = { width: 3000, height: 2000, close: vi.fn() } as unknown as
      ImageBitmap;
    const drawImage = vi.fn();
    const getContext = vi.fn().mockReturnValue({ drawImage });
    const toBlob = vi.fn((cb: (b: Blob) => void) => cb(blob));

    const fakeCanvas = { getContext, toBlob } as unknown as HTMLCanvasElement;

    const result = await preprocessCapturedImage(bitmap, {
      maxEdgePx: 1568,
      quality: 0.85,
      createCanvas: (w, h) => {
        // Canvas mutated by the helper; assert sizing was applied.
        (fakeCanvas as unknown as { width: number }).width = w;
        (fakeCanvas as unknown as { height: number }).height = h;
        return fakeCanvas;
      },
    });

    expect(getContext).toHaveBeenCalledWith("2d");
    expect(drawImage).toHaveBeenCalledOnce();
    expect((fakeCanvas as unknown as { width: number }).width).toBe(1568);
    // 2000 / 3000 * 1568 = 1045.33 → rounded
    expect((fakeCanvas as unknown as { height: number }).height).toBe(1045);
    expect(toBlob).toHaveBeenCalledOnce();
    expect(result.blob).toBe(blob);
    expect(result.width).toBe(1568);
    expect(result.height).toBe(1045);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("rejects when the canvas cannot encode a Blob", async () => {
    const bitmap = { width: 100, height: 100, close: vi.fn() } as unknown as
      ImageBitmap;
    const drawImage = vi.fn();
    const getContext = vi.fn().mockReturnValue({ drawImage });
    const toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(null));
    const fakeCanvas = { getContext, toBlob } as unknown as HTMLCanvasElement;

    await expect(
      preprocessCapturedImage(bitmap, {
        maxEdgePx: 1568,
        quality: 0.85,
        createCanvas: () => fakeCanvas,
      }),
    ).rejects.toThrow(/encode/i);
  });
});
