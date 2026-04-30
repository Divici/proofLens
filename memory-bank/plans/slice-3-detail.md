# Slice 0003 — Verification + Tesseract + bbox highlights — execution plan

## Source-of-truth spec

`issues/0003-verification-tesseract-bbox.md` — read in full. This is
the AI tracer milestone — the largest slice — and ends with a
**conductor checkpoint pause** for user review.

## Branch

`slice/0003-verification-tesseract-bbox` off `main`. Worked in
`.worktrees/slice-0003-verification-tesseract-bbox/`.

## What's in / what's out

**In scope (this slice):**
- Tesseract.js wired into `/api/extract-label` (parallel with Haiku)
- Word-level bboxes returned alongside extracted fields
- Verification pipeline (strict matchers + nuanced ladder + status engine + templated explanations)
- 8-state status enum end-to-end
- Three-layer government-warning matcher with **CI mutation fuzz harness** (`fast-check`)
- `/api/judge-field` endpoint for nuanced LLM-judge in 0.78–0.92 gray band
- Detail screen replaces the current `ExtractedDataCard` — image preview with bbox overlay + per-field row table + overall verdict panel
- All 8 status states render with distinct visual treatment (color + icon + text label, never color-only)

**Out of scope (later slices):**
- Beverage-aware rule routing (slice 0004)
- Image-quality detection thresholds (slice 0004)
- Override + IndexedDB history (slice 0005)
- Camera capture (slice 0006)
- Batch flow (slice 0007)
- Exports (slice 0008)
- Polish + a11y + docs final pass (slice 0009)

## Task graph (sequential within tracks; tracks parallel where safe)

The execution agent runs these tracks in this order. Track boundaries
correspond to logical commit groups.

### Track 1 — Tesseract.js integration
1. **Failing test first**: `lib/ocr/tesseract.test.ts` —
   `extract(buffer): Promise<{ text, words, confidence }>` returns
   word-level bboxes; uses a small fixture image with known text.
2. `lib/ocr/tesseract.ts` — Tesseract worker wrapper:
   - Lazy worker init (one worker per Vercel function instance, reused)
   - `extract(buffer)` returns `{ text, words: { text, bbox, confidence }[], confidence }`
   - bbox shape: `{ x0, y0, x1, y1 }` (Tesseract native)
   - Logger silenced; languages: `eng`
3. Update `app/api/extract-label/route.ts`: run `tesseractExtract` and
   `extractLabel` (LLM) in parallel via `Promise.all`. Merge results
   into the returned payload.

### Track 2 — Strict matchers (TDD)
4. `lib/verify/strict/gov-warning-canonical.ts`:
   - Verbatim § 16.21 text:
   ```
   GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
   ```
   - Two commas (after "Surgeon General" and after "or operate machinery"). No Oxford comma. US spelling. Single ASCII space after prefix colon and between sentences.
5. **Failing tests first**: `lib/verify/strict/gov-warning.test.ts` —
   - Happy path passes
   - Missing prefix → fail with explanation "Required prefix is not in uppercase"
   - Lowercased prefix → fail
   - Missing comma after "Surgeon General" → fail
   - Modified text in body → fail
   - **fast-check property**: `fc.property(canonicalMutations(), m => govWarningMatch(m).status === 'fail')` — at least 100 mutations all rejected
6. `test/fixtures/mutations/gov-warning-mutations.ts` — `fast-check`
   generators for: cap drop, comma drop, comma swap, semicolon swap, word substitution, sentence reorder, smart-quote injection, leading/trailing whitespace, etc.
7. `lib/verify/strict/gov-warning.ts` — three-layer matcher:
   - Layer 1 (prefix): case-sensitive `text.startsWith("GOVERNMENT WARNING:")`
   - Layer 2 (body): NFKC normalize → smart-quote/dash collapse → markdown-strip → whitespace-collapse → exact compare to canonical
   - Layer 3 (diagnostic): Damerau-Levenshtein distance for explanation prose
   - Returns `RuleOutcome { status, explanation, evidence, distance? }`
