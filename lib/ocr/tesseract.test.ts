// @vitest-environment node
import { describe, expect, it, vi, afterEach } from "vitest";

// Tesseract.js is heavyweight (loads an English language model on first
// init and starts a worker). We mock the entire module so the test runs
// in <100 ms and stays deterministic.
vi.mock("tesseract.js", () => {
  const recognize = vi.fn();
  const terminate = vi.fn();
  const setLogger = vi.fn();

  const createWorker = vi.fn(async () => ({
    recognize,
    terminate,
    setLogger,
  }));

  return {
    default: { createWorker },
    createWorker,
    __mock: { recognize, terminate, createWorker },
  };
});

// Re-export the mock handles so tests can drive them.
import * as tesseract from "tesseract.js";
const mock = (tesseract as unknown as {
  __mock: {
    recognize: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    createWorker: ReturnType<typeof vi.fn>;
  };
}).__mock;

afterEach(async () => {
  vi.clearAllMocks();
  // Reset the cached worker between tests so the lazy-init path is
  // exercised on every test.
  const mod = await import("./tesseract");
  await mod.__resetWorkerForTests();
});

describe("lib/ocr/tesseract", () => {
  it("returns text + word-level bboxes + confidence on a happy path", async () => {
    mock.recognize.mockResolvedValueOnce({
      data: {
        text: "OLD TOM DISTILLERY\n",
        confidence: 92,
        words: [
          {
            text: "OLD",
            confidence: 95,
            bbox: { x0: 100, y0: 200, x1: 160, y1: 240 },
          },
          {
            text: "TOM",
            confidence: 94,
            bbox: { x0: 170, y0: 200, x1: 240, y1: 240 },
          },
          {
            text: "DISTILLERY",
            confidence: 88,
            bbox: { x0: 250, y0: 200, x1: 460, y1: 240 },
          },
        ],
      },
    });

    const { tesseractExtract } = await import("./tesseract");

    const result = await tesseractExtract(Buffer.from("fakejpeg"));

    expect(result.text).toBe("OLD TOM DISTILLERY\n");
    expect(result.confidence).toBeCloseTo(0.92, 2);
    expect(result.words).toHaveLength(3);
    expect(result.words[0]).toEqual({
      text: "OLD",
      confidence: 0.95,
      bbox: { x0: 100, y0: 200, x1: 160, y1: 240 },
    });
  });

  it("reuses a single worker across calls (lazy init)", async () => {
    mock.recognize.mockResolvedValue({
      data: { text: "", confidence: 50, words: [] },
    });

    const { tesseractExtract } = await import("./tesseract");

    await tesseractExtract(Buffer.from("a"));
    await tesseractExtract(Buffer.from("b"));
    await tesseractExtract(Buffer.from("c"));

    expect(mock.createWorker).toHaveBeenCalledTimes(1);
    expect(mock.recognize).toHaveBeenCalledTimes(3);
  });

  it("normalises confidence into the [0, 1] range", async () => {
    mock.recognize.mockResolvedValueOnce({
      data: {
        text: "X",
        confidence: 0,
        words: [
          { text: "X", confidence: 0, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } },
        ],
      },
    });

    const { tesseractExtract } = await import("./tesseract");
    const result = await tesseractExtract(Buffer.from("x"));
    expect(result.confidence).toBe(0);
    expect(result.words[0]?.confidence).toBe(0);
  });

  it("filters empty / whitespace-only word entries (Tesseract is noisy)", async () => {
    mock.recognize.mockResolvedValueOnce({
      data: {
        text: "HELLO",
        confidence: 99,
        words: [
          {
            text: "HELLO",
            confidence: 99,
            bbox: { x0: 0, y0: 0, x1: 100, y1: 30 },
          },
          { text: "   ", confidence: 0, bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } },
          { text: "", confidence: 0, bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } },
        ],
      },
    });

    const { tesseractExtract } = await import("./tesseract");
    const result = await tesseractExtract(Buffer.from("h"));
    expect(result.words).toHaveLength(1);
    expect(result.words[0]?.text).toBe("HELLO");
  });
});
