# 0002: Verification Pipeline Architecture

**Date:** 2026-04-30
**Status:** accepted
**Slice:** 0003 (AI tracer milestone)

## Context

proofLens needs to extract structured fields from alcohol-label images,
compare each field against expected application data, and assign a
status drawn from an 8-state enum (Pass / Likely Match / Warning /
Fail / Missing / Low Confidence / Needs Manual Review / Not Required).
The hard constraint from PRESEARCH.md and ALIGNMENT.md is **100%
recall on government-warning strict-fail** — zero missed
capitalization, missing-prefix, or modified-text cases — while still
handling nuanced fields where minor differences (capitalization,
punctuation, smart quotes) should produce "Likely Match" rather than
"Fail."

The Phase 1 research (`research-findings/03-verification-logic.md`)
recommended a **hybrid deterministic-first** pattern: strict fields
flow through pure code with a CI mutation fuzz harness; nuanced fields
flow through a typed match-ladder with an LLM-judge gating only the
configured "gray band" of similarity scores. This ADR records the
implementation as it landed in slice 0003.

## Decision

### Pipeline shape

```
extracted FieldResult[]   expected ApplicationData
         └──── field router ────┘
                   │
       ┌───────────┴───────────┐
       ▼                       ▼
   STRICT (gov-warning,    NUANCED (brand,
   ABV, net-contents)      class, bottler,
       │                   country)
   pure code,                  │
   no LLM-judge,           match ladder
   CI mutation fuzz        + LLM-judge in
   on gov-warning          0.78–0.92 band
       │                       │
       └─── status engine ─────┘
                   │
            explanation render
                   │
              FieldResult
```

### Strict matchers (`lib/verify/strict/`)

- **Government warning**: three layers
  1. Prefix (case-sensitive `text.startsWith("GOVERNMENT WARNING:")`)
  2. Body (NFKC + smart-quote/dash collapse + Markdown strip +
     whitespace collapse → exact compare to canonical § 16.21)
  3. Damerau-Levenshtein distance for the explanation prose
- **ABV**: hand-rolled regex parser handles `45% Alc./Vol.`, `45% ABV`,
  `Alcohol 45% by Volume`, `90 Proof` (proof ÷ 2 = ABV). This slice
  ships spirits ±0.3 pp tolerance only; wine and malt tolerances land
  in slice 0004 with beverage-aware routing.
- **Net contents**: `convert-units` converts mL ↔ L ↔ cL ↔ fl oz with
  a 0.1% tolerance.

Strict fields **cannot architecturally reach the LLM-judge** — only
the nuanced ladder calls `callJudge` (and only inside the gray band).

### Nuanced ladder (`lib/verify/nuanced/`)

```
strip case → strip punct → NFKC → fuzzball.token_set_ratio →
  ≥ 92  → Pass (Likely Match if not byte-equal)
  0.78–0.92 → callJudge() → status from judge (cached per session)
  < 0.78 → Fail (or Manual Review if confidence low)
```

