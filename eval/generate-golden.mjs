/**
 * Programmatic golden-set generator for proofLens Phase-7 eval.
 *
 * Emits one JSON file per case under `eval/golden/`. Each case carries:
 *
 *   - `id` / `name` / `tags` — for the runner table.
 *   - `input.labelImagePath` — relative to the repo root, used by Layer 2
 *     when POSTing to `/api/extract-label`.
 *   - `input.expectedData`   — `ApplicationData` shape (lib/ai/schema.ts).
 *   - `mockExtraction`       — synthesised `ExtractedLabelData`. Layer 1
 *     uses this to drive the deterministic verification pipeline without
 *     any LLM call. Cases that exercise nuanced ladder behavior (case
 *     mismatch, smart quotes) carry extracted brand/class/etc. text that
 *     differs from `expectedData` in exactly the way the case is named for.
 *   - `mockOcr`              — `{rawText, words}` to feed Tesseract-output
 *     stand-ins to the gov-warning matcher. The 100 %-recall guarantee is
 *     enforced here.
 *   - `expected`             — `{overall, fieldExpectations, imageQualityFlags}`.
 *
 * Field-key reference (must match `lib/verify/pipeline.ts` exactly):
 *   - `brand` (nuanced), `classType` (nuanced)
 *   - `abv`   (strict, beverage-aware) — NOT `abvPercent`
 *   - `netContents` (strict)
 *   - `bottlerName`, `bottlerAddress`, `countryOfOrigin` (nuanced)
 *   - `governmentWarning` (strict, universal) — NOT `governmentWarningText`
 *
 * Important Layer 1 behaviour (no LLM judge):
 *   - `countryMatch` returns `likely-match` for any US alias even on exact
 *     match — the special-case `US_ALIASES` short-circuit in
 *     `lib/verify/nuanced/country.ts` always emits Likely Match, never
 *     Pass. Every clean US label therefore rolls up to
 *     `pass-with-warnings` at Layer 1, never to `pass`. Layer 2's judge
 *     does not change this since the short-circuit fires before the
 *     ladder. Cases capture this faithfully.
 *   - Case-only diffs (e.g. `Stone's Throw` vs `STONE'S THROW`) collapse
 *     to `likely-match` after normalisation, NOT `pass`.
 *
 * Layer 1 (deterministic) reads `mockExtraction` + `mockOcr` and asserts the
 * pipeline lands on `expected.overall`. Layer 2 ignores those fields and
 * sends `input` to the live server.
 *
 * Re-run with `node eval/generate-golden.mjs` whenever the case list changes.
 */
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(__dirname, "golden");

if (existsSync(GOLDEN_DIR)) {
  rmSync(GOLDEN_DIR, { recursive: true, force: true });
}
mkdirSync(GOLDEN_DIR, { recursive: true });

// ── Canonical § 16.21 government warning ────────────────────────────────────
// Kept verbatim with `lib/verify/strict/gov-warning-canonical.ts`. Any drift
// here is intentional in the strict-fail variants only.
const GOV_WARNING_CANONICAL =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

// ── Utility: build an `ExtractedField` ──────────────────────────────────────
const f = (value, evidenceQuote = null, confidence = 0.92) => ({
  value,
  evidenceQuote,
  confidence,
});

/**
 * Build a clean, fully-populated `ExtractedLabelData` payload from an
 * `ApplicationData` form. Every field is mirrored verbatim so the pipeline
 * lands on Pass when the ApplicationData itself describes a clean label.
 *
 * Override individual fields by passing an `override` object — keys win
 * over the defaults. `null`-valued overrides are honoured (the field is
 * reported as "not visible on the label").
 */
function cleanExtractionFor(app, override = {}) {
  const proof = typeof app.abv === "number" ? app.abv * 2 : null;
  const govText = override.governmentWarningText?.value ?? GOV_WARNING_CANONICAL;
  const baseRawText = [
    app.brand,
    app.classType,
    `${app.abv}% Alc./Vol.`,
    proof ? `${proof} Proof` : "",
    app.netContents,
    app.bottlerName,
    app.bottlerAddress,
    app.countryOfOrigin,
    govText,
  ]
    .filter(Boolean)
    .join(" ");
  const base = {
    brand: f(app.brand, app.brand),
    classType: f(app.classType, app.classType),
    alcoholContentText: f(`${app.abv}% Alc./Vol.`, `${app.abv}% Alc./Vol.`),
    abvPercent: f(app.abv, `${app.abv}%`),
    proof: f(proof, proof ? `${proof} Proof` : null),
    netContents: f(app.netContents, app.netContents),
    bottlerName: f(app.bottlerName, app.bottlerName),
    bottlerAddress: f(app.bottlerAddress, app.bottlerAddress),
    countryOfOrigin: f(app.countryOfOrigin, app.countryOfOrigin),
    governmentWarningText: f(govText, govText),
    rawText: baseRawText,
    imageQualityNotes: [],
    extractionConfidence: 0.95,
  };
  return { ...base, ...override };
}

