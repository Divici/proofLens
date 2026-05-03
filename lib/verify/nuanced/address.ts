import { runLadder, type CallJudgeFn, type LadderOutcome } from "./ladder";

/**
 * Bottler / producer ADDRESS nuanced matcher.
 *
 * TTB §§ 5.66 / 4.35 / 7.66 require only city + State on the label.
 * Street, county, ZIP, phone, website are explicitly OPTIONAL. The
 * default ladder, run on `bottlerName`-shaped inputs, fails when the
 * application carries a full mailing address but the label only
 * prints city + state — they tokenise to disjoint sets even though
 * the regulation accepts the latter.
 *
 * Two pre-normalisation steps fix this without changing the ladder:
 *   1. Strip 5-digit (and 5+4) ZIP codes as whole-word tokens.
 *   2. Alias full state names ("Kentucky", "New York", "Puerto Rico")
 *      to their USPS two-letter abbreviations so they collide with
 *      the same abbreviation already on either side.
 *
 * After that, `fuzzball.token_set_ratio` returns 100 by construction
 * for the subset case (label tokens ⊂ application tokens), which is
 * what we want — the label is regulatorially complete even though
 * it's textually shorter than COLA's mailing address.
 */

/**
 * USPS state-name → two-letter abbreviation map.
 * Source: USPS Postal Service Manual Pub 28 Appendix B (states +
 * territories). Includes DC and the five inhabited US territories.
 */
const STATE_NAME_TO_ABBREV: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE",
  nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  // DC + territories
  "district of columbia": "DC",
  "puerto rico": "PR",
  guam: "GU",
  "american samoa": "AS",
  "us virgin islands": "VI",
  "u s virgin islands": "VI",
  "virgin islands": "VI",
  "northern mariana islands": "MP",
};

/** ZIP code regex — 5-digit or 5+4 with optional hyphen, whole word. */
const ZIP_REGEX = /\b\d{5}(?:-\d{4})?\b/g;

/**
 * Replace state names with their USPS abbreviation so "Kentucky" and
 * "KY" collide on the address field. Multi-word states ("New York")
 * match before we tokenise. Sort by length desc so "New Hampshire"
 * wins over "Hampshire".
 */
function aliasStateNames(text: string): string {
  let out = text;
  const names = Object.keys(STATE_NAME_TO_ABBREV).sort(
    (a, b) => b.length - a.length,
  );
  for (const name of names) {
    const abbrev = STATE_NAME_TO_ABBREV[name]!;
    const re = new RegExp(`\\b${name.replace(/ /g, "\\s+")}\\b`, "gi");
    out = out.replace(re, abbrev);
  }
  return out;
}

function normaliseAddressField(text: string): string {
  return aliasStateNames(text.replace(ZIP_REGEX, " "));
}

export interface BottlerAddressMatchInput {
  extracted: string | null;
  expected: string;
  callJudge?: CallJudgeFn;
}

export function bottlerAddressMatch(
  input: BottlerAddressMatchInput,
): Promise<LadderOutcome> {
  const cleanedExtracted =
    typeof input.extracted === "string"
      ? normaliseAddressField(input.extracted)
      : input.extracted;
  const cleanedExpected = normaliseAddressField(input.expected);
  return runLadder({
    extracted: cleanedExtracted,
    expected: cleanedExpected,
    callJudge: input.callJudge,
    fieldName: "bottlerAddress",
  });
}
