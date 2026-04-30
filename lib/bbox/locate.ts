import type { TesseractWord } from "@/lib/ocr/tesseract";
import type { BoundingBox } from "@/lib/verify/types";

/**
 * Locate a quoted text fragment in a stream of Tesseract OCR words and
 * return the union bounding box of the matching run.
 *
 * Algorithm — strict exact-match first (per the slice 0003 deviation note
 * in the spec): tokenise the quote, walk the word list with a sliding
 * window of size N (= number of quote tokens), normalise each candidate
 * window the same way the quote is normalised, and return the union bbox
 * of the first window that matches token-for-token.
 *
 * If no window matches, return `null`. (TODO: fuzzy fallback at 0.85
 * threshold — punted to a follow-up as agreed in the spec's "reasonable
 * deviations" section.)
 *
 * Normalisation = NFKC + lowercase + strip non-alphanumeric — matches the
 * style used by the nuanced ladder so an `evidenceQuote` and a Tesseract
 * word stream that look "the same to a human" map together.
 */

function normaliseToken(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function tokenise(text: string): string[] {
  return text
    .split(/\s+/)
    .map((t) => normaliseToken(t))
    .filter((t) => t.length > 0);
}

export interface LocateOptions {
  imageWidth: number;
  imageHeight: number;
}

export function locateBboxForQuote(
  quote: string,
  words: ReadonlyArray<TesseractWord>,
  options: LocateOptions,
): BoundingBox | null {
  if (typeof quote !== "string" || quote.trim().length === 0) return null;
  if (!words || words.length === 0) return null;

  const quoteTokens = tokenise(quote);
  if (quoteTokens.length === 0) return null;

  // Pre-normalise the OCR word stream once.
  const normalisedWords = words.map((w) => ({
    norm: normaliseToken(w.text),
    bbox: w.bbox,
  }));

  for (let i = 0; i + quoteTokens.length <= normalisedWords.length; i++) {
    let matched = true;
    for (let j = 0; j < quoteTokens.length; j++) {
      const candidate = normalisedWords[i + j];
      if (!candidate || candidate.norm !== quoteTokens[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return unionBbox(
        normalisedWords.slice(i, i + quoteTokens.length).map((w) => w.bbox),
        options,
      );
    }
  }

  return null;
}

function unionBbox(
  bboxes: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number }>,
  options: LocateOptions,
): BoundingBox | null {
  if (bboxes.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of bboxes) {
    if (b.x0 < x0) x0 = b.x0;
    if (b.y0 < y0) y0 = b.y0;
    if (b.x1 > x1) x1 = b.x1;
    if (b.y1 > y1) y1 = b.y1;
  }
  return {
    x0,
    y0,
    x1,
    y1,
    imageWidth: options.imageWidth,
    imageHeight: options.imageHeight,
  };
}