/**
 * Field-level expectations are a slim list — one entry per regulated row
 * the runner should assert on. Status values must match the `FieldStatus`
 * enum from lib/verify/types.ts.
 */
const FIELD = (field, status) => ({ field, status });

// ── Demo-scenario fixtures (the seven canonical labels) ─────────────────────
const APP_OLD_TOM = {
  brand: "Old Tom Distillery",
  classType: "Kentucky Straight Bourbon Whiskey",
  abv: 45,
  netContents: "750 mL",
  bottlerName: "Old Tom Distillery, LLC",
  bottlerAddress: "123 Bourbon Lane, Bardstown, KY 40004",
  countryOfOrigin: "United States",
  govWarningRequired: true,
  applicationNotes: "TTB-2026-00001",
  beverageType: "distilled-spirits",
};
const APP_STONES_THROW = {
  brand: "Stone's Throw",
  classType: "American Amber Lager",
  abv: 5.2,
  netContents: "12 fl oz",
  bottlerName: "Stone's Throw Brewing Co.",
  bottlerAddress: "Bend, OR",
  countryOfOrigin: "United States",
  govWarningRequired: true,
  applicationNotes: "TTB-2026-00002",
  beverageType: "malt-beverage",
};
const APP_CEDAR_RIDGE = {
  brand: "Cedar Ridge Vodka",
  classType: "Vodka",
  abv: 40,
  netContents: "750 mL",
  bottlerName: "Cedar Ridge Distilling Co.",
  bottlerAddress: "1500 Cedar Ridge Rd, Swisher, IA 52338",
  countryOfOrigin: "United States",
  govWarningRequired: true,
  applicationNotes: "TTB-2026-00003",
  beverageType: "distilled-spirits",
};
const APP_LAKESIDE = {
  brand: "Lakeside Gin",
  classType: "London Dry Gin",
  abv: 47,
  netContents: "750 mL",
  bottlerName: "Lakeside Spirits, LLC",
  bottlerAddress: "200 Lakeside Drive, Traverse City, MI 49684",
  countryOfOrigin: "United States",
  govWarningRequired: true,
  applicationNotes: "TTB-2026-00004",
  beverageType: "distilled-spirits",
};
const APP_RIVERFRONT = {
  brand: "Riverfront Vineyards",
  classType: "Estate Chardonnay",
  abv: 13.5,
  netContents: "750 mL",
  bottlerName: "Riverfront Vineyards",
  bottlerAddress: "Napa, CA",
  countryOfOrigin: "United States",
  govWarningRequired: true,
  applicationNotes: "TTB-2026-00005",
  beverageType: "wine",
};

const cases = [];
const push = (c) => cases.push(c);

// ── 1. Happy paths (clean label, exact match) — 4 cases ─────────────────────
// NOTE: The deterministic country matcher emits `likely-match` for every US
// alias, so any clean US label rolls up to `pass-with-warnings` at Layer 1.
// This is faithful to the implemented pipeline behaviour.

push({
  id: "001",
  name: "happy-path-spirits-clean-bourbon",
  tags: ["happy-path", "spirits", "27-cfr-5"],
  input: {
    labelImagePath: "public/demo-labels/01-spirits-pass.jpg",
    expectedData: APP_OLD_TOM,
  },
  mockExtraction: cleanExtractionFor(APP_OLD_TOM),
  mockOcr: {
    rawText:
      `OLD TOM DISTILLERY KENTUCKY STRAIGHT BOURBON WHISKEY 45% Alc./Vol. (90 Proof) 750 mL ` +
      `BOTTLED BY OLD TOM DISTILLERY, LLC BARDSTOWN, KENTUCKY PRODUCT OF U.S.A. ` +
      GOV_WARNING_CANONICAL,
  },
  expected: {
    // US country alias always emits likely-match → pass-with-warnings overall.
    overall: "pass-with-warnings",
    fieldExpectations: [
      FIELD("brand", "pass"),
      FIELD("abv", "pass"),
      FIELD("netContents", "pass"),
      FIELD("countryOfOrigin", "likely-match"),
      FIELD("governmentWarning", "pass"),
    ],
    imageQualityFlags: [],
  },
});

