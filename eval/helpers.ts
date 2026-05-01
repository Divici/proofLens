/**
 * Eval runner helpers — extracted into a standalone module so they can be
 * unit-tested under vitest without spinning up the full runner CLI.
 *
 * Keep this file pure (no IO, no fetch) — every function should be a
 * deterministic, side-effect-free transform.
 */
import type { TesseractWord } from "../lib/ocr/tesseract";
import type { FieldStatus, OverallStatus } from "../lib/verify/types";

/**
 * Compare an actual `FieldStatus` to either a literal expected status
 * or a `{oneOf: [...]}` union. The union form is intentional — Layer 1
 * runs without the LLM judge so gray-band cases can land on either
 * `likely-match` (when the ladder normalises to equal) or `manual-review`
 * (when the judge would have been called).
 */
export function statusMatches(
  actual: FieldStatus,
  expected: FieldStatus | { oneOf: FieldStatus[] },
): boolean {
  if (typeof expected === "string") return actual === expected;
  return expected.oneOf.includes(actual);
}

/**
 * Same matcher for `OverallStatus`. Layer 1 happy-path cases for clean US
 * labels roll up to `pass-with-warnings` because the country matcher
 * always emits `likely-match` for US aliases — see the comment in
 * `lib/verify/nuanced/country.ts`.
 */
export function overallMatches(
  actual: OverallStatus,
  expected: OverallStatus | { oneOf: OverallStatus[] },
): boolean {
  if (typeof expected === "string") return actual === expected;
  return expected.oneOf.includes(actual);
}

/**
 * Build a stand-in `TesseractWord[]` from a raw text string. The bbox
 * positions are synthetic — the verification pipeline only consults words
 * for `locateBboxForQuote` lookups (and falls back to null on miss). The
 * gov-warning matcher reads from rawText directly, so synthetic positions
 * are sufficient.
 *
 * Token positions advance left-to-right with a 10-pixel inter-word gap;
 * each token's width is `max(20, length * 12)` to give the locator a
 * non-degenerate bbox to match.
 */
export function wordsFromText(text: string): TesseractWord[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  let cursorX = 10;
  const y0 = 10;
  const y1 = 40;
  return tokens.map((tok) => {
    const x0 = cursorX;
    const width = Math.max(20, tok.length * 12);
    const x1 = x0 + width;
    cursorX = x1 + 10;
    return {
      text: tok,
      confidence: 0.95,
      bbox: { x0, y0, x1, y1 },
    };
  });
}

/**
 * Linear-interpolated quantile of a numeric array. Mirrors numpy's default
 * (`linear` interpolation). Used by the runner to compute p50 / p95
 * latency from the per-case `processingTimeMs` array.
 */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  if (next !== undefined) {
    return sorted[base]! + rest * (next - sorted[base]!);
  }
  return sorted[base] ?? 0;
}
