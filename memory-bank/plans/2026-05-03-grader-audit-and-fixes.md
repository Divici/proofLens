# Plan — Field-Grader Audit + Bottler-Address Fix

> Self-contained execution plan. A fresh agent can pick this up cold by
> reading: this file, `PROJECT_BRIEF.md`,
> `research-findings/01-ttb-regulatory.md`, and the existing graders
> referenced in §3.

**Goal:** Audit every field grader against TTB regulations and the
project brief. Two real fixes: (a) the over-specified bottler-address
grader (Old Tom regression — `BARDSTOWN, KENTUCKY` label vs
`123 Bourbon Lane, Bardstown, KY 40004` application); (b) country-of-
origin's "always optional" rule. Plus two regulatory-warning additions
that catch real TTB violations the current grader silently passes:
(c) net-contents standards-of-fill list check, (d) bottler function-
describing-phrase scan. Decisions captured in a new ADR.

**Architecture:**
1. Split the bottler nuanced matcher into a name path (current behavior)
   and a new address path with state-name⇄abbreviation aliasing and
   ZIP-stripping. Token_set_ratio already handles "label has fewer
   tokens than application" correctly *as long as* tokens collide; the
   only thing blocking that today is `Kentucky` vs `KY` registering as
   different tokens.
2. Auto-derive `isImported` for the country-of-origin rule by checking
   whether the application's `countryOfOrigin` is on the US-aliases
   table. No new UI; the brief's "country of origin for imports" maps
   cleanly to "if it's not US, it's imported."
3. **Standards-of-fill check (warning, not fail)** — TTB enumerates a
   fixed list of authorized volumes for wine and spirits. Add a pure
   helper that returns whether the parsed mL is on the list; demote
   net-contents from `pass` to `warning` when it isn't. Volume-match
   semantics unchanged.
4. **Function-describing-phrase scan (warning, not fail)** — TTB
   requires a verb (`Bottled by`, `Distilled by`, `Brewed and bottled
   by`, etc.) before the bottler name. Scan the raw OCR text — NOT the
   structured `bottlerName` field — for any of the approved verbs
   within a window of the bottler-name evidence quote. If absent,
   demote bottler-name from `pass` to `warning`. Tolerant by design:
   never false-fail because the LLM stripped the verb during extraction.
5. Both new checks are **warnings**, not fails — the value-match
   semantics are intact; the regulatory deviation is surfaced for
   reviewer judgment. Justified in the new ADR.

**Tech stack:** Existing — `fuzzball.token_set_ratio`, no new deps.

---

## 1. Why this work exists

### 1.1 The user-reported bug

`DEMO_SCENARIO_01` (Old Tom Distillery) renders `BARDSTOWN, KENTUCKY`
on the synthetic label artwork (`scripts/generate-demo-labels.mjs:58`),
but the application's expected `bottlerAddress` is
`"123 Bourbon Lane, Bardstown, KY 40004"`. The current matcher returns
**Fail** even though the label is regulatory-compliant:

- Application tokens (after normalisation):
  `{123, bourbon, lane, bardstown, ky, 40004}` — 6 tokens
- Label tokens: `{bardstown, kentucky}` — 2 tokens
- Intersection: `{bardstown}` — only one token, because `ky ≠ kentucky`
- `fuzzball.token_set_ratio(...)` ≈ 0.65–0.70
- Below the 0.78 fail floor → `kind: "fail"` (doesn't even reach the
  gray-band judge)

If `Kentucky` were aliased to `KY`, the intersection would be
`{bardstown, kentucky}` and the label tokens would be a subset of the
application tokens. `token_set_ratio` returns 100 for subset cases by
construction — Pass.

### 1.2 Brief alignment

`PROJECT_BRIEF.md` lists "Name and address of bottler/producer" with no
granularity guidance, and explicitly defers to TTB:

> "We encourage you to review TTB's guidelines at ttb.gov for additional
> context on label requirements."

The actual TTB regulations (extracted in
`research-findings/01-ttb-regulatory.md` Q6) require:

> "Address = city + State (postal abbreviation OK). Must match the
> basic permit. **Street, county, ZIP, phone, website are *optional*.**"
> — § 5.66 (spirits), § 4.35 (wine), § 7.66 (malt)

So the regulation explicitly says only city+state is mandatory on the
label. A label that prints `BARDSTOWN, KENTUCKY` for an applicant
filed at `123 Bourbon Lane, Bardstown, KY 40004` is **regulatory-
compliant**, and our grader is wrongly failing it.

### 1.3 Stakeholder evidence (from `PROJECT_BRIEF.md`)

- **Sarah Chen (Deputy Director):** "We need something my mother could
  figure out... clean, obvious, no hunting for buttons." Failing a
  regulator-compliant label as Fail because the matcher wanted a street
  number is the opposite of clean and obvious.
- **Dave Morrison (28-year senior agent):** "You can't just pattern
  match everything. Like, I had one last week where the brand name
  was 'STONE'S THROW' on the label but 'Stone's Throw' in the
  application. Technically a mismatch? Sure. But it's obviously the
  same thing. **You need judgment.**" The bottler-address case is the
  same shape — the label says less than the application, but it's
  obviously the same place.

---

## 2. Audit — every grader vs TTB + brief

Each row below maps a field to its current grader, what TTB requires,
what the brief says, and whether there's a gap.

### 2.1 Government warning (`lib/verify/strict/gov-warning.ts`)

| Aspect | State |
|---|---|
| **Today** | Three-layer strict matcher: case-sensitive `GOVERNMENT WARNING:` prefix → NFKC + smart-quote/dash fold → case-folded body exact compare → Damerau-Levenshtein distance for diagnostic. |
| **TTB (§ 16.21)** | Verbatim regulated text; "GOVERNMENT WARNING" must be capitals + bold; body is the prescribed string. |
| **Brief** | "Government Health Warning Statement (mandatory on all alcohol beverages)" — Jenny Park: "the 'GOVERNMENT WARNING:' part has to be in all caps and bold." |
| **Verdict** | **Aligned.** Already case-sensitive on the prefix, case-insensitive on the body (real labels render the body in either mixed-case or ALL CAPS — both are commonplace). 100% recall fuzz at numRuns=100 protects regression. |

### 2.2 ABV value (`lib/verify/strict/abv.ts`)

| Aspect | State |
|---|---|
| **Today** | Hand-rolled regex parser → numeric tolerance compare → beverage-aware tolerance band (spirits ±0.3, wine ±1.0/±1.5 with 14% boundary check, malt ±0.3). Internal-consistency check between ABV and Proof. |
| **TTB (§§ 5.65 / 4.36 / 7.65)** | Three accepted formats (`Alcohol __ percent by volume`, `__ percent alcohol by volume`, `Alcohol by volume __ percent`); same tolerances; wine taxable-grade-boundary rule. |
| **Brief** | "Alcohol content (with some exceptions for certain wine/beer)." Conditional rules already in `beverage-rules.ts`. |
| **Verdict** | **Aligned on numeric value.** Format-compliance (the three accepted format patterns) is **not** validated — the parser accepts many variants. The brief asks for value-match, not format-compliance, so this gap is acceptable. Documented for future work; not in scope here. |

### 2.3 Net contents (`lib/verify/strict/net-contents.ts`)

| Aspect | State |
|---|---|
| **Today** | Tokenise `(numeric, unit)` → convert to mL via `convert-units` → relative tolerance ≤ 0.1%. |
| **TTB (§§ 4.72, 5.203, 7.70)** | Wine + spirits have a **fixed list** of authorized standards of fill (e.g., 750 mL, 1 L, 375 mL, 50 mL, etc., enumerated in Q5). Malt uses US customary units, no fixed list. A 730 mL wine bottle is non-compliant. |
| **Brief** | "Net contents." No granularity guidance. |
| **Verdict** | **Value-match aligned.** The standards-of-fill regulatory check is **not** validated — a 730 mL wine label that matches a 730 mL application would Pass today, even though both are non-compliant. The brief defers to ttb.gov; standards-of-fill validation is a real (but lower-priority) gap. **Out of scope for this iteration**, documented as future work. |

### 2.4 Brand name (`lib/verify/nuanced/matchers.ts:brandMatch`)