push({
  id: "002",
  name: "happy-path-wine-clean-chardonnay-low-abv",
  tags: ["happy-path", "wine", "27-cfr-4"],
  input: {
    labelImagePath: "public/demo-labels/05-warn-incomplete.jpg",
    expectedData: { ...APP_RIVERFRONT, abv: 12.5 },
  },
  mockExtraction: cleanExtractionFor({ ...APP_RIVERFRONT, abv: 12.5 }),
  mockOcr: {
    rawText: `RIVERFRONT VINEYARDS ESTATE CHARDONNAY 12.5% Alc./Vol. 750 mL ${GOV_WARNING_CANONICAL}`,
  },
  expected: {
    // Wine ABV ≤ 14 % is conditional → optional. Field still has a value
    // here so it routes through the matcher and lands on `pass`. Country
    // is the only `likely-match` driver.
    overall: "pass-with-warnings",
    fieldExpectations: [
      FIELD("brand", "pass"),
      FIELD("abv", "pass"),
      FIELD("countryOfOrigin", "likely-match"),
      FIELD("governmentWarning", "pass"),
    ],
    imageQualityFlags: [],
  },
});

push({
  id: "003",
  name: "happy-path-malt-clean-amber-lager",
  tags: ["happy-path", "malt-beverage", "27-cfr-7"],
  input: {
    labelImagePath: "public/demo-labels/02-stones-throw-caps.jpg",
    expectedData: APP_STONES_THROW,
  },
  mockExtraction: cleanExtractionFor(APP_STONES_THROW),
  mockOcr: {
    rawText: `STONE'S THROW AMERICAN AMBER LAGER 5.2% Alc./Vol. 12 fl oz ${GOV_WARNING_CANONICAL}`,
  },
  expected: {
    overall: "pass-with-warnings",
    fieldExpectations: [
      FIELD("brand", "pass"),
      FIELD("abv", "pass"),
      FIELD("countryOfOrigin", "likely-match"),
      FIELD("governmentWarning", "pass"),
    ],
    imageQualityFlags: [],
  },
});

push({
  id: "004",
  name: "happy-path-other-universal-only",
  tags: ["happy-path", "other-unknown", "universal-only"],
  input: {
    labelImagePath: "public/demo-labels/01-spirits-pass.jpg",
    expectedData: { ...APP_OLD_TOM, beverageType: "unknown" },
  },
  mockExtraction: cleanExtractionFor({
    ...APP_OLD_TOM,
    beverageType: "unknown",
  }),
  mockOcr: {
    rawText: `OLD TOM DISTILLERY 750 mL ${GOV_WARNING_CANONICAL}`,
  },
  expected: {
    // Other/unknown routes class/abv/bottler/country to not-required; brand
    // + netContents + govWarning still verified. No country likely-match
    // demotion since country itself is not-required.
    overall: "pass",
    fieldExpectations: [
      FIELD("brand", "pass"),
      FIELD("classType", "not-required"),
      FIELD("abv", "not-required"),
      FIELD("bottlerName", "not-required"),
      FIELD("countryOfOrigin", "not-required"),
      FIELD("governmentWarning", "pass"),
    ],
    imageQualityFlags: [],
  },
});

// ── 2. Strict-fail: government warning (9 cases) ───────────────────────────
// Each case mutates the canonical warning in exactly one way and asserts
// the matcher catches it. Recall must be 100 %.