8. **Failing tests first**: `lib/verify/strict/abv.test.ts` —
   equivalent values pass within tolerance (spirits ±0.3pp; wine
   ±1.0pp / ±1.5pp; for now just spirits in this slice — wine
   tolerance is wired in slice 0004 with beverage-aware rules)
9. `lib/verify/strict/abv.ts` — parser + comparison. Hand-rolled
   regex per RESEARCH.md §3.3. Recognizes `45% Alc./Vol.`,
   `45% ABV`, `Alcohol 45% by Volume`, `45.0%`, `90 Proof` → ABV.
10. **Failing tests first**: `lib/verify/strict/net-contents.test.ts`
    — `750 mL` ≡ `750ml` ≡ `0.75 L` ≡ `25.36 fl oz` (within 0.1%)
11. `lib/verify/strict/net-contents.ts` — `convert-units` wrapper
    + tolerance check.

### Track 3 — Nuanced ladder (TDD)
12. **Failing tests first**: `lib/verify/nuanced/ladder.test.ts` —
    `Stone's Throw` vs `STONE'S THROW` → ratio ≥ 92 → Likely Match
    `Stone's Throw` vs `Stone Mountain` → ratio < 78 → Fail
    Gray-band example (~ 0.85 ratio) calls judge mock and merges
    judge result.
13. `lib/verify/nuanced/ladder.ts`:
    ```
    case-strip → punct-strip → NFKC normalize →
    fuzzball.token_set_ratio →
      ≥ 92 → Pass (Likely Match if not byte-equal)
      0.78–0.92 → callJudge() → status from judge (cached)
      < 0.78 → Fail (or Manual Review if confidence low)
    ```
14. `lib/verify/nuanced/{brand,class-type,bottler,country}.ts` — thin
    wrappers around `ladder` with field-specific configuration (e.g.
    field-name in explanations, default thresholds).

### Track 4 — Status engine + types + explanations
15. `lib/verify/types.ts` — `RuleOutcome`, `FieldResult`,
    `OverallStatus` enums + Zod schemas. Status enum = 8-state per
    PRD §9.5.
16. **Failing tests first**: `lib/verify/status-engine.test.ts` —
    strict cells collapse to `{Pass, Fail, Missing, Low Confidence}`;
    nuanced cells produce 8-state. Image-quality flag override is
    deferred to slice 0004 — leave a TODO with the override hook
    point.
17. `lib/verify/status-engine.ts` — pure function from
    `(matchStrength, aiConfidence)` → status enum. 2-D matrix per
    PRESEARCH.md §6.4.
18. **Failing tests first**: `lib/verify/explain/render.test.ts` —
    every `RuleOutcome` kind renders to a non-empty templated string.
19. `lib/verify/explain/templates.ts` — registry: kind →
    template-string-or-fn(outcome).
20. `lib/verify/explain/render.ts` — template renderer.

### Track 5 — LLM-judge endpoint
21. `lib/ai/prompts/judge-nuanced-match.ts` — system + user prompt for
    "are these two values equivalent for label-compliance review?"
    Returns `{ status: 'pass'|'likely-match'|'manual-review'|'fail', reasoning: string }`.
22. **Failing tests first**: `app/api/judge-field/route.test.ts` —
    POST with `{ extracted, expected, fieldName }` returns judgment;
    cached in-memory by `(extracted, expected, fieldName)` hash.
23. `app/api/judge-field/route.ts` — stateless POST (cache in module
    scope is per-instance; OK for POC).

### Track 6 — bbox locator
24. **Failing tests first**: `lib/bbox/locate.test.ts` —
    `locate(quote, words): Polygon | null`:
    - Quote present → returns union polygon of matching words
    - Quote not found → null
    - Quote partially matches → sliding-window with 0.85 threshold
