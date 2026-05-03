/**
 * TTB-approved function-describing phrases that must precede the
 * bottler/producer name on a label. Sources:
 *   - 27 CFR § 5.66 (spirits): Bottled by / canned by / packed by /
 *     filled by / blended by / made by / prepared by / produced by /
 *     manufactured by / distilled by / imported by.
 *   - 27 CFR § 4.35 (wine): Bottled by / produced by / made by /
 *     cellared and bottled by / vinted and bottled by / blended and
 *     bottled by / prepared and bottled by.
 *   - 27 CFR § 7.66 (malt): Bottled by / canned by / packed by /
 *     filled by / brewed and bottled by / brewed and packaged by.
 *
 * The scanner is intentionally tolerant: it looks first within an 80-
 * character proximity window BEFORE the bottler-name evidence quote;
 * if the evidence quote is null/empty OR can't be located in the OCR
 * (rare — typically because the LLM tidied up multi-line text), it
 * falls back to scanning the entire OCR. This way we never false-warn
 * purely because of an extraction artifact.
 *
 * The pipeline-level overlay treats `found = false` as warn (not fail).
 */

const APPROVED_PHRASES: ReadonlyArray<string> = [
  "bottled by",
  "canned by",
  "packed by",
  "filled by",
  "blended by",
  "made by",
  "prepared by",
  "produced by",
  "manufactured by",
  "distilled by",
  "imported by",
  "cellared and bottled by",
  "vinted and bottled by",
  "blended and bottled by",
  "prepared and bottled by",
  "brewed and bottled by",
  "brewed and packaged by",
];

/**
 * Maximum character distance between the approved verb and the bottler
 * name evidence quote. 80 chars covers two short address lines worth
 * of OCR while still rejecting unrelated mentions of a verb that
 * pertain to a different brand or product.
 */
const PROXIMITY_WINDOW_CHARS = 80;

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function findAnyApprovedPhrase(haystack: string): string | undefined {
  for (const phrase of APPROVED_PHRASES) {
    if (haystack.includes(phrase)) return phrase;
  }
  return undefined;
}

export interface FunctionPhraseResult {
  found: boolean;
  phrase?: string;
}

export function findBottlerFunctionPhrase(
  rawText: string,
  bottlerNameEvidence: string | null | undefined,
): FunctionPhraseResult {
  const haystack = normalise(rawText);

  // No anchor — fall back to whole-OCR scan. Tolerant default.
  if (
    typeof bottlerNameEvidence !== "string" ||
    bottlerNameEvidence.trim().length === 0
  ) {
    const phrase = findAnyApprovedPhrase(haystack);
    return phrase ? { found: true, phrase } : { found: false };
  }

  const needle = normalise(bottlerNameEvidence);
  const nameIndex = haystack.indexOf(needle);

  // Evidence quote not present in OCR (fragmentation / drift) — fall
  // back to whole-OCR scan so an extraction artifact doesn't cause a
  // false warn.
  if (nameIndex < 0) {
    const phrase = findAnyApprovedPhrase(haystack);
    return phrase ? { found: true, phrase } : { found: false };
  }

  // Strict proximity check: only count a verb that precedes the
  // bottler name within the proximity window. This rejects unrelated
  // verb mentions that pertain to a different brand on the label.
  const windowStart = Math.max(0, nameIndex - PROXIMITY_WINDOW_CHARS);
  const window = haystack.slice(windowStart, nameIndex);
  const phrase = findAnyApprovedPhrase(window);
  return phrase ? { found: true, phrase } : { found: false };
}