const govFailCases = [
  {
    id: "005",
    name: "strict-fail-govwarning-missing-prefix",
    description: "Body present but `GOVERNMENT WARNING:` prefix absent.",
    rawText: GOV_WARNING_CANONICAL.replace(
      "GOVERNMENT WARNING: ",
      "",
    ),
  },
  {
    id: "006",
    name: "strict-fail-govwarning-lowercased-prefix",
    description: "Prefix is title-cased instead of all-caps.",
    rawText: GOV_WARNING_CANONICAL.replace(
      "GOVERNMENT WARNING:",
      "Government Warning:",
    ),
  },
  {
    id: "007",
    name: "strict-fail-govwarning-missing-comma-after-surgeon-general",
    description: "Comma after `Surgeon General` removed.",
    rawText: GOV_WARNING_CANONICAL.replace(
      "Surgeon General,",
      "Surgeon General",
    ),
  },
  {
    id: "008",
    name: "strict-fail-govwarning-missing-comma-after-operate-machinery",
    description: "Clausal comma before `and may cause` removed.",
    rawText: GOV_WARNING_CANONICAL.replace(
      "operate machinery,",
      "operate machinery",
    ),
  },
  {
    id: "009",
    name: "strict-fail-govwarning-word-substitution",
    description: "`women` swapped for `people` in the body.",
    rawText: GOV_WARNING_CANONICAL.replace("women", "people"),
  },
  {
    id: "010",
    name: "strict-fail-govwarning-sentence-reorder",
    description: "Sentence (2) printed before sentence (1).",
    rawText:
      "GOVERNMENT WARNING: (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems. (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects.",
  },
  {
    id: "011",
    name: "strict-fail-govwarning-smart-quote-with-comma-drop",
    description:
      "Smart-quote characters AROUND `Surgeon General` AND the comma is dropped — Layer 2 typographic fold neutralises the smart quotes, so the dropped comma is what actually drives the fail. Demonstrates the fold doesn't accidentally let mutations slip through.",
    rawText: GOV_WARNING_CANONICAL.replace(
      "Surgeon General,",
      "“Surgeon General”",
    ),
  },
  {
    id: "012",
    name: "strict-fail-govwarning-trailing-extras",
    description:
      "Extra marketing tagline appended after `health problems.` — wording mismatch.",
    rawText: `${GOV_WARNING_CANONICAL} PLEASE DRINK RESPONSIBLY.`,
  },
  {
    id: "013",
    name: "strict-fail-govwarning-truncated-mid-sentence",
    description: "Body truncated mid first sentence.",
    rawText:
      "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy",
  },
];

for (const variant of govFailCases) {
  const app = APP_LAKESIDE;
  // The pipeline reads gov-warning ground truth FROM rawText (Tesseract),
  // not from the LLM extraction. So `mockOcr.rawText` is what drives the
  // matcher. We still set the LLM extraction to the same mutated string
  // so the per-field `value` matches what a real run would show.
  push({
    id: variant.id,
    name: variant.name,
    tags: ["strict-fail", "gov-warning", "100-percent-recall"],
    input: {
      labelImagePath: "public/demo-labels/04-gov-warn-lowercase.jpg",
      expectedData: app,
    },
    mockExtraction: cleanExtractionFor(app, {
      governmentWarningText: f(variant.rawText, variant.rawText),
    }),
    mockOcr: {
      // Prefix the brand/class/etc. so the rest of the pipeline still has
      // matter to score against. The gov-warning matcher locates the
      // `GOVERNMENT WARNING:` prefix in rawText and only consumes from there.
      rawText: `${app.brand} ${app.classType} ${app.abv}% Alc./Vol. 750 mL ${variant.rawText}`,
    },
    expected: {
      overall: "fail",
      fieldExpectations: [FIELD("governmentWarning", "fail")],
      imageQualityFlags: [],
      // The runner enforces this: every case tagged `strict-fail` +
      // `gov-warning` must produce overall=fail AND governmentWarning=fail.
      // Recall is computed from this set.
      mustReachGovWarningFail: true,
    },
  });
}

// ── 3. Strict-fail: ABV out of tolerance (5 cases) ──────────────────────────
const abvCases = [
  {
    id: "014",
    name: "strict-fail-abv-spirits-outside-tolerance",
    expectedAbv: 40,
    extractedAbv: 38,
    beverage: "distilled-spirits",
  },
  {
    id: "015",
    name: "strict-pass-abv-spirits-inside-tolerance",
    expectedAbv: 40,
    extractedAbv: 40.2,
    beverage: "distilled-spirits",
    pass: true,
  },
  {
    id: "016",
    name: "strict-fail-abv-wine-outside-tolerance",
    // Wine ABV > 14 → required, can fail.
    expectedAbv: 14.5,
    extractedAbv: 12.5,
    beverage: "wine",
  },
  {
    id: "017",
    name: "strict-pass-abv-wine-inside-tolerance",
    expectedAbv: 14.5,
    extractedAbv: 14.7,
    beverage: "wine",
    pass: true,
  },
  {
    id: "018",
    name: "strict-fail-abv-malt-flavor-required",
    // Malt-beverage ABV is conditional (not-required by default) — we
    // can't easily fail a malt ABV without flagging the
    // `addedFlavorsContributeAlcohol` rule context, which the pipeline
    // doesn't expose at the API. Use a wine variant with abv > 14 instead
    // so ABV is required AND in scope for fail.
    expectedAbv: 15.5,
    extractedAbv: 9.5,
    beverage: "wine",
  },
];