| Aspect | State |
|---|---|
| **Today** | Standard nuanced ladder — NFKC + smart-quote/dash fold + case fold + punctuation strip → token_set_ratio (≥0.92 pass, 0.78–0.92 judge gray band, <0.78 fail). |
| **TTB (§§ 4.33 / 5.64 / 7.64)** | Brand name required; no specific format rules. |
| **Brief** | "Brand name matches? Check." (Sarah). Dave's STONE'S THROW vs Stone's Throw is the canonical nuance case the ladder must handle. |
| **Verdict** | **Aligned.** Stone's Throw caps test passes via Layer-1 normalisation collision. No identified gap. |

### 2.5 Class / type (`lib/verify/nuanced/matchers.ts:classTypeMatch`)

| Aspect | State |
|---|---|
| **Today** | Same standard ladder. |
| **TTB (Subpart I in each Part)** | Class/type must come from a fixed list of regulated designations (`Bourbon Whiskey` has substantive meaning; `Cabernet Sauvignon` requires 75%+ varietal). Substantive compliance is out of scope per brief's POC framing. |
| **Brief** | "Class/type designation" — listed without granularity. |
| **Verdict** | **Aligned for value-match.** "Is the printed class/type the same as the application's class/type?" works. Substantive compliance ("does this 38% ABV product really qualify as Vodka?") is intentionally out of scope. |

### 2.6 Bottler / producer NAME (`lib/verify/nuanced/matchers.ts:bottlerMatch`)

| Aspect | State |
|---|---|
| **Today** | Same standard ladder. |
| **TTB (§§ 5.66 / 4.35 / 7.66)** | Name as registered on basic permit; corporate suffixes (LLC, Inc.) optional. Spirits/malt also require a **function-describing phrase** before the name (`bottled by`, `distilled by`, `brewed and bottled by`, etc.). |
| **Brief** | "Name and address of bottler/producer." |
| **Verdict** | **Aligned for value-match.** Function-describing phrase check is **not** validated — "Bottled by ABC" vs "ABC" both pass via token_set_ratio because the phrase tokens are minor. Documented as future work; not in scope. |

### 2.7 Bottler / producer ADDRESS (`lib/verify/nuanced/matchers.ts:bottlerMatch` — same matcher as name) **← THE BUG**

| Aspect | State |
|---|---|
| **Today** | Same standard ladder, no special handling for state names, no ZIP awareness. Treats `Kentucky` and `KY` as different tokens. Treats `40004` (ZIP) as a content-bearing token equal to any other word. |
| **TTB (§ 5.66 / § 4.35 / § 7.66)** | "Address = city + State (postal abbreviation OK). Must match the basic permit. **Street, county, ZIP, phone, website are *optional*.**" |
| **Brief** | Same "Name and address of bottler/producer." |
| **Verdict** | **GAP — actively breaking.** Old Tom case fails despite city+state on the label. Fix below. |

### 2.8 Country of origin (`lib/verify/nuanced/matchers.ts:countryMatch`)

| Aspect | State |
|---|---|
| **Today (matcher)** | Strips leading "Product of / Made in / Imported from / Bottled in / Distilled in"; US alias table for "USA / U.S.A. / America / United States"; standard ladder for non-US. |
| **Today (rule)** | `evaluateRule(beverage, "countryOfOrigin", { isImported })` — but `isImported` is **never wired in** at `pipeline.ts:262`, so the rule always resolves to `optional` and the country row never enforces the required check. |
| **TTB (19 CFR Part 134, cross-referenced from § 5.67/5.68/4.35/7.68)** | Country-of-origin marking required for **imports**. |
| **Brief** | "Country of origin for imports." Explicitly conditional on import status. |
| **Verdict** | **Matcher aligned, requirement-rule GAP.** Bacardi (Puerto Rico), Ron Zacapa (Guatemala), and any future imported product currently grade as optional. Fix below: auto-derive `isImported` from the application's `countryOfOrigin` value via the existing US-alias table. |

### 2.9 Summary table

| Field | Status | Action |
|---|---|---|
| Government warning | ✅ Aligned | None |
| ABV value | ✅ Aligned | None (format-compliance future work) |
| **Net contents value** | ⚠️ **Value-match aligned, regulatory check missing** | **Task 3 — standards-of-fill warning** |
| Brand | ✅ Aligned | None |
| Class/type | ✅ Aligned | None (substantive compliance future work) |
| **Bottler name** | ⚠️ **Value-match aligned, function-phrase missing** | **Task 4 — function-phrase scan, warning** |
| **Bottler address** | ❌ **Broken** | **Task 1 — split matcher, add state aliasing, ZIP-strip** |
| **Country of origin** | ⚠️ **Matcher aligned, requirement-rule broken** | **Task 2 — auto-derive `isImported`** |

Two correctness fixes (Tasks 1 + 2); two new regulatory-warning checks
(Tasks 3 + 4). Decisions captured in `decisions/0009-grader-audit-
warnings-and-deferrals.md`.

---

## 3. Files to create / modify

### New files

| Path | Purpose |
|---|---|
| `lib/verify/nuanced/address.ts` | New matcher `bottlerAddressMatch`; state-name⇄abbreviation alias table; ZIP-code stripper. |
| `lib/verify/nuanced/address.test.ts` | Unit tests covering the Old Tom regression case + symmetric cases. |
| `lib/verify/strict/standards-of-fill.ts` | Pure module — `isAuthorizedFillSize(volumeMl, beverageType)`. Hardcoded lists from TTB §§ 4.72 (wine) and 5.203 (spirits, post-2025 TTB-200 amendments). |
| `lib/verify/strict/standards-of-fill.test.ts` | Unit tests covering authorized + unauthorized volumes per beverage class, including the 2025-added sizes (e.g., 355 mL spirits). |
| `lib/verify/nuanced/bottler-function-phrase.ts` | Pure module — `findBottlerFunctionPhrase(rawText, bottlerNameEvidence)`. Returns `{ found: boolean; phrase?: string }`. Approved-verb list from TTB §§ 5.66 / 4.35 / 7.66. |
| `lib/verify/nuanced/bottler-function-phrase.test.ts` | Unit tests — approved verbs detected; verbs in different positions; no verb returns false. |
| `decisions/0009-grader-audit-warnings-and-deferrals.md` | ADR documenting the four grader changes + the deferred items + why warnings (not fails) for the regulatory checks. |

### Modified files

| Path | Change |
|---|---|
| `lib/verify/pipeline.ts` | (a) Replace `bottlerMatch` call on the address field with `bottlerAddressMatch`. (b) Wire `isImported` into `ruleContext` from `expected.countryOfOrigin`. (c) After net-contents value-match passes, run `isAuthorizedFillSize` and demote pass→warning if non-compliant. (d) After bottler-name value-match passes, run `findBottlerFunctionPhrase` against `rawText` and demote pass→warning if no verb is found. |
| `lib/verify/pipeline.test.ts` | Regression tests for all four behaviors: city+state address pass, imported country required, non-standard fill warning, missing function-phrase warning. |
| `lib/verify/beverage-rules.test.ts` | Lock in the contract: country auto-detected as imported when expected is non-US. |
| `lib/verify/nuanced/matchers.ts` | Add exported `isUnitedStates` helper. Re-export `bottlerAddressMatch` for convenience. |
| `lib/verify/types.ts` | Add new `RuleOutcomeKind` values: `net_contents_non_standard_fill`, `bottler_function_phrase_missing`. |
| `lib/verify/explain/templates.ts` | Add explanation templates for the two new outcome kinds. |
| `lib/verify/explain/render.test.ts` | Coverage for the two new templates. |

---

## 4. Implementation order

Each step is bite-sized (2–5 min). TDD throughout: failing test first,
green it, refactor.

### Task 1 — Bottler-address matcher

#### Step 1.1 — Write the failing test for the Old Tom regression case

**Files:** Create `lib/verify/nuanced/address.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { bottlerAddressMatch } from "./address";

describe("bottlerAddressMatch", () => {
  it("Old Tom regression — label says 'Bardstown, Kentucky' but application has full street address", async () => {
    const outcome = await bottlerAddressMatch({
      extracted: "Bardstown, Kentucky",
      expected: "123 Bourbon Lane, Bardstown, KY 40004",
    });
    // City + state agree. TTB § 5.66: street, county, ZIP optional.
    expect(outcome.kind === "pass" || outcome.kind === "likely-match").toBe(true);
  });
});
```

Run: `pnpm vitest run lib/verify/nuanced/address.test.ts`
Expected: FAIL with "cannot find module './address'".

#### Step 1.2 — Stub the module so the import resolves but the test still fails

