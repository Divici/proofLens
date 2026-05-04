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
 * The scanner is intentionally tolerant: it merges the LLM's
 * `bottlerName.evidenceQuote` with the OCR `rawText` into a single
 * haystack. The merge matters in production: on Vercel, Tesseract is
 * disabled (ADR 0007) and `rawText` is just the gov-warning capture
 * — the verb-bearing text is in the LLM's evidence quote (which
 * typically contains the full "BREWED AND BOTTLED BY ..." slice),
 * NOT in rawText. On local dev where Tesseract runs, both sources
 * have the verb; the merge is a no-op safety net. See ADR 0010.
 *
 * Proximity check first (80 chars before the evidence-quote anchor
 * inside the merged haystack, plus the evidence range itself). Falls
 * back to a whole-haystack scan when the anchor can't be located.
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

// Match the LONGEST approved phrase first so multi-word verbs
// ("brewed and bottled by") win over their substring shorter cousins
// ("bottled by") when both are present.
const PHRASES_BY_LENGTH = [...APPROVED_PHRASES].sort(
  (a, b) => b.length - a.length,
);

function findAnyApprovedPhrase(haystack: string): string | undefined {
  for (const phrase of PHRASES_BY_LENGTH) {
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
  // Merge sources so the scanner works on Vercel (sparse rawText)
  // AND local dev (full OCR). rawText goes FIRST so the anchor (the
  // bottler name) lands inside whichever source actually has the
  // bottler statement preceded by the verb — typically rawText on
  // local dev, evidenceQuote on Vercel. Putting rawText first keeps
  // the proximity check (80 chars BEFORE the anchor) meaningful in
  // both environments.
  const evidenceText =
    typeof bottlerNameEvidence === "string"
      ? bottlerNameEvidence
      : "";
  const merged = `${rawText ?? ""}\n${evidenceText}`;
  const haystack = normalise(merged);

  // No anchor at all — fall back to whole-haystack scan.
  if (
    typeof bottlerNameEvidence !== "string" ||
    bottlerNameEvidence.trim().length === 0
  ) {
    const phrase = findAnyApprovedPhrase(haystack);
    return phrase ? { found: true, phrase } : { found: false };
  }

  const needle = normalise(bottlerNameEvidence);
  const nameIndex = haystack.indexOf(needle);

  // Anchor not in haystack (extraction drift) — fall back to whole-
  // haystack scan so an artifact doesn't cause a false warn.
  if (nameIndex < 0) {
    const phrase = findAnyApprovedPhrase(haystack);
    return phrase ? { found: true, phrase } : { found: false };
  }

  // Proximity window: 80 chars BEFORE the anchor + the anchor range
  // itself. Including the anchor matters because the LLM's bottler
  // evidenceQuote is sometimes a longer slice that already contains
  // the verb (e.g. "BOTTLED BY OLD TOM DISTILLERY, LLC"). Verbs more
  // than 80 chars upstream of the anchor are still rejected, so an
  // unrelated mention on a different label panel doesn't false-pass.
  const windowStart = Math.max(0, nameIndex - PROXIMITY_WINDOW_CHARS);
  const windowEnd = nameIndex + needle.length;
  const window = haystack.slice(windowStart, windowEnd);
  const phrase = findAnyApprovedPhrase(window);
  return phrase ? { found: true, phrase } : { found: false };
}