for (const variant of abvCases) {
  const app =
    variant.beverage === "wine"
      ? { ...APP_RIVERFRONT, abv: variant.expectedAbv }
      : variant.beverage === "malt-beverage"
        ? { ...APP_STONES_THROW, abv: variant.expectedAbv }
        : { ...APP_CEDAR_RIDGE, abv: variant.expectedAbv };
  push({
    id: variant.id,
    name: variant.name,
    tags: variant.pass
      ? ["happy-path", "abv-tolerance", variant.beverage]
      : ["strict-fail", "abv", variant.beverage],
    input: {
      labelImagePath: "public/demo-labels/03-abv-mismatch.jpg",
      expectedData: app,
    },
    mockExtraction: cleanExtractionFor(app, {
      abvPercent: f(variant.extractedAbv, `${variant.extractedAbv}% Alc./Vol.`),
      alcoholContentText: f(
        `${variant.extractedAbv}% Alc./Vol.`,
        `${variant.extractedAbv}% Alc./Vol.`,
      ),
      proof: f(variant.extractedAbv * 2, `${variant.extractedAbv * 2} Proof`),
    }),
    mockOcr: {
      rawText: `${app.brand} ${app.classType} ${variant.extractedAbv}% Alc./Vol. 750 mL ${GOV_WARNING_CANONICAL}`,
    },
    expected: variant.pass
      ? {
          // Inside-tolerance pass — country still likely-match → overall is
          // pass-with-warnings.
          overall: "pass-with-warnings",
          fieldExpectations: [FIELD("abv", "pass")],
          imageQualityFlags: [],
        }
      : {
          overall: "fail",
          fieldExpectations: [FIELD("abv", "fail")],
          imageQualityFlags: [],
        },
  });
}

// ── 4. Nuanced ladder: brand variations (5 cases) ───────────────────────────
const brandCases = [
  {
    id: "019",
    name: "nuanced-brand-exact-match",
    extractedBrand: "Stone's Throw",
    // Byte-equal → unambiguous Pass.
    expectedBrandStatus: "pass",
  },
  {
    id: "020",
    name: "nuanced-brand-case-only-diff",
    extractedBrand: "STONE'S THROW",
    // Equal AFTER normalisation → likely-match (rung 1).
    expectedBrandStatus: "likely-match",
  },
  {
    id: "021",
    name: "nuanced-brand-smart-quote-diff",
    extractedBrand: "Stone’s Throw",
    // Smart-quote folded then byte-equal-after-normalise → likely-match.
    expectedBrandStatus: "likely-match",
  },
  {
    id: "022",
    name: "nuanced-brand-abbreviation",
    // "Stone's Throw" vs "Stone's Throw Brewing" — token_set_ratio is high
    // because the smaller set is a subset of the larger; should land in
    // pass band ≥ 0.92 → likely-match (post-normalise non-equal).
    extractedBrand: "Stone's Throw Brewing",
    expectedBrandStatus: { oneOf: ["likely-match", "manual-review"] },
  },
  {
    id: "023",
    name: "nuanced-brand-completely-different",
    extractedBrand: "Pebble Beach Lager",
    expectedBrandStatus: "fail",
  },
];

for (const variant of brandCases) {
  const app = APP_STONES_THROW;
  // Compute overall expectation from the brand status.
  const overallExpected =
    variant.expectedBrandStatus === "fail"
      ? "fail"
      : "pass-with-warnings"; // any non-fail brand + US country likely-match
  push({
    id: variant.id,
    name: variant.name,
    tags: ["nuanced-match", "brand"],
    input: {
      labelImagePath: "public/demo-labels/02-stones-throw-caps.jpg",
      expectedData: app,
    },
    mockExtraction: cleanExtractionFor(app, {
      brand: f(variant.extractedBrand, variant.extractedBrand),
    }),
    mockOcr: {
      rawText: `${variant.extractedBrand} ${app.classType} 5.2% Alc./Vol. 12 fl oz ${GOV_WARNING_CANONICAL}`,
    },
    expected: {
      overall: overallExpected,
      fieldExpectations: [FIELD("brand", variant.expectedBrandStatus)],
      imageQualityFlags: [],
    },
  });
}