Per-field wrappers (`brand.ts`, `class-type.ts`, `bottler.ts`,
`country.ts`) configure thresholds and explanation field-name labels.
Country-of-origin includes a small alias table (e.g. "USA" ≡ "United
States of America" ≡ "U.S.").

### LLM-judge endpoint (`/api/judge-field`)

Stateless POST with module-scoped LRU cache keyed on
`(extracted, expected, fieldName)`. Strict tool-use schema returns
`{ result: 'equivalent' | 'not_equivalent' | 'uncertain', reasoning }`.

**Important caveat shipped in slice 0003:** the endpoint exists, the
prompt is locked, and the cache is unit-tested — but the call site
inside `runVerificationPipeline` is not yet threaded. Gray-band cases
route to "Manual Review" until a follow-up commit (planned for slice
0009) flips the switch. This was an explicit deferral noted in the
slice spec.

### Status engine (`lib/verify/status-engine.ts`)

Pure function from `(matchStrength, aiConfidence, imageQualityPoor)`
to the 8-state enum. Strict cells collapse to
`{Pass, Fail, Missing, Low Confidence}` — no "Likely Match" on a
strict check. The `imageQualityPoor` parameter is wired but currently
ignored; it becomes the override hook in slice 0004.

### Explanations (`lib/verify/explain/`)

Templated rule-sourced explanations are the audit-of-record. Every
`RuleOutcome` kind (19 in this slice) has a registered template.
Optional LLM-narrative explanation on Manual-Review rows is a future
enhancement (the templates can carry a `narrativeExplanation` field
when wired).

### CI mutation fuzz harness

`test/fixtures/mutations/gov-warning-mutations.ts` defines
`fast-check` generators for 11 mutation categories (cap drop on
prefix, comma drops, word substitution, sentence reorder, smart-quote
injection, prefix lowercase / title-case / missing, char-insert,
char-delete, trailing extras). The test asserts every mutation is
rejected at `numRuns: 100`. Build fails if any mutation passes.

This is the safety net for the 100%-recall constraint.

### Tesseract.js as ground truth

Tesseract runs **in parallel** with the LLM (`Promise.all`) on every
label. Tesseract supplies the raw text + word-level bboxes + the
gov-warning ground truth (cropped paragraph). The LLM never
transcribes the gov-warning text — it only locates the warning
region; the strict matcher operates on Tesseract's output.

This defends against the documented vision-LLM behavior of silently
normalizing capitalization on the warning paragraph (research-finding
that justified bringing in an OCR sidecar).

### bbox highlights (`lib/bbox/locate.ts`)

For each field, `locate(evidenceQuote, words): Polygon | null`
finds the LLM's `evidenceQuote` in Tesseract's word stream and
returns the union polygon of matching words. Slice 0003 ships
exact-match only; fuzzy fallback (sliding window with 0.85 threshold)
is a documented TODO for slice 0009.

`pickGovWarningCandidate` provides a fallback that scans for the
literal `GOVERNMENT WARNING` prefix when exact-quote-match fails;
this mitigates OCR-tokenization differences on the strict path.

### UI overhaul

- `components/VerificationDetail.tsx` replaces the previous
  `ExtractedDataCard`. Two-pane layout: image preview (with overlay)
  on the left, field results table + overall verdict panel on the
  right.
- `components/LabelImagePreview.tsx` renders the image with an SVG
  bbox polygon overlay scaled to the image dimensions.
- `components/FieldRow.tsx` per-field row with status badge (color +
  icon + lucide-react glyph + text label — never color-only),
  expandable explanation, click-to-highlight bbox.

## Consequences

### Positive

- **100%-recall on government-warning strict-fail is testable and
  enforced in CI.** Build fails the moment a regression slips past
  the matcher.
- **Strict fields are architecturally precluded from LLM-judge**, so
  the "LLM normalized our compliance check away" failure mode is
  closed off.
- **Tesseract sidecar gives us word-level bboxes for free**, which
  feeds the click-to-highlight bbox UI without a separate OCR pass.
- **Templated explanations are audit-of-record** — every status has a
  deterministic, reviewable rationale string. LLM narrative is
  optional and clearly secondary.
- **The pipeline is purely-functional** below the route handler,
  making per-rule unit tests cheap and the property-based mutation
  fuzz easy to extend.

### Negative

- **More moving parts than an LLM-only extraction.** Two extraction
  systems running in parallel, a verification pipeline, a status
  engine, an explanation render layer, and a separate judge endpoint.
  The complexity is justified by the 100%-recall constraint, but it
  shows up as ~5,000 LOC in this slice.
- **Tesseract.js cold-start latency** — first call after a Vercel
  function instance spin-up adds ~0.5 s. Mitigated by a planned
  warm-keep cron in slice 0009.
- **LLM-judge endpoint is wired but not called from the pipeline.**
  Gray-band cases route to "Manual Review" until slice 0009 threads
  the call. This was an explicit deferral in the slice plan, but
  it's a known gap — until then, a brand like `Stone's Throw` vs
  `STONE'S THROW` produces "Manual Review" instead of "Likely Match"
  in the rare case where the deterministic ladder lands in the gray
  band.

### Deferred to later slices

- Image-quality override (slice 0004) — `imageQualityPoor` param
  exists in the status engine but is currently unused.
- Wine and malt ABV tolerances (slice 0004) — only spirits ±0.3 pp
  ships in 0003.
- LLM-judge call wiring (slice 0009) — see above.
- bbox fuzzy fallback (slice 0009) — exact match only today.
- Live LLM-narrative explanations (post-MVP enhancement).

## References

- `research-findings/01-ttb-regulatory.md` — § 16.21 canonical text
  and per-beverage rules
- `research-findings/03-verification-logic.md` — pattern recommendation
- `PRESEARCH.md` §6 — verification strategy lock
- `issues/0003-verification-tesseract-bbox.md` — slice spec
- `memory-bank/plans/slice-3-detail.md` — execution plan
- `lib/verify/strict/gov-warning-canonical.ts` — verbatim canonical
- `lib/verify/strict/gov-warning.ts` — three-layer matcher
- `test/fixtures/mutations/gov-warning-mutations.ts` — mutation
  generators
- `lib/verify/pipeline.ts` — orchestration
- `lib/verify/status-engine.ts` — 2-D matrix → 8-state enum
- `app/api/judge-field/route.ts` — gray-band judge endpoint
