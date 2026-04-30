/**
 * Verbatim § 16.21 government-warning text — extracted directly from the
 * eCFR HTML for 27 CFR § 16.21 and cross-checked against the GovInfo CFR
 * XML for Title 27. Both sources agree character-for-character.
 *
 * DO NOT MODIFY. This constant is the single source of truth for the
 * strict matcher and the CI mutation-fuzz harness. Any edit here will
 * (correctly) fail the test suite.
 *
 * Character-level invariants (per `research-findings/01-ttb-regulatory.md`
 * §1.1):
 *
 *  - Literal prefix `GOVERNMENT WARNING:` — 19 chars, all-caps, colon,
 *    single ASCII space after the colon.
 *  - `(1)` and `(2)` are parenthesised digits with no internal spaces.
 *  - Comma after `Surgeon General`.
 *  - Comma after `or operate machinery` (the clausal comma before
 *    `and may cause health problems`).
 *  - US spelling throughout (`defects`, not `defects`-British).
 *  - Single ASCII space everywhere; no smart quotes, no smart dashes.
 *  - Sentence-final periods after `birth defects.` and after `health
 *    problems.`.
 */
export const GOV_WARNING_CANONICAL =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

/** The all-caps prefix that must precede the warning body. */
export const GOV_WARNING_PREFIX = "GOVERNMENT WARNING:";

/** Body of the canonical warning (everything after the prefix + space). */
export const GOV_WARNING_BODY = GOV_WARNING_CANONICAL.slice(
  GOV_WARNING_PREFIX.length + 1,
);