// ── 5. Image quality (4 cases) ──────────────────────────────────────────────
const imageQualityCases = [
  {
    id: "024",
    name: "image-quality-clean-no-flags",
    flags: [],
    notes: [],
  },
  {
    id: "025",
    name: "image-quality-blur-flag",
    flags: ["blur"],
    notes: ["heavy motion blur"],
  },
  {
    id: "026",
    name: "image-quality-glare-flag",
    flags: ["glare"],
    notes: ["bright glare patch top-left"],
  },
  {
    id: "027",
    name: "image-quality-low-light-flag",
    flags: ["low-light"],
    notes: ["under-exposed image"],
  },
];

for (const variant of imageQualityCases) {
  const app = APP_OLD_TOM;
  push({
    id: variant.id,
    name: variant.name,
    tags: ["image-quality", ...(variant.flags.length ? variant.flags : ["clean"])],
    input: {
      labelImagePath: "public/demo-labels/06-glare-blur.jpg",
      expectedData: app,
    },
    mockExtraction: cleanExtractionFor(app, {
      imageQualityNotes: variant.notes,
    }),
    mockOcr: {
      rawText: `${app.brand} ${app.classType} ${app.abv}% Alc./Vol. 750 mL ${GOV_WARNING_CANONICAL}`,
    },
    // Image quality flags drive the demotion override.
    expected: {
      // Clean → pass-with-warnings (country likely-match drives it).
      // Flagged → every non-fail/non-missing field demotes to manual-review,
      // so overall rolls up to needs-manual-review.
      overall:
        variant.flags.length === 0 ? "pass-with-warnings" : "needs-manual-review",
      fieldExpectations:
        variant.flags.length === 0
          ? [FIELD("brand", "pass"), FIELD("governmentWarning", "pass")]
          : [
              FIELD("brand", "manual-review"),
              FIELD("governmentWarning", "manual-review"),
            ],
      imageQualityFlags: variant.flags,
    },
  });
}

// ── 6. Beverage-aware required-field (4 cases) ──────────────────────────────
push({
  id: "028",
  name: "beverage-spirits-abv-required",
  tags: ["beverage-aware", "spirits", "abv-required"],
  input: {
    labelImagePath: "public/demo-labels/01-spirits-pass.jpg",
    expectedData: APP_OLD_TOM,
  },
  // ABV missing from the label → expect missing field, not Pass.
  mockExtraction: cleanExtractionFor(APP_OLD_TOM, {
    abvPercent: f(null, null, 0.95),
    alcoholContentText: f(null, null, 0.95),
    proof: f(null, null, 0.95),
  }),
  mockOcr: {
    rawText: `OLD TOM DISTILLERY KENTUCKY STRAIGHT BOURBON WHISKEY 750 mL ${GOV_WARNING_CANONICAL}`,
  },
  expected: {
    // Single missing field rolls up to needs-manual-review.
    overall: "needs-manual-review",
    fieldExpectations: [FIELD("abv", "missing")],
    imageQualityFlags: [],
  },
});

push({
  id: "029",
  name: "beverage-wine-high-abv-required",
  tags: ["beverage-aware", "wine", "abv-required"],
  input: {
    labelImagePath: "public/demo-labels/05-warn-incomplete.jpg",
    expectedData: { ...APP_RIVERFRONT, abv: 15.5 },
  },
  mockExtraction: cleanExtractionFor(
    { ...APP_RIVERFRONT, abv: 15.5 },
    {
      abvPercent: f(null, null, 0.95),
      alcoholContentText: f(null, null, 0.95),
      proof: f(null, null, 0.95),
    },
  ),
  mockOcr: {
    rawText: `RIVERFRONT VINEYARDS ESTATE CHARDONNAY 750 mL ${GOV_WARNING_CANONICAL}`,
  },
  expected: {
    overall: "needs-manual-review",
    fieldExpectations: [FIELD("abv", "missing")],
    imageQualityFlags: [],
  },
});