**Files:** Create `lib/verify/nuanced/address.ts`

```ts
import { runLadder, type CallJudgeFn, type LadderOutcome } from "./ladder";

export interface BottlerAddressMatchInput {
  extracted: string | null;
  expected: string;
  callJudge?: CallJudgeFn;
}

export function bottlerAddressMatch(
  input: BottlerAddressMatchInput,
): Promise<LadderOutcome> {
  // Placeholder — same as bottlerMatch today. Step 1.4 replaces this.
  return runLadder({ ...input, fieldName: "bottlerAddress" });
}
```

Run: `pnpm vitest run lib/verify/nuanced/address.test.ts`
Expected: FAIL — still produces `kind: "fail"` (the bug we're fixing).

#### Step 1.3 — Add the USPS state-name⇄abbreviation alias table

**Files:** Modify `lib/verify/nuanced/address.ts`

```ts
/**
 * USPS state-name → two-letter abbreviation map. Used to canonicalise
 * tokens so "Kentucky" and "KY" collide as the same token in the
 * nuanced ladder.
 *
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
  "puerto rico": "PR", guam: "GU", "american samoa": "AS",
  "us virgin islands": "VI", "u s virgin islands": "VI",
  "virgin islands": "VI", "northern mariana islands": "MP",
};

const ABBREV_SET = new Set(Object.values(STATE_NAME_TO_ABBREV));
```

#### Step 1.4 — Implement the address normaliser + use it before the ladder

**Files:** Modify `lib/verify/nuanced/address.ts`

```ts
/**
 * ZIP code regex — 5-digit or 5+4 with optional hyphen. Matched as a
 * whole word so we don't strip embedded street numbers like "123".
 */
const ZIP_REGEX = /\b\d{5}(?:-\d{4})?\b/g;

/**
 * Replace state names with their USPS abbreviation so "Kentucky" and
 * "KY" collide. Multi-word states ("New York") match before we tokenise.
 * Whole-word boundaries only — won't touch "California" inside a brand
 * name like "California Wines, LLC" because we operate on the address
 * field only.
 */
function aliasStateNames(text: string): string {
  let out = text;
  // Sort by length desc so "New York" wins over "York".
  const names = Object.keys(STATE_NAME_TO_ABBREV).sort(
    (a, b) => b.length - a.length,
  );
  for (const name of names) {
    const abbrev = STATE_NAME_TO_ABBREV[name]!;
    // Word-boundary, case-insensitive.
    const re = new RegExp(`\\b${name}\\b`, "gi");
    out = out.replace(re, abbrev);
  }
  return out;
}

/**
 * Address-specific pre-normalisation:
 *   1. Strip ZIP codes (TTB regulation says ZIP is optional, so it
 *      should not contribute to the similarity score).
 *   2. Alias full state names to their two-letter USPS abbreviation
 *      (so "Kentucky" and "KY" collide).
 *
 * The standard ladder still does NFKC + smart-quote fold + case fold +
 * punctuation strip + token_set_ratio on top. Subset-token cases
 * ("Bardstown, KY" ⊂ "123 Bourbon Lane, Bardstown, KY") score 100 by
 * construction in fuzzball.
 */
function normaliseAddressField(text: string): string {
  return aliasStateNames(text.replace(ZIP_REGEX, " "));
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
```

Run: `pnpm vitest run lib/verify/nuanced/address.test.ts`
Expected: PASS (1/1).

#### Step 1.5 — Add coverage for the symmetric cases + edge cases

**Files:** Modify `lib/verify/nuanced/address.test.ts`

```ts
it("label and application both render city + state — exact match passes", async () => {
  const outcome = await bottlerAddressMatch({
    extracted: "Bardstown, Kentucky",
    expected: "Bardstown, KY",
  });
  expect(outcome.kind === "pass" || outcome.kind === "likely-match").toBe(true);
});

it("Jack Daniels — application has ZIP, label doesn't", async () => {
  const outcome = await bottlerAddressMatch({
    extracted: "Lynchburg, Tennessee",
    expected: "Lynchburg, Tennessee 37352",
  });
  expect(outcome.kind === "pass" || outcome.kind === "likely-match").toBe(true);
});

it("real mismatch (different city) still fails", async () => {
  const outcome = await bottlerAddressMatch({
    extracted: "Louisville, Kentucky",
    expected: "Bardstown, KY 40004",
  });
  expect(outcome.kind).toBe("fail");
});

it("multi-word state (New York) aliases correctly", async () => {
  const outcome = await bottlerAddressMatch({
    extracted: "Brooklyn, NY",
    expected: "Brooklyn, New York 11201",
  });
  expect(outcome.kind === "pass" || outcome.kind === "likely-match").toBe(true);
});

it("territory (Puerto Rico) aliases to PR", async () => {
  const outcome = await bottlerAddressMatch({
    extracted: "San Juan, PR",
    expected: "San Juan, Puerto Rico 00901",
  });
  expect(outcome.kind === "pass" || outcome.kind === "likely-match").toBe(true);
});

it("missing extraction is missing, not fail", async () => {
  const outcome = await bottlerAddressMatch({
    extracted: null,
    expected: "Bardstown, KY",
  });
  expect(outcome.kind).toBe("missing");
});

it("ZIP digits in expected don't poison the score when extracted has no ZIP", async () => {
  // Without ZIP-stripping, the score would be diluted by 40004 as a
  // standalone token. Test the negative case explicitly.
  const outcome = await bottlerAddressMatch({
    extracted: "Bardstown, KY",
    expected: "Bardstown, KY 40004",
  });
  expect(outcome.kind === "pass" || outcome.kind === "likely-match").toBe(true);
});
```

Run: `pnpm vitest run lib/verify/nuanced/address.test.ts`
Expected: PASS (8/8 — including the original Old Tom test).

#### Step 1.6 — Wire the new matcher into the pipeline

**Files:** Modify `lib/verify/pipeline.ts`

Add the import near the top, alongside the existing `bottlerMatch`:

```ts
import {
  brandMatch,
  classTypeMatch,
  bottlerMatch,
  countryMatch,
} from "./nuanced/matchers";
import { bottlerAddressMatch } from "./nuanced/address";
```

In the BOTTLER ADDRESS block (around `pipeline.ts:548`), replace:

```ts
      const ladder = await bottlerMatch({
        extracted: typeof f.value === "string" ? f.value : null,
        expected: expected.bottlerAddress,
        callJudge,
      });
```

with:

```ts
      const ladder = await bottlerAddressMatch({
        extracted: typeof f.value === "string" ? f.value : null,
        expected: expected.bottlerAddress,
        callJudge,
      });
```

Leave the BOTTLER NAME block (around `pipeline.ts:496`) using
`bottlerMatch` unchanged — names are identity-bearing and don't need
state aliasing.

Run: `pnpm typecheck && pnpm vitest run lib/verify`
Expected: typecheck clean, all verify suites green.

#### Step 1.7 — Add a pipeline-level regression test

**Files:** Modify `lib/verify/pipeline.test.ts`

```ts
it("bottler address: city+state on label passes against full street-address-with-ZIP in the application (Old Tom regression)", async () => {
  const e = passingExtraction();
  // Override the address field to simulate what the synthetic Old Tom
  // label actually prints: city + state, all caps, no ZIP.
  e.bottlerAddress = {
    value: "BARDSTOWN, KENTUCKY",
    evidenceQuote: "BARDSTOWN, KENTUCKY",
    confidence: 0.95,
  };
  const result = await runVerificationPipeline({
    extracted: e,
    // Expected has the full mailing address from COLA — street, city,
    // state-abbreviation, ZIP. TTB § 5.66 says only city+state need to
    // appear on the label; the rest is optional.
    expected: {
      ...EXPECTED,
      bottlerAddress: "123 Bourbon Lane, Bardstown, KY 40004",
    },
    words: WORDS,
    rawText: GOV_WARNING_CANONICAL,
    imageDims: { width: 1024, height: 1280 },
  });
  const address = result.fieldResults.find((f) => f.field === "bottlerAddress");
  expect(address).toBeDefined();
  expect(["pass", "likely-match"]).toContain(address!.status);
});
```

Run: `pnpm vitest run lib/verify/pipeline.test.ts`
Expected: PASS (existing tests still green + new test green).

#### Step 1.8 — Commit

```bash
git add lib/verify/nuanced/address.ts lib/verify/nuanced/address.test.ts lib/verify/pipeline.ts lib/verify/pipeline.test.ts
git commit -m "fix(verify): bottler-address grader honors TTB § 5.66 (city+state only)"
```

### Task 2 — Country-of-origin auto-derive `isImported`

#### Step 2.1 — Failing test in `beverage-rules.test.ts`

**Files:** Modify `lib/verify/beverage-rules.test.ts`

```ts
it("country-of-origin: isImported true → required (post-fix: auto-derived from non-US country in application)", () => {
  expect(
    evaluateRule("distilled-spirits", "countryOfOrigin", {
      isImported: true,
    }),
  ).toBe("required");
});

it("country-of-origin: isImported false (US product) → optional", () => {
  expect(
    evaluateRule("wine", "countryOfOrigin", { isImported: false }),
  ).toBe("optional");
});
```

Run: `pnpm vitest run lib/verify/beverage-rules.test.ts`
Expected: these tests PASS already — the rule logic is in place. We're
locking in the contract before changing the caller.

#### Step 2.2 — Identify the US-alias check

The country matcher already exposes the US alias logic at
`lib/verify/nuanced/matchers.ts:66`. We'll lift it into a small named
helper so the pipeline can call it without going through the matcher.

**Files:** Modify `lib/verify/nuanced/matchers.ts`

Replace the existing `US_ALIASES` constant block with:

```ts
const US_ALIAS_LIST = [
  "usa",
  "u s a",
  "us",
  "u s",
  "united states",
  "united states of america",
  "america",
];

const US_ALIASES = new Set(US_ALIAS_LIST.map((s) => normaliseForLadder(s)));

/**
 * True when the supplied country string is a US alias under the same
 * Layer-1 normalisation used by the nuanced ladder. Empty / null /
 * non-string inputs return false (treat as imported by default — a
 * blank country in the application is suspicious).
 */
export function isUnitedStates(country: string | null | undefined): boolean {
  if (typeof country !== "string" || country.trim().length === 0) return false;
  return US_ALIASES.has(normaliseForLadder(country));
}
```

#### Step 2.3 — Wire `isImported` into the pipeline rule context

**Files:** Modify `lib/verify/pipeline.ts`

Update the import to include the new helper:

```ts
import {
  brandMatch,
  classTypeMatch,
  bottlerMatch,
  countryMatch,
  isUnitedStates,
} from "./nuanced/matchers";
```

Replace the existing `ruleContext` line at `pipeline.ts:262`:

```ts
  const ruleContext = { expectedAbv: expected.abv };
```

with:

```ts
  // Auto-derive `isImported` from the application's countryOfOrigin —
  // the brief's "country of origin for imports" maps cleanly to "if
  // it isn't US, it's imported." Avoids adding a separate UI flag the
  // applicant has to remember to tick.
  const ruleContext = {
    expectedAbv: expected.abv,
    isImported: !isUnitedStates(expected.countryOfOrigin),
  };
```

#### Step 2.4 — Add a pipeline-level test for the imported-product behavior

**Files:** Modify `lib/verify/pipeline.test.ts`

```ts
it("country of origin: imported product (Guatemala) is required, not optional", async () => {
  const e = passingExtraction();
  // Label correctly prints "Product of Guatemala".
  e.countryOfOrigin = {
    value: "Product of Guatemala",
    evidenceQuote: "Product of Guatemala",
    confidence: 0.95,
  };
  const result = await runVerificationPipeline({
    extracted: e,
    expected: { ...EXPECTED, countryOfOrigin: "Guatemala" },
    words: WORDS,
    rawText: GOV_WARNING_CANONICAL,
    imageDims: { width: 1024, height: 1280 },
  });
  const country = result.fieldResults.find((f) => f.field === "countryOfOrigin");
  expect(country).toBeDefined();
  // Required + matching → pass (or likely-match after normalisation).
  expect(["pass", "likely-match"]).toContain(country!.status);
});

it("country of origin: imported product with missing country marking on label is graded (not optional)", async () => {
  const e = passingExtraction();
  e.countryOfOrigin = { value: null, evidenceQuote: null, confidence: 0.6 };
  const result = await runVerificationPipeline({
    extracted: e,
    expected: { ...EXPECTED, countryOfOrigin: "Guatemala" },
    words: WORDS,
    rawText: GOV_WARNING_CANONICAL,
    imageDims: { width: 1024, height: 1280 },
  });
  const country = result.fieldResults.find((f) => f.field === "countryOfOrigin");
  expect(country).toBeDefined();
  // Required + missing → "missing" status (vs "not-required" if we had
  // wrongly defaulted isImported to false).
  expect(country!.status).toBe("missing");
});

it("country of origin: domestic product (United States) is optional, missing extraction is not-required", async () => {
  const e = passingExtraction();
  e.countryOfOrigin = { value: null, evidenceQuote: null, confidence: 0.6 };
  const result = await runVerificationPipeline({
    extracted: e,
    expected: { ...EXPECTED, countryOfOrigin: "United States" },
    words: WORDS,
    rawText: GOV_WARNING_CANONICAL,
    imageDims: { width: 1024, height: 1280 },
  });
  const country = result.fieldResults.find((f) => f.field === "countryOfOrigin");
  expect(country).toBeDefined();
  expect(country!.status).toBe("not-required");
});
```

Run: `pnpm vitest run lib/verify/pipeline.test.ts`
Expected: PASS (all three new tests + existing suite green).

#### Step 2.5 — Commit

```bash
git add lib/verify/nuanced/matchers.ts lib/verify/pipeline.ts lib/verify/pipeline.test.ts lib/verify/beverage-rules.test.ts
git commit -m "fix(verify): auto-derive isImported from countryOfOrigin so non-US products require country marking"
```

### Task 3 — Net-contents standards-of-fill (warning)

#### Step 3.1 — Failing test

**Files:** Create `lib/verify/strict/standards-of-fill.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { isAuthorizedFillSize } from "./standards-of-fill";

describe("isAuthorizedFillSize — TTB §§ 4.72 (wine) / 5.203 (spirits)", () => {
  it("750 mL is authorized for wine and spirits", () => {
    expect(isAuthorizedFillSize(750, "wine")).toBe(true);
    expect(isAuthorizedFillSize(750, "distilled-spirits")).toBe(true);
  });

  it("680 mL spirits is non-compliant (between 570 and 700)", () => {
    expect(isAuthorizedFillSize(680, "distilled-spirits")).toBe(false);
  });

  it("730 mL wine is non-compliant (between 720 and 750)", () => {
    expect(isAuthorizedFillSize(730, "wine")).toBe(false);
  });

  it("355 mL is authorized for both wine and spirits (2025 TTB-200 amendment)", () => {
    expect(isAuthorizedFillSize(355, "wine")).toBe(true);
    expect(isAuthorizedFillSize(355, "distilled-spirits")).toBe(true);
  });

  it("malt beverages always return true (no fixed list — § 7.70 uses US customary)", () => {
    expect(isAuthorizedFillSize(355, "malt-beverage")).toBe(true);
    expect(isAuthorizedFillSize(680, "malt-beverage")).toBe(true);
  });

  it("unknown beverage type returns true (don't false-flag unclassified products)", () => {
    expect(isAuthorizedFillSize(680, "unknown")).toBe(true);
  });

  it("wine sizes >3 L are authorized in even-liter increments (4 L, 5 L, etc.)", () => {
    expect(isAuthorizedFillSize(4000, "wine")).toBe(true);
    expect(isAuthorizedFillSize(5000, "wine")).toBe(true);
    expect(isAuthorizedFillSize(4500, "wine")).toBe(false);
  });

  it("tolerates 0.5 mL float drift on the canonical list", () => {
    expect(isAuthorizedFillSize(750.3, "wine")).toBe(true);
    expect(isAuthorizedFillSize(749.7, "wine")).toBe(true);
  });
});
```

Run: `pnpm vitest run lib/verify/strict/standards-of-fill.test.ts`
Expected: FAIL with "cannot find module".

#### Step 3.2 — Implement `standards-of-fill.ts`

**Files:** Create `lib/verify/strict/standards-of-fill.ts`

```ts
import type { BeverageType } from "@/lib/ai/schema";

/**
 * TTB authorized standards of fill for wine and distilled spirits.
 *
 * Sources (verbatim from research-findings/01-ttb-regulatory.md §Q5):
 *   - Wine: 27 CFR § 4.72 (T.D. TTB-200, eff. 2025-01-10)
 *   - Spirits: 27 CFR § 5.203 (T.D. TTB-200, eff. 2025-01-10)
 *
 * Malt beverages (§ 7.70) have no fixed list — they use US customary
 * units. We return true for malt unconditionally so the warning never
 * fires for them.
 *
 * "Unknown / other" returns true to avoid false-flagging unclassified
 * products. The reviewer can re-classify and re-run if needed.
 *
 * Wine and spirits both authorize sizes > 3 L in even-liter increments
 * (4 L, 5 L, 6 L, etc.); we encode this with a separate predicate.
 */

const WINE_SIZES_ML: ReadonlyArray<number> = [
  3000, 2250, 1800, 1500, 1000, 750, 720, 700, 620, 600, 568, 550, 500,
  473, 375, 360, 355, 330, 300, 250, 200, 187, 180, 100, 50,
];

const SPIRITS_SIZES_ML: ReadonlyArray<number> = [
  3750, 3000, 2000, 1800, 1750, 1500, 1000, 945, 900, 750, 720, 710, 700,
  570, 500, 475, 375, 355, 350, 331, 250, 200, 187, 100, 50,
];

const FLOAT_TOLERANCE_ML = 0.5;

function nearlyEquals(a: number, b: number): boolean {
  return Math.abs(a - b) <= FLOAT_TOLERANCE_ML;
}

function isAuthorizedWineSize(volumeMl: number): boolean {
  if (WINE_SIZES_ML.some((v) => nearlyEquals(v, volumeMl))) return true;
  // Even-liter increments above 3 L.
  if (volumeMl > 3000 && volumeMl % 1000 < FLOAT_TOLERANCE_ML) return true;
  return false;
}

function isAuthorizedSpiritsSize(volumeMl: number): boolean {
  return SPIRITS_SIZES_ML.some((v) => nearlyEquals(v, volumeMl));
}

export function isAuthorizedFillSize(
  volumeMl: number,
  beverageType: BeverageType,
): boolean {
  if (beverageType === "wine") return isAuthorizedWineSize(volumeMl);
  if (beverageType === "distilled-spirits")
    return isAuthorizedSpiritsSize(volumeMl);
  // Malt + unknown: pass through.
  return true;
}
```

Run: `pnpm vitest run lib/verify/strict/standards-of-fill.test.ts`
Expected: PASS (8/8).

#### Step 3.3 — Add the new RuleOutcomeKind + explanation template

**Files:** Modify `lib/verify/types.ts`

In the `RuleOutcomeKindSchema` enum, add `"net_contents_non_standard_fill"`:

```ts
  // Net-contents matcher kinds
  "net_contents_pass",
  "net_contents_unparseable",
  "net_contents_volume_mismatch",
  "net_contents_non_standard_fill",
```

**Files:** Modify `lib/verify/explain/templates.ts`

Add a template for the new kind. The template should reference the
volume found and the regulation:

```ts
  net_contents_non_standard_fill: (detail) =>
    `Net contents (${detail.foundMl} mL) match the application's expected value, but ${detail.foundMl} mL is not on the TTB authorized standards of fill for ${detail.beverageType} (27 CFR ${detail.cfrSection}). Reviewer should flag for non-standard fill or correct the application.`,
```

**Files:** Modify `lib/verify/explain/render.test.ts`

Append `"net_contents_non_standard_fill"` to the `ALL_KINDS` list to lock
in template coverage.

Run: `pnpm vitest run lib/verify/explain`
Expected: PASS (existing coverage holds; new kind has a template).

#### Step 3.4 — Wire the warning into the pipeline

**Files:** Modify `lib/verify/pipeline.ts`

Import the helper at the top:

```ts
import { isAuthorizedFillSize } from "./strict/standards-of-fill";
```

Inside the NET CONTENTS block (around `pipeline.ts:444`), AFTER the
existing volume-match outcome is computed but BEFORE
`buildFieldResult(...)` is called:

```ts
    // Warning overlay (Task 3): if the volume matches the application
    // but is NOT on the TTB authorized standards-of-fill list, demote
    // pass → warning. Brief defers to TTB; § 4.72 / § 5.203 enumerate
    // the authorized sizes. Reviewer makes the call.
    let finalStatus = status;
    if (
      outcome.status === "pass" &&
      outcome.foundMl !== null &&
      !isAuthorizedFillSize(outcome.foundMl, expected.beverageType)
    ) {
      finalStatus = "warning";
      ruleOutcomes.unshift({
        kind: "net_contents_non_standard_fill",
        detail: {
          foundMl: outcome.foundMl,
          beverageType: expected.beverageType,
          cfrSection:
            expected.beverageType === "wine" ? "§ 4.72" : "§ 5.203",
        },
      });
    }
    fieldResults.push(
      buildFieldResult({
        field: "netContents",
        label: "Net contents",
        status: finalStatus,
        // ... existing args unchanged
```

(The remaining args are unchanged; just substitute `status` →
`finalStatus`.)

#### Step 3.5 — Pipeline regression test

**Files:** Modify `lib/verify/pipeline.test.ts`

```ts
it("net contents: 680 mL spirits matches the application but warns on non-standard fill", async () => {
  const e = passingExtraction();
  e.netContents = {
    value: "680 mL",
    evidenceQuote: "680 mL",
    confidence: 0.95,
  };
  const result = await runVerificationPipeline({
    extracted: e,
    expected: { ...EXPECTED, netContents: "680 mL" },
    words: WORDS,
    rawText: GOV_WARNING_CANONICAL,
    imageDims: { width: 1024, height: 1280 },
  });
  const nc = result.fieldResults.find((f) => f.field === "netContents");
  expect(nc).toBeDefined();
  expect(nc!.status).toBe("warning");
  expect(nc!.outcomes[0]!.kind).toBe("net_contents_non_standard_fill");
});

it("net contents: 750 mL spirits is on the TTB list and passes cleanly", async () => {
  const result = await runVerificationPipeline({
    extracted: passingExtraction(),
    expected: EXPECTED, // 750 mL by default
    words: WORDS,
    rawText: GOV_WARNING_CANONICAL,
    imageDims: { width: 1024, height: 1280 },
  });
  const nc = result.fieldResults.find((f) => f.field === "netContents");
  expect(nc!.status).toBe("pass");
});
```

Run: `pnpm vitest run lib/verify/pipeline.test.ts`
Expected: PASS.

#### Step 3.6 — Commit

```bash
git add lib/verify/strict/standards-of-fill.ts lib/verify/strict/standards-of-fill.test.ts lib/verify/types.ts lib/verify/explain/templates.ts lib/verify/explain/render.test.ts lib/verify/pipeline.ts lib/verify/pipeline.test.ts
git commit -m "feat(verify): warn on non-standard net-contents fill (TTB §§ 4.72 / 5.203)"
```

### Task 4 — Bottler function-describing-phrase scan (warning)

#### Step 4.1 — Failing test

**Files:** Create `lib/verify/nuanced/bottler-function-phrase.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { findBottlerFunctionPhrase } from "./bottler-function-phrase";

describe("findBottlerFunctionPhrase — TTB §§ 5.66 / 4.35 / 7.66", () => {
  const EVIDENCE = "Old Tom Distillery, LLC";

  it("detects 'Bottled by' before the bottler name", () => {
    const result = findBottlerFunctionPhrase(
      "BOTTLED BY OLD TOM DISTILLERY, LLC\nBARDSTOWN, KENTUCKY",
      EVIDENCE,
    );
    expect(result.found).toBe(true);
    expect(result.phrase?.toLowerCase()).toContain("bottled by");
  });

  it("detects 'Distilled by' (spirits) — case-insensitive", () => {
    const result = findBottlerFunctionPhrase(
      "Distilled by Old Tom Distillery, LLC",
      EVIDENCE,
    );
    expect(result.found).toBe(true);
  });

  it("detects 'Brewed and bottled by' (malt — multi-word)", () => {
    const result = findBottlerFunctionPhrase(
      "Brewed and bottled by Old Tom Distillery, LLC",
      EVIDENCE,
    );
    expect(result.found).toBe(true);
  });

  it("detects 'Vinted and bottled by' (wine-specific)", () => {
    const result = findBottlerFunctionPhrase(
      "Vinted and bottled by Old Tom Distillery, LLC",
      EVIDENCE,
    );
    expect(result.found).toBe(true);
  });

  it("returns found=false when no approved verb is anywhere in the OCR", () => {
    const result = findBottlerFunctionPhrase(
      "Old Tom Distillery, LLC, Bardstown, Kentucky\nGOVERNMENT WARNING: ...",
      EVIDENCE,
    );
    expect(result.found).toBe(false);
  });

  it("only counts a verb that's near the bottler-name evidence (within 80 chars)", () => {
    // "Distilled by" appears in OCR but 200+ chars away from the
    // bottler name → does not count.
    const result = findBottlerFunctionPhrase(
      `Distilled by Some Other Brand at a different facility long ago.
       ${"x".repeat(200)}
       Old Tom Distillery, LLC`,
      EVIDENCE,
    );
    expect(result.found).toBe(false);
  });

  it("tolerates whitespace and case variation in the verb itself", () => {
    expect(
      findBottlerFunctionPhrase(
        "  bottled  by  Old Tom Distillery, LLC",
        EVIDENCE,
      ).found,
    ).toBe(true);
  });

  it("returns found=false when evidence is null/empty (skip the check, don't false-warn)", () => {
    expect(findBottlerFunctionPhrase("any text", null).found).toBe(false);
    expect(findBottlerFunctionPhrase("any text", "").found).toBe(false);
  });
});
```

Run: `pnpm vitest run lib/verify/nuanced/bottler-function-phrase.test.ts`
Expected: FAIL with "cannot find module".

#### Step 4.2 — Implement the scanner

**Files:** Create `lib/verify/nuanced/bottler-function-phrase.ts`

```ts
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
 * The scanner is intentionally tolerant — it only WARNS when no verb
 * is found near the bottler name. Compliance verbs that the LLM
 * stripped during structured extraction are still recoverable from
 * the raw OCR text, which is what we scan here.
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
 * of OCR while still rejecting unrelated mentions elsewhere on the
 * label.
 */
const PROXIMITY_WINDOW_CHARS = 80;

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export interface FunctionPhraseResult {
  found: boolean;
  phrase?: string;
}

export function findBottlerFunctionPhrase(
  rawText: string,
  bottlerNameEvidence: string | null | undefined,
): FunctionPhraseResult {
  if (
    typeof bottlerNameEvidence !== "string" ||
    bottlerNameEvidence.trim().length === 0
  ) {
    return { found: false };
  }
  const haystack = normalise(rawText);
  const needle = normalise(bottlerNameEvidence);
  const nameIndex = haystack.indexOf(needle);
  if (nameIndex < 0) {
    // Evidence not present in raw OCR — fall back to scanning the
    // entire OCR for any approved verb. Keeps the check tolerant.
    for (const phrase of APPROVED_PHRASES) {
      if (haystack.includes(phrase)) return { found: true, phrase };
    }
    return { found: false };
  }
  const windowStart = Math.max(0, nameIndex - PROXIMITY_WINDOW_CHARS);
  const window = haystack.slice(windowStart, nameIndex);
  for (const phrase of APPROVED_PHRASES) {
    if (window.includes(phrase)) return { found: true, phrase };
  }
  return { found: false };
}
```

Run: `pnpm vitest run lib/verify/nuanced/bottler-function-phrase.test.ts`
Expected: PASS (8/8).

#### Step 4.3 — Add the new RuleOutcomeKind + template

**Files:** Modify `lib/verify/types.ts`

Add `"bottler_function_phrase_missing"` to the `RuleOutcomeKindSchema`:

```ts
  // Nuanced ladder kinds
  "nuanced_pass",
  "nuanced_likely_match",
  "nuanced_manual_review",
  "nuanced_fail",
  "nuanced_missing",
  // Bottler-specific
  "bottler_function_phrase_missing",
```

**Files:** Modify `lib/verify/explain/templates.ts`

```ts
  bottler_function_phrase_missing: () =>
    "Bottler name matches the application's entry, but no TTB-approved function-describing phrase ('bottled by', 'distilled by', 'brewed and bottled by', etc.) was found near the bottler name in the OCR. § 5.66 / § 4.35 / § 7.66 require this phrase. Reviewer should confirm the verb is present on the artwork.",
```

**Files:** Modify `lib/verify/explain/render.test.ts`

Add `"bottler_function_phrase_missing"` to the `ALL_KINDS` list.

#### Step 4.4 — Wire the scan into the pipeline

**Files:** Modify `lib/verify/pipeline.ts`

Add the import:

```ts
import { findBottlerFunctionPhrase } from "./nuanced/bottler-function-phrase";
```

Inside the BOTTLER NAME block (around `pipeline.ts:496`), AFTER
`ladderToStatus(...)` returns, before `buildFieldResult(...)`:

```ts
      // Warning overlay (Task 4): if value-match passed but the OCR
      // text contains no approved function-describing phrase near the
      // bottler-name evidence, demote pass → warning. § 5.66 / § 4.35
      // / § 7.66 require the verb. We scan the RAW OCR, not the
      // structured `bottlerName` field, because the LLM strips the
      // verb during extraction — false-failing every label otherwise.
      let finalStatus = status;
      const finalOutcomes: RuleOutcome[] = [ruleOutcome];
      if (status === "pass" || status === "likely-match") {
        const phrase = findBottlerFunctionPhrase(rawText, f.evidenceQuote);
        if (!phrase.found) {
          finalStatus = "warning";
          finalOutcomes.unshift({
            kind: "bottler_function_phrase_missing",
            detail: {},
          });
        }
      }
      fieldResults.push(
        buildFieldResult({
          field: "bottlerName",
          label: "Bottler / producer",
          status: finalStatus,
          // ... rest unchanged
          outcomes: finalOutcomes,
          // ...
```

(Substitute `status` → `finalStatus`, `[ruleOutcome]` → `finalOutcomes`
in the existing call.)

#### Step 4.5 — Pipeline regression tests

**Files:** Modify `lib/verify/pipeline.test.ts`

```ts
it("bottler name: matches application AND raw OCR has 'Bottled by' near the name → pass", async () => {
  const result = await runVerificationPipeline({
    extracted: passingExtraction(),
    expected: EXPECTED,
    words: WORDS,
    rawText:
      "BOTTLED BY OLD TOM DISTILLERY, LLC\nBARDSTOWN, KENTUCKY\n" +
      GOV_WARNING_CANONICAL,
    imageDims: { width: 1024, height: 1280 },
  });
  const bn = result.fieldResults.find((f) => f.field === "bottlerName");
  expect(bn!.status).toBe("pass");
});

it("bottler name: matches application but raw OCR has no function verb → warning", async () => {
  const result = await runVerificationPipeline({
    extracted: passingExtraction(),
    expected: EXPECTED,
    words: WORDS,
    // No "Bottled by" / "Distilled by" / etc. anywhere in the OCR.
    rawText: "Old Tom Distillery, LLC\nBardstown, Kentucky\n" + GOV_WARNING_CANONICAL,
    imageDims: { width: 1024, height: 1280 },
  });
  const bn = result.fieldResults.find((f) => f.field === "bottlerName");
  expect(bn!.status).toBe("warning");
  expect(bn!.outcomes[0]!.kind).toBe("bottler_function_phrase_missing");
});
```

Run: `pnpm vitest run lib/verify/pipeline.test.ts`
Expected: PASS.

#### Step 4.6 — Commit

```bash
git add lib/verify/nuanced/bottler-function-phrase.ts lib/verify/nuanced/bottler-function-phrase.test.ts lib/verify/types.ts lib/verify/explain/templates.ts lib/verify/explain/render.test.ts lib/verify/pipeline.ts lib/verify/pipeline.test.ts
git commit -m "feat(verify): warn when bottler function-describing phrase missing (TTB §§ 5.66 / 4.35 / 7.66)"
```

### Task 5 — Update `evaluateRule` docstring + memory bank

#### Step 5.1 — Update the docstring on the conditional evaluator

**Files:** Modify `lib/verify/beverage-rules.ts`

Replace the existing comment block on `RuleContext.isImported` with:

```ts
/**
 * Imported product flag. Country-of-origin is required for imports
 * per 19 CFR Part 134 (cross-referenced from § 5.67/5.68/7.68/4.35).
 *
 * Auto-derived in the pipeline from `expected.countryOfOrigin` via
 * `isUnitedStates(...)` — any non-US country implies imported. The
 * brief's "country of origin for imports" maps cleanly to this rule;
 * the application form does not need a separate `isImported` checkbox.
 */
isImported?: boolean;
```

#### Step 5.2 — Note all four changes in the memory bank

**Files:** Modify `memory-bank/active-context.md`

In the "Just completed" section add:

```md
- **Grader audit (post-redesign) — four changes per ADR 0009.**
  (1) Bottler-address grader now strips ZIPs and aliases full state
  names to USPS two-letter abbreviations before the ladder — the
  Old Tom case ("BARDSTOWN, KENTUCKY" on label vs "123 Bourbon Lane,
  Bardstown, KY 40004" in application) now passes (TTB § 5.66:
  city+state only; street + ZIP optional).
  (2) Country-of-origin's requirement rule is now auto-derived from
  the application's `countryOfOrigin` value (any non-US country →
  required) instead of always defaulting to optional.
  (3) Net-contents value-match now warns (not fails) on volumes that
  aren't on the TTB authorized standards-of-fill list (§§ 4.72 / 5.203).
  (4) Bottler name now warns (not fails) when no TTB-approved
  function-describing phrase ("Bottled by", "Distilled by", etc.) is
  found near the bottler name in the raw OCR (§§ 5.66 / 4.35 / 7.66).
```

#### Step 5.3 — Write ADR 0009

**Files:** Create `decisions/0009-grader-audit-warnings-and-deferrals.md`

(Content sketched in the ADR section below — written at the same time
as this plan to capture decisions and rationale.)

#### Step 5.4 — Commit

```bash
git add lib/verify/beverage-rules.ts memory-bank/active-context.md decisions/0009-grader-audit-warnings-and-deferrals.md
git commit -m "docs: ADR 0009 grader audit + memory-bank update"
```

### Task 6 — Quality gates + push

#### Step 6.1 — Full quality gate

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm test:e2e
```

Expected: all green. Vitest count rises from 585 → ~615 (the four new
modules add ~30 unit tests; the explanation-render-coverage suite
expands by 2; pipeline tests add 5).

#### Step 6.2 — Push

```bash
git push origin main
```

Vercel auto-deploys.

---

## 5. Touch list (cheat sheet)

```
NEW:
  lib/verify/nuanced/address.ts
  lib/verify/nuanced/address.test.ts
  lib/verify/strict/standards-of-fill.ts
  lib/verify/strict/standards-of-fill.test.ts
  lib/verify/nuanced/bottler-function-phrase.ts
  lib/verify/nuanced/bottler-function-phrase.test.ts
  decisions/0009-grader-audit-warnings-and-deferrals.md

MODIFIED:
  lib/verify/nuanced/matchers.ts          (export isUnitedStates helper)
  lib/verify/pipeline.ts                  (4 grader changes)
  lib/verify/pipeline.test.ts             (regression tests)
  lib/verify/beverage-rules.ts            (docstring update only)
  lib/verify/beverage-rules.test.ts       (lock in contract)
  lib/verify/types.ts                     (2 new RuleOutcomeKind values)
  lib/verify/explain/templates.ts         (2 new templates)
  lib/verify/explain/render.test.ts       (cover new kinds)
  memory-bank/active-context.md           (status note)

UNCHANGED (intentionally):
  lib/verify/strict/gov-warning.ts        (already aligned)
  lib/verify/strict/abv.ts                (already aligned on value)
  lib/verify/strict/net-contents.ts       (value-match unchanged; warning is overlay)
  lib/verify/status-engine.ts             (no status-engine change — overlays at pipeline level)
```

---

## 6. Quality gate checklist

- [ ] `pnpm typecheck` — clean
- [ ] `pnpm lint` — clean
- [ ] `pnpm vitest run` — green; new address suite + new pipeline cases
- [ ] `pnpm test:e2e` — green (no e2e changes expected)
- [ ] `pnpm eval:deterministic` — still 37/37, gov-warning recall 11/11

---

## 7. Edge cases & gotchas

- **Embedded street numbers (e.g., "123 Bourbon Lane") look like ZIPs**
  to a naïve regex. We use `\b\d{5}(?:-\d{4})?\b` — strictly 5 digits or
  5+4 with optional hyphen. "123" doesn't match. "40004" does.
- **State name inside a brand**: not a concern here because address
  normalisation runs only on the address field. The bottler *name*
  field still uses the original `bottlerMatch` and is unaffected.
- **Ambiguous "DC"**: "DC" is a USPS abbreviation but also a common
  brand suffix. Within an address field this is acceptable — alias
  collisions only happen when both sides are addresses.
- **"Tennessee 37352" vs "Tennessee"**: ZIP-strip leaves "Tennessee"
  on both sides, then alias to "TN" on both. Subset → pass. ✅
- **Imported product with US-territory country (Puerto Rico)**: the
  TTB regulations treat PR as US for some purposes and as imported for
  others (it has its own ABLA carve-outs). This plan treats PR as
  **imported** because the alias table only includes the contiguous US
  + "America". If the user wants PR to grade as domestic, add it to
  `US_ALIAS_LIST` — out of scope for this plan, but documented here so
  a future agent doesn't re-litigate.
- **Empty / blank countryOfOrigin in application**: `isUnitedStates`
  returns false for blank input → product is treated as imported →
  country becomes required. Reasonable conservative default; a
  reviewer can override.

---

## 8. Out-of-scope (deferred)

Real TTB gaps that we explicitly chose NOT to cover in this iteration.
ADR 0009 captures the reasoning; this section is the executable
summary for a future agent.

1. **ABV format-compliance check.** §§ 5.65 / 4.36 / 7.65 require one
   of three specific format patterns ("Alcohol __ percent by volume",
   etc.). The current parser accepts many forms (great for extraction)
   but doesn't flag a non-compliant FORMAT. Likely a nuanced/manual-
   review check, not strict-fail.
2. **Class/type substantive compliance.** "Bourbon Whiskey" has 51%-
   corn-grain rules; "Cabernet Sauvignon" has 75%-varietal rules. Out
   of scope per brief's POC framing — Marcus's "we're not looking to
   integrate" rules out substantive lookups.
3. **Type-size / contrast / placement rules** for the gov warning
   (§ 16.22). Real but uncoverable today — we lack DPI metadata for
   mm measurement, and contrast detection is brittle on photos with
   glare/skew. A smaller LLM-based "is the warning visually prominent"
   rating could land here in a future pass without making false-promise
   claims about pixel-to-mm conversions; deferred until we decide
   whether to extend the extraction prompt.

---

## 9. Definition of done

- Open `https://prooflens-ai.vercel.app/queue` → click Old Tom row →
  click Verify → bottler address row shows **Pass** (or Likely Match)
  with a confidence pill ≥ 95%.
- Click an imported scenario (Bacardi or Ron Zacapa from the real-
  photo manifest) → country-of-origin row enforces the required rule
  (no longer "not-required").
- A scenario with a non-standard fill volume (e.g., a hand-crafted
  680 mL spirits demo) shows **Warning** on net-contents with the
  `net_contents_non_standard_fill` explanation prose.
- A scenario whose label OCR has no function-describing phrase shows
  **Warning** on bottler-name with the
  `bottler_function_phrase_missing` explanation prose.
- `pnpm vitest run` — green, with the four new pure modules plus
  pipeline regression tests landing.
- `pnpm test:e2e` — green (no spec changes expected; behavior is
  field-grader-internal, surfaced as new warning rows).
- `decisions/0009-grader-audit-warnings-and-deferrals.md` exists and
  cites § 5.66 / § 4.35 / § 7.66, § 4.72 / § 5.203, plus stakeholder
  quotes from `PROJECT_BRIEF.md`.
- `git grep -i "garces\|prior_art\|sebastiangarces"` — empty (existing
  invariant from the queue-redesign plan; this plan adds nothing in
  that direction).
- Commit log shows the four focused commits: address grader, country
  auto-derive, standards-of-fill warning, function-phrase warning,
  followed by docs/ADR.

---

## 10. ADR 0009 content (to be saved verbatim at `decisions/0009-grader-audit-warnings-and-deferrals.md`)

```markdown
# 0009: Grader audit — alignment, warnings, and deferrals

**Date:** 2026-05-03
**Status:** Accepted
**Phase:** Post-Phase-9 polish

## Context

Phase-9 user testing surfaced a real grading bug: the bottler-address
matcher returned **Fail** on `BARDSTOWN, KENTUCKY` for an application
filed at `123 Bourbon Lane, Bardstown, KY 40004`. That triggered a
full audit of every field grader against (a) `PROJECT_BRIEF.md`, (b)
the verbatim TTB regulations captured in
`research-findings/01-ttb-regulatory.md`, and (c) the actual demo
scenarios.

The audit found two correctness gaps and two regulatory checks the
grader silently passed even when the label was non-compliant. This
ADR records the four decisions, the framing as warnings (not fails)
for the regulatory adds, and the deferred items.

## Decisions

### 1. Bottler-address grader: city + state only

**Change:** New `bottlerAddressMatch(...)` matcher used only on the
`bottlerAddress` field. Pre-normalisation: strip 5-digit ZIP codes
(and ZIP+4) as whole-word tokens; alias full state names ("Kentucky",
"New York", "Puerto Rico") to USPS two-letter abbreviations before
running the standard nuanced ladder.

**Why:**

> "Address = city + State (postal abbreviation OK). Must match the
> basic permit. **Street, county, ZIP, phone, website are *optional*.**"
> — 27 CFR § 5.66 (spirits), § 4.35 (wine), § 7.66 (malt)

The bottler `name` field continues to use the original `bottlerMatch`
because state aliasing and ZIP stripping aren't appropriate there.

**Stakeholder evidence:** Dave Morrison's "you need judgment" example
(STONE'S THROW vs Stone's Throw) is the same shape — the label says
less than the application but it's obviously the same place.

### 2. Country-of-origin: auto-derive `isImported`

**Change:** In `lib/verify/pipeline.ts`, set
`ruleContext.isImported = !isUnitedStates(expected.countryOfOrigin)`,
where `isUnitedStates` is a small exported helper using the existing
US-aliases table from `countryMatch`.

**Why:**

> "Country of origin for imports" — `PROJECT_BRIEF.md`

Maps cleanly to "if it isn't US, it's imported." Avoids a separate UI
checkbox the applicant has to remember to tick. CBP rules at 19 CFR
Part 134 (cross-referenced from § 5.67/5.68/4.35/7.68) require the
country marking only for imports.

### 3. Net-contents standards-of-fill: warn (not fail)

**Change:** New pure helper `isAuthorizedFillSize(volumeMl, beverageType)`.
After the existing volume-match check passes, demote `pass → warning`
when the volume isn't on the TTB list. Volume-match semantics
unchanged; the warning is an overlay.

**Why warn, not fail:** The brief says check that "what's on the label
matches what's in the application." When label and application both
say `680 mL`, the **match** is correct — the regulatory issue is that
both are on a non-standard fill. That's reviewer-judgment territory:
the agent might know the applicant has a § 5.203 variance, or might
need to kick the application back. We surface; we don't pre-judge.

**Source:** `research-findings/01-ttb-regulatory.md` Q5 enumerates the
authorized lists per § 4.72 (wine) and § 5.203 (spirits, post-2025
TTB-200). Malt has no fixed list (§ 7.70 — US customary units).

### 4. Bottler function-describing phrase: warn (not fail)

**Change:** New pure helper `findBottlerFunctionPhrase(rawText, evidence)`
that scans the raw OCR text — NOT the structured `bottlerName` field —
for any of the TTB-approved verbs (`Bottled by`, `Distilled by`,
`Brewed and bottled by`, `Vinted and bottled by`, etc.) within an
80-character window of the bottler-name evidence quote. After the
bottler-name value-match passes, demote `pass → warning` if no verb
is found.

**Why warn, not fail; why scan the raw OCR not the structured field:**
The LLM extractor today returns a clean bottler name like
`Old Tom Distillery, LLC` even when the artwork prints
`BOTTLED BY OLD TOM DISTILLERY, LLC` — it strips the verb during
extraction. Checking the structured field would false-fail every
compliant label. Scanning the raw OCR (which we already have as
`rawText` from Tesseract) catches the verb regardless of how the
LLM parsed it.

The 80-char proximity window prevents matching unrelated mentions of
a verb elsewhere on the label (e.g., a fanciful tagline that happens
to include "made by hand").

**Source:** `research-findings/01-ttb-regulatory.md` Q6 enumerates the
approved verbs per § 5.66 / § 4.35 / § 7.66.

## Why warnings (not fails) for #3 and #4

Failing a label that the matcher confirmed matches the application
would contradict the brief's mental model. Sarah's "agent pulls up an
application, looks at the label artwork, and checks that what's on
the label matches what's in the application" is a **match** check.
The TTB regulatory checks (#3, #4) are a different axis: even when
the match is correct, the label can be regulatorially imperfect.

Warnings let us:
- Preserve the brief's match semantics (Pass = label matches app).
- Surface the regulatory deviation for human judgment.
- Avoid hard-failing a label the applicant might have a variance for.
- Avoid false-failing extraction artifacts (the function-phrase case).

If the user later wants strict compliance failures, the warning →
fail upgrade is a one-line change in each block.

## Aligned (no change)

Per the audit in the plan §2, these graders match TTB + brief today:

- Government warning text (§ 16.21) — verbatim matcher with mutation-
  fuzz CI gate; case-folds the body so ALL-CAPS labels pass
  (regulation prescribes capitalisation only on the prefix).
- ABV value (§§ 5.65 / 4.36 / 7.65) — beverage-aware tolerances;
  taxable-grade boundary check for wine.
- Brand name — standard nuanced ladder.
- Class/type designation — standard nuanced ladder.

## Deferred

Real TTB gaps we explicitly chose NOT to cover this iteration:

1. **ABV format-compliance check** — the parser accepts many forms
   for extraction; format compliance is a separate axis.
2. **Class/type substantive compliance** — would need formula data
   outside our system; out of scope per Marcus's "we're not looking
   to integrate with COLA directly."
3. **§ 16.22 type-size / contrast / placement** — real but uncoverable
   today: we lack DPI metadata for mm measurement, and contrast/bold
   detection is brittle on photos with glare/skew (the Ron Zacapa
   real-photo cases already trip our existing image-quality
   heuristics; layering more vision checks compounds the noise). A
   smaller LLM-based "is the warning visually prominent" rating could
   land here in a future pass without making false-promise claims
   about pixel-to-mm conversions; deferred until we decide whether to
   extend the extraction prompt.

## Implementation

- `lib/verify/nuanced/address.ts` — bottler-address matcher.
- `lib/verify/nuanced/bottler-function-phrase.ts` — function-phrase scanner.
- `lib/verify/strict/standards-of-fill.ts` — authorized-volumes lookup.
- `lib/verify/nuanced/matchers.ts` — exports `isUnitedStates`.
- `lib/verify/pipeline.ts` — wires all four behaviors.
- `lib/verify/types.ts` — adds `net_contents_non_standard_fill` and
  `bottler_function_phrase_missing` to `RuleOutcomeKindSchema`.
- `lib/verify/explain/templates.ts` — explanation strings for the new
  outcomes.

## Consequences

### Wins

- Old Tom regression fixed; real-photo scenarios (Bacardi, Ron Zacapa,
  Jack Daniels) all pass on bottler-address with city+state alone.
- Imported products now correctly enforce the country-of-origin
  required rule.
- Two new regulatory dimensions surfaced as warnings — net-contents
  standards-of-fill and bottler function-describing phrase — without
  introducing false-fails on compliant labels.
- ADR makes the "warning vs fail" framing explicit for future agents.

### Trade-offs

- Two new RuleOutcome kinds expand the explanation registry; the
  templates registry test will require both to be covered.
- The function-phrase scanner runs on every nuanced bottler-name
  check, but it's a pure string scan over OCR text we already have —
  no extra latency.
- Standards-of-fill list is hardcoded; future TTB amendments require
  a code change. Acceptable: the list moves about once every five
  years (last amendment was T.D. TTB-200, 2025-01-10).

## Supersedes

None. Extends ADR 0002 (verification pipeline architecture).
```

---

## Notes for the executor

- **TDD throughout.** Each task starts with a failing test, then
  minimal implementation, then green confirmation, then commit.
- **Frequent commits.** Five commits total: one per task plus a
  docs commit. Don't batch.
- **`pnpm vitest run` after every task** — the suite is fast (~22 s)
  and catches regressions before they pile up.
- **Don't refactor the status engine.** The two warnings are overlays
  applied in `pipeline.ts` after `buildFieldResult` — the engine
  itself stays simple. Warning-as-overlay is the chosen pattern.
- **No new deps.** Everything uses existing `fuzzball` + plain JS.
