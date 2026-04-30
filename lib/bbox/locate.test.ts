import { describe, expect, it } from "vitest";
import { locateBboxForQuote } from "./locate";
import type { TesseractWord } from "@/lib/ocr/tesseract";

const WORDS: TesseractWord[] = [
  { text: "GOVERNMENT", confidence: 0.95, bbox: { x0: 100, y0: 800, x1: 280, y1: 830 } },
  { text: "WARNING:", confidence: 0.94, bbox: { x0: 290, y0: 800, x1: 420, y1: 830 } },
  { text: "(1)", confidence: 0.88, bbox: { x0: 100, y0: 840, x1: 130, y1: 870 } },
  { text: "According", confidence: 0.92, bbox: { x0: 140, y0: 840, x1: 280, y1: 870 } },
  { text: "to", confidence: 0.91, bbox: { x0: 290, y0: 840, x1: 320, y1: 870 } },
  { text: "the", confidence: 0.91, bbox: { x0: 330, y0: 840, x1: 370, y1: 870 } },
  { text: "Surgeon", confidence: 0.92, bbox: { x0: 380, y0: 840, x1: 470, y1: 870 } },
  { text: "General,", confidence: 0.9, bbox: { x0: 480, y0: 840, x1: 580, y1: 870 } },
];

describe("locateBboxForQuote", () => {
  it("returns the union polygon when the quote matches a contiguous run of words", () => {
    const result = locateBboxForQuote("Surgeon General", WORDS, {
      imageWidth: 1024,
      imageHeight: 1280,
    });
    expect(result).not.toBeNull();
    expect(result).toEqual(
      expect.objectContaining({
        x0: 380,
        y0: 840,
        x1: 580,
        y1: 870,
        imageWidth: 1024,
        imageHeight: 1280,
      }),
    );
  });

  it("matches a single-word quote", () => {
    const result = locateBboxForQuote("WARNING", WORDS, {
      imageWidth: 1024,
      imageHeight: 1280,
    });
    expect(result).not.toBeNull();
    expect(result?.x0).toBe(290);
    expect(result?.x1).toBe(420);
  });

  it("matches case-insensitively after normalisation", () => {
    const result = locateBboxForQuote("surgeon general", WORDS, {
      imageWidth: 1024,
      imageHeight: 1280,
    });
    expect(result).not.toBeNull();
    expect(result?.x0).toBe(380);
  });

  it("returns null when the quote is not present", () => {
    const result = locateBboxForQuote("United States", WORDS, {
      imageWidth: 1024,
      imageHeight: 1280,
    });
    expect(result).toBeNull();
  });

  it("returns null on empty input quote", () => {
    expect(
      locateBboxForQuote("", WORDS, {
        imageWidth: 1024,
        imageHeight: 1280,
      }),
    ).toBeNull();
  });

  it("returns null when the word list is empty", () => {
    expect(
      locateBboxForQuote("anything", [], {
        imageWidth: 1024,
        imageHeight: 1280,
      }),
    ).toBeNull();
  });

  it("matches a multi-word quote that begins the warning", () => {
    const result = locateBboxForQuote(
      "GOVERNMENT WARNING: (1)",
      WORDS,
      { imageWidth: 1024, imageHeight: 1280 },
    );
    expect(result).not.toBeNull();
    expect(result?.x0).toBe(100);
    expect(result?.x1).toBe(420);
  });

  it("includes imageWidth and imageHeight in the result", () => {
    const result = locateBboxForQuote("Surgeon", WORDS, {
      imageWidth: 800,
      imageHeight: 600,
    });
    expect(result?.imageWidth).toBe(800);
    expect(result?.imageHeight).toBe(600);
  });
});