push({
  id: "030",
  name: "beverage-beer-abv-not-required-when-missing",
  tags: ["beverage-aware", "malt-beverage", "abv-not-required"],
  input: {
    labelImagePath: "public/demo-labels/02-stones-throw-caps.jpg",
    expectedData: APP_STONES_THROW,
  },
  mockExtraction: cleanExtractionFor(APP_STONES_THROW, {
    abvPercent: f(null, null, 0.95),
    alcoholContentText: f(null, null, 0.95),
    proof: f(null, null, 0.95),
  }),
  mockOcr: {
    rawText: `STONE'S THROW AMERICAN AMBER LAGER 12 fl oz ${GOV_WARNING_CANONICAL}`,
  },
  expected: {
    // Beer ABV is conditional-optional → not-required row, doesn't block Pass.
    // Country still likely-match → pass-with-warnings.
    overall: "pass-with-warnings",
    fieldExpectations: [FIELD("abv", "not-required")],
    imageQualityFlags: [],
  },
});

push({
  id: "031",
  name: "beverage-other-only-universal-fields",
  tags: ["beverage-aware", "other-unknown", "universal-only"],
  input: {
    labelImagePath: "public/demo-labels/01-spirits-pass.jpg",
    expectedData: { ...APP_OLD_TOM, beverageType: "unknown" },
  },
  mockExtraction: cleanExtractionFor(
    { ...APP_OLD_TOM, beverageType: "unknown" },
    {
      classType: f(null, null, 0.95),
      abvPercent: f(null, null, 0.95),
      alcoholContentText: f(null, null, 0.95),
      proof: f(null, null, 0.95),
      bottlerName: f(null, null, 0.95),
      bottlerAddress: f(null, null, 0.95),
      countryOfOrigin: f(null, null, 0.95),
    },
  ),
  mockOcr: {
    rawText: `OLD TOM DISTILLERY 750 mL ${GOV_WARNING_CANONICAL}`,
  },
  expected: {
    // Other/unknown: country is not-required, so no likely-match demotion.
    // Brand + netContents + govWarning all pass → overall: pass.
    overall: "pass",
    fieldExpectations: [
      FIELD("brand", "pass"),
      FIELD("classType", "not-required"),
      FIELD("abv", "not-required"),
      FIELD("bottlerName", "not-required"),
      FIELD("countryOfOrigin", "not-required"),
      FIELD("governmentWarning", "pass"),
    ],
    imageQualityFlags: [],
  },
});

// ── 7. Demo-scenario fixtures (the canonical seven) ─────────────────────────
push({
  id: "032",
  name: "demo-scenario-01-spirits-pass",
  tags: ["demo-scenario", "happy-path", "spirits"],
  input: {
    labelImagePath: "public/demo-labels/01-spirits-pass.jpg",
    expectedData: APP_OLD_TOM,
  },
  mockExtraction: cleanExtractionFor(APP_OLD_TOM),
  mockOcr: {
    rawText: `OLD TOM DISTILLERY KENTUCKY STRAIGHT BOURBON WHISKEY 45% Alc./Vol. 750 mL ${GOV_WARNING_CANONICAL}`,
  },
  expected: {
    overall: "pass-with-warnings",
    fieldExpectations: [FIELD("brand", "pass"), FIELD("governmentWarning", "pass")],
    imageQualityFlags: [],
  },
});

push({
  id: "033",
  name: "demo-scenario-02-stones-throw-caps",
  tags: ["demo-scenario", "nuanced-match", "malt-beverage"],
  input: {
    labelImagePath: "public/demo-labels/02-stones-throw-caps.jpg",
    expectedData: APP_STONES_THROW,
  },
  mockExtraction: cleanExtractionFor(APP_STONES_THROW, {
    brand: f("STONE'S THROW", "STONE'S THROW"),
  }),
  mockOcr: {
    rawText: `STONE'S THROW AMERICAN AMBER LAGER 5.2% Alc./Vol. 12 fl oz ${GOV_WARNING_CANONICAL}`,
  },
  expected: {
    // Case-only diff → likely-match. Overall: pass-with-warnings.
    overall: "pass-with-warnings",
    fieldExpectations: [FIELD("brand", "likely-match")],
    imageQualityFlags: [],
  },
});

