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
US-aliases table from `countryMatch`. Also added the missing "optional
+ extraction null = not-required" branch to the country block,
mirroring the existing ABV pattern.

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

Tolerance hierarchy:
1. **Strict proximity check first** — only count a verb that precedes
   the bottler name within the window. Rejects unrelated mentions of
   a verb that pertain to a different brand on the same label.
2. **If the evidence quote is null/empty (LLM didn't extract one)
   OR can't be located in the OCR** (fragmentation drift), fall back
   to scanning the entire OCR. Avoids false-warning purely because
   of an extraction artifact.

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
would contradict the brief's mental model. Sarah Chen's *"agent pulls
up an application, looks at the label artwork, and checks that what's
on the label matches what's in the application"* is a **match** check.
The TTB regulatory checks (#3, #4) are a different axis: even when
the match is correct, the label can be regulatorily imperfect.

Warnings let us:
- Preserve the brief's match semantics (Pass = label matches app).
- Surface the regulatory deviation for human judgment.
- Avoid hard-failing a label the applicant might have a variance for.
- Avoid false-failing extraction artifacts (the function-phrase case).

If we later want strict compliance failures, the warning → fail
upgrade is a one-line change in each block.

## Aligned (no change)

Per the audit in the plan §2, these graders match TTB + brief today:

- **Government warning text** (§ 16.21) — verbatim matcher with
  mutation-fuzz CI gate; case-folds the body so ALL-CAPS labels pass
  (regulation prescribes capitalisation only on the prefix).
- **ABV value** (§§ 5.65 / 4.36 / 7.65) — beverage-aware tolerances;
  taxable-grade boundary check for wine.
- **Brand name** — standard nuanced ladder.
- **Class/type designation** — standard nuanced ladder.

## Deferred

Real TTB gaps we explicitly chose NOT to cover this iteration:

1. **ABV format-compliance check** (§§ 5.65 / 4.36 / 7.65). The
   parser accepts many forms for extraction; format compliance —
   the regulation prescribes one of three specific patterns —
   is a separate axis. A label that says `Strength 40%` or `40% A/V`
   would pass our value-check but fail real TTB review. Future work.
2. **Class/type substantive compliance.** "Bourbon Whiskey" has a
   51%-corn-grain rule; "Cabernet Sauvignon" has a 75%-varietal
   rule. Verifying these would need formula data outside our system.
   Out of scope per Marcus Williams's *"we're not looking to integrate
   with COLA directly"*.
3. **§ 16.22 type-size / contrast / placement** for the gov warning.
   Real but uncoverable today: we lack DPI metadata for mm
   measurement, and contrast/bold detection is brittle on photos
   with glare/skew (the Ron Zacapa real-photo cases already trip our
   existing image-quality heuristics; layering more vision checks
   compounds the noise). A smaller LLM-based "is the warning
   visually prominent" rating could land here in a future pass
   without making false-promise claims about pixel-to-mm conversions;
   deferred until we decide whether to extend the extraction prompt.

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
  templates registry test required both to be covered (done).
- The function-phrase scanner runs on every nuanced bottler-name
  check, but it's a pure string scan over OCR text we already have —
  no extra latency.
- Standards-of-fill list is hardcoded; future TTB amendments require
  a code change. Acceptable: the list moves about once every five
  years (last amendment was T.D. TTB-200, 2025-01-10).

## Supersedes

None. Extends ADR 0002 (verification pipeline architecture).