25. `lib/bbox/locate.ts` — implementation.

### Track 7 — `/api/extract-label` end-to-end
26. Update `app/api/extract-label/route.ts`:
    - Run Tesseract + LLM in parallel
    - Run verification pipeline
    - Locate bbox per field via `lib/bbox/locate.ts`
    - Return `{ extracted, expected, rawText, fieldResults: FieldResult[], overall: OverallStatus, bboxes, processingTimeMs, aiSpend, ocrConfidence }`
    - Update tests
27. Update `app/api/extract-label/route.test.ts` for the merged shape.

### Track 8 — UI overhaul
28. **Failing tests first**: `components/FieldRow.test.tsx` — status
    badge, expand to show explanation/evidence/action; click row
    emits highlight event.
29. `components/FieldRow.tsx` — single field result row with status badge.
30. **Failing tests first**: `components/LabelImagePreview.test.tsx` —
    renders image; renders bbox polygon overlay when prop provided;
    clears when prop is null.
31. `components/LabelImagePreview.tsx` — canvas-based image with bbox
    polygon overlay. Uses `useEffect` to draw on canvas; resizes with
    container.
32. **Failing tests first**: `components/VerificationDetail.test.tsx`
    — overall verdict panel renders correctly; clicking field row
    highlights bbox; status badges have icons + text + color.
33. `components/VerificationDetail.tsx` — replaces
    `ExtractedDataCard`. Image preview + per-field row table + overall
    verdict panel. Two-column layout fits the existing `/review` page.
34. Update `app/review/page.tsx` — render `VerificationDetail`
    instead of `ExtractedDataCard` for the result.
35. Delete `components/ExtractedDataCard.tsx` + its test (no longer
    used).
36. Update e2e test: `test/e2e/single-label.spec.ts` — load demo
    scenario 01 → click each field row → verify bbox polygon appears
    on image preview; verdict panel shows correct overall.

## Demo data expansion

In addition to scenario 01 (Spirits Pass), the agent should add at
least scenarios 03 (ABV mismatch) and 04 (Gov-warning capitalization)
as part of this slice — they're needed to demonstrate the verification
pipeline works. Scenarios 02, 05, 06, 07 land in slice 0004 / 0009.

37. `public/demo-labels/03-abv-mismatch.jpg` + paired
    `public/demo-data/03-abv-mismatch.json` (programmatic).
38. `public/demo-labels/04-gov-warn-lowercase.jpg` + paired data.
39. Update `lib/demo/scenarios.ts` registry with 03 and 04.

## Acceptance gate

Per `issues/0003-verification-tesseract-bbox.md`:
- All 9 acceptance items checked off
- Vitest grows from 63 to ~150-180 tests (verification core has lots of test surface)
- Playwright grows from 4 to 5 specs (verification e2e)
- CI mutation fuzz on gov-warning passes ≥ 100 mutations
- `pnpm typecheck && lint && test && test:e2e && build` all green

## Key constraints reminders

- **Stateless server endpoints** (per Marcus IT note)
- **Strict gov-warning recall = 100%** — CI mutation fuzz is the safety
  net. Build must fail if any mutation slips through.
- **LLM-judge gray band only** — never on strict fields
- **Templated rule-sourced explanations** — audit-of-record. Optional
  LLM narrative on Manual-Review rows only (deferred — implement the
  hook point but don't wire LLM narrative yet)
- **Bbox via Tesseract word positions** — not via LLM-returned bbox

## Estimated effort

8-10h. If running over 12h, agent should report and we can split (e.g.
defer the LLM-judge endpoint to a sub-slice, route gray band to
Manual Review until shipped).

## Out of scope reminder

- Image-quality detection thresholds (Laplacian variance, exposure) —
  slice 0004
- Beverage-aware rule routing — slice 0004
- Override + history — slice 0005
- Camera + batch + exports — later slices