push({
  id: "034",
  name: "demo-scenario-03-abv-mismatch",
  tags: ["demo-scenario", "strict-fail", "abv"],
  input: {
    labelImagePath: "public/demo-labels/03-abv-mismatch.jpg",
    expectedData: APP_CEDAR_RIDGE,
  },
  mockExtraction: cleanExtractionFor(APP_CEDAR_RIDGE, {
    abvPercent: f(38, "38% Alc./Vol."),
    alcoholContentText: f("38% Alc./Vol.", "38% Alc./Vol."),
    proof: f(76, "76 Proof"),
  }),
  mockOcr: {
    rawText: `CEDAR RIDGE VODKA 38% Alc./Vol. 750 mL ${GOV_WARNING_CANONICAL}`,
  },
  expected: {
    overall: "fail",
    fieldExpectations: [FIELD("abv", "fail")],
    imageQualityFlags: [],
  },
});

push({
  id: "035",
  name: "demo-scenario-04-gov-warn-lowercase",
  tags: ["demo-scenario", "strict-fail", "gov-warning", "100-percent-recall"],
  input: {
    labelImagePath: "public/demo-labels/04-gov-warn-lowercase.jpg",
    expectedData: APP_LAKESIDE,
  },
  mockExtraction: cleanExtractionFor(APP_LAKESIDE, {
    governmentWarningText: f(
      GOV_WARNING_CANONICAL.replace("GOVERNMENT WARNING:", "Government Warning:"),
      GOV_WARNING_CANONICAL.replace(
        "GOVERNMENT WARNING:",
        "Government Warning:",
      ),
    ),
  }),
  mockOcr: {
    rawText: `LAKESIDE GIN LONDON DRY GIN 47% Alc./Vol. 750 mL ${GOV_WARNING_CANONICAL.replace(
      "GOVERNMENT WARNING:",
      "Government Warning:",
    )}`,
  },
  expected: {
    overall: "fail",
    fieldExpectations: [FIELD("governmentWarning", "fail")],
    imageQualityFlags: [],
    mustReachGovWarningFail: true,
  },
});

push({
  id: "036",
  name: "demo-scenario-05-warn-incomplete",
  tags: ["demo-scenario", "strict-fail", "gov-warning", "100-percent-recall"],
  input: {
    labelImagePath: "public/demo-labels/05-warn-incomplete.jpg",
    expectedData: APP_RIVERFRONT,
  },
  mockExtraction: cleanExtractionFor(APP_RIVERFRONT, {
    governmentWarningText: f(
      "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy",
      "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy",
    ),
  }),
  mockOcr: {
    rawText:
      "RIVERFRONT VINEYARDS ESTATE CHARDONNAY 13.5% Alc./Vol. 750 mL GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy",
  },
  expected: {
    overall: "fail",
    fieldExpectations: [FIELD("governmentWarning", "fail")],
    imageQualityFlags: [],
    mustReachGovWarningFail: true,
  },
});

push({
  id: "037",
  name: "demo-scenario-06-glare-blur",
  tags: ["demo-scenario", "image-quality", "blur", "glare"],
  input: {
    labelImagePath: "public/demo-labels/06-glare-blur.jpg",
    expectedData: APP_OLD_TOM,
  },
  mockExtraction: cleanExtractionFor(APP_OLD_TOM, {
    imageQualityNotes: ["heavy motion blur", "bright glare overlay"],
  }),
  mockOcr: {
    rawText: `OLD TOM DISTILLERY KENTUCKY STRAIGHT BOURBON WHISKEY 45% Alc./Vol. 750 mL ${GOV_WARNING_CANONICAL}`,
  },
  expected: {
    overall: "needs-manual-review",
    fieldExpectations: [
      FIELD("brand", "manual-review"),
      FIELD("governmentWarning", "manual-review"),
    ],
    // The runner injects these so the pipeline applies the override.
    imageQualityFlags: ["blur", "glare"],
  },
});

// ── Persist all cases ───────────────────────────────────────────────────────
for (const c of cases) {
  const filename = `${c.id}-${c.name}.json`;
  const out = join(GOLDEN_DIR, filename);
  writeFileSync(out, JSON.stringify(c, null, 2) + "\n", "utf8");
}

console.log(`Generated ${cases.length} golden cases under ${GOLDEN_DIR}`);
const counts = {};
for (const c of cases) {
  for (const tag of c.tags) {
    counts[tag] = (counts[tag] ?? 0) + 1;
  }
}
console.log("Tag breakdown:");
for (const [tag, count] of Object.entries(counts).sort()) {
  console.log(`  ${tag.padEnd(28)} ${count}`);
}
