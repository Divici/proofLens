import "server-only";
import { createWorker, type Worker } from "tesseract.js";

/**
 * Tesseract.js OCR wrapper.
 *
 * Lazy-initialises a single English-language worker per Vercel function
 * instance. The worker is reused across calls — first-call latency is
 * dominated by the language-model load (~1–2 s); subsequent calls run in
 * 200–600 ms on a typical bottle label.
 *
 * The wrapper returns:
 *   - `text`  : full OCR transcription
 *   - `words` : per-word tokens with `{x0, y0, x1, y1}` bboxes (Tesseract
 *               native), used by `lib/bbox/locate.ts` to map
 *               LLM `evidenceQuote` strings back to image regions.
 *   - `confidence`: page-level confidence, normalised into `[0, 1]`.
 *
 * Tesseract is the **ground-truth source for the strict gov-warning
 * matcher** — never the LLM. The verification pipeline reads the
 * gov-warning paragraph straight out of `text`/`words` and feeds it
 * through `lib/verify/strict/gov-warning.ts`.
 */

export interface TesseractWord {
  text: string;
  confidence: number; // [0, 1]
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface TesseractResult {
  text: string;
  words: TesseractWord[];
  confidence: number; // [0, 1] — page-level
}

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    // The Tesseract worker logger is noisy by default; silence it for
    // production. `createWorker("eng")` is the modern v5 API and embeds
    // language loading into worker init.
    const worker = await createWorker("eng", undefined, {
      logger: () => {},
    });
    return worker;
  })();
  return workerPromise;
}

/**
 * Test-only escape hatch. Vitest unloads modules between files but Vite's
 * dev server keeps them warm — calling this from the test setup ensures a
 * clean lazy-init path is exercised on every test.
 *
 * Not exported from any production code path — it's referenced solely from
 * tests via the `__resetWorkerForTests` symbol.
 */
export async function __resetWorkerForTests(): Promise<void> {
  if (workerPromise) {
    try {
      const worker = await workerPromise;
      await worker.terminate();
    } catch {
      // ignore — terminate is best-effort during test teardown
    }
  }
  workerPromise = null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/**
 * Run OCR on a single label image buffer.
 *
 * @param buffer JPEG/PNG/WEBP bytes (anything `tesseract.js` can decode).
 * @returns text + word-level bboxes + page confidence.
 */
export async function tesseractExtract(
  buffer: Buffer,
): Promise<TesseractResult> {
  const worker = await getWorker();
  // Tesseract.js accepts a Node Buffer directly. We don't pass a `jobId`
  // because each request is its own one-off job.
  const { data } = await worker.recognize(buffer);

  const rawWords = (data as { words?: unknown }).words;
  const words: TesseractWord[] = Array.isArray(rawWords)
    ? rawWords
        .map((w) => normaliseWord(w))
        .filter((w): w is TesseractWord => w !== null)
    : [];

  const confidenceRaw = typeof data.confidence === "number" ? data.confidence : 0;

  return {
    text: typeof data.text === "string" ? data.text : "",
    words,
    confidence: clamp01(confidenceRaw / 100),
  };
}

/**
 * Tesseract's per-word objects vary slightly between versions. We accept
 * the loose `unknown` shape and pull the four properties we need with
 * defensive typeof checks.
 */
function normaliseWord(raw: unknown): TesseractWord | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as {
    text?: unknown;
    confidence?: unknown;
    bbox?: unknown;
  };
  if (typeof w.text !== "string") return null;
  const trimmed = w.text.trim();
  if (trimmed.length === 0) return null;

  const conf = typeof w.confidence === "number" ? w.confidence : 0;

  if (!w.bbox || typeof w.bbox !== "object") return null;
  const b = w.bbox as {
    x0?: unknown;
    y0?: unknown;
    x1?: unknown;
    y1?: unknown;
  };
  if (
    typeof b.x0 !== "number" ||
    typeof b.y0 !== "number" ||
    typeof b.x1 !== "number" ||
    typeof b.y1 !== "number"
  ) {
    return null;
  }

  return {
    text: w.text,
    confidence: clamp01(conf / 100),
    bbox: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 },
  };
}
