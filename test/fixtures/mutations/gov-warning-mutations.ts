import * as fc from "fast-check";
import { GOV_WARNING_CANONICAL } from "@/lib/verify/strict/gov-warning-canonical";

/**
 * `fast-check` arbitraries that produce mutations of the canonical § 16.21
 * gov-warning string. Every mutation is *guaranteed* to differ semantically
 * from the canonical text — the matcher must reject 100% of them. This is
 * the safety net for the "gov-warning recall = 100%" hard rule.
 *
 * Categories required by the slice 0003 spec:
 *   - cap drop on prefix (`GOVERNMENT WARNING` → `government warning`)
 *   - missing prefix entirely
 *   - lowercase prefix only
 *   - comma drop after `Surgeon General`
 *   - comma drop after `or operate machinery`
 *   - word substitution (one word swapped for a near-synonym)
 *   - sentence reorder ((2) before (1))
 *   - smart-quote injection
 */

const CANON = GOV_WARNING_CANONICAL;

/** Cap-drop on prefix — "GOVERNMENT WARNING:" → "Government Warning:". */
const titleCasePrefix = fc.constant(
  CANON.replace("GOVERNMENT WARNING:", "Government Warning:"),
);

/** Lowercase prefix entirely. */
const lowercasePrefix = fc.constant(
  CANON.replace("GOVERNMENT WARNING:", "government warning:"),
);

/** Drop the prefix. */
const droppedPrefix = fc.constant(CANON.replace("GOVERNMENT WARNING: ", ""));

/** Comma drop after "Surgeon General". */
const commaDropSurgeonGeneral = fc.constant(
  CANON.replace("Surgeon General,", "Surgeon General"),
);

/** Comma drop after "or operate machinery". */
const commaDropOperateMachinery = fc.constant(
  CANON.replace("or operate machinery,", "or operate machinery"),
);

/** Single-word substitutions that change meaning. */
const wordSubstitutions = fc.constantFrom(
  CANON.replace("Surgeon General", "Surgeon-General"),
  CANON.replace("birth defects", "birth defect"),
  CANON.replace("health problems", "health issues"),
  CANON.replace("drive a car", "drive a vehicle"),
  CANON.replace("alcoholic beverages", "alcohol beverages"),
  CANON.replace("operate machinery", "operate equipment"),
  CANON.replace("during pregnancy", "while pregnant"),
);

/** Sentence reorder — swap (1) and (2). */
const sentenceReorder = fc.constant(
  "GOVERNMENT WARNING: (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems. (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects.",
);

/**
 * Smart-quote / smart-dash injection. The canonical text contains no
 * apostrophes, but we inject typographic punctuation in places that are
 * *visually* similar but not the canonical char.
 *
 * NOTE: a smart-quote injection by itself is not sufficient to fail the
 * matcher (Layer 2 normalises smart quotes back to ASCII), so we combine
 * it with one of the other meaningful mutations.
 */
const smartQuoteInjection = fc.constantFrom(
  CANON.replace("(1)", "“1”").replace("(2)", "“2”"),
  CANON.replace("Surgeon General,", "Surgeon General;"),
  CANON.replace("Surgeon General,", "Surgeon General-"),
);

/** Single-character noise on the body — random letter inserted. */
const charInsertion = fc
  .tuple(
    fc.integer({
      min: GOV_WARNING_CANONICAL.indexOf("(1)"),
      max: CANON.length - 1,
    }),
    fc.constantFrom("X", "Q", "Z", "*", "!", "$"),
  )
  .map(
    ([idx, ch]) => CANON.slice(0, idx) + ch + CANON.slice(idx),
  );

/** Single-character deletion in the body. */
const charDeletion = fc
  .integer({
    min: GOV_WARNING_CANONICAL.indexOf("(1)") + 5,
    max: CANON.length - 2,
  })
  .map((idx) => CANON.slice(0, idx) + CANON.slice(idx + 1));

/** Trailing extra clauses that change meaning. */
const trailingExtra = fc.constantFrom(
  CANON + " Drink responsibly.",
  CANON + " For more information visit example.gov.",
);

/**
 * The grand union — every mutation an adversary could plausibly send.
 * The matcher must reject every one.
 */
export function canonicalMutations(): fc.Arbitrary<string> {
  return fc.oneof(
    titleCasePrefix,
    lowercasePrefix,
    droppedPrefix,
    commaDropSurgeonGeneral,
    commaDropOperateMachinery,
    wordSubstitutions,
    sentenceReorder,
    smartQuoteInjection,
    charInsertion,
    charDeletion,
    trailingExtra,
  );
}
