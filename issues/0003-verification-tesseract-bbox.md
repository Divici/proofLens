# 0003: Verification pipeline + Tesseract ground-truth + bbox highlights

**Blocked by:** 0002
**Blocks:** 0004
**Requirements addressed:** R-006 (full), R-007, R-008, R-009 (100%-recall gov-warning), R-010 (nuanced match ladder), R-013 (bbox highlights)
**Demoable:** Reviewer uploads any of the demo scenarios from PRD §19 and sees per-field results with the 8-state status enum, an overall verdict, plain-English explanations, and yellow bbox highlights drawn on the image when a field row is clicked. The gov-warning capitalization scenario (PRD §19 Scenario 4) returns strict Fail with a focused bbox on the warning paragraph. CI mutation fuzz on the gov-warning matcher passes.
**Estimated effort:** 8-10h (largest slice — vertical tracer through every layer)

## Acceptance criteria
- [ ] R-006: `/api/extract-label` runs Claude Haiku **+ Tesseract.js in parallel**; returns merged result with `extracted` (LLM fields) + `rawText` (Tesseract) + `wordBoxes` (Tesseract word-level bboxes) + `govWarningGroundTruth` (Tesseract on the LLM's warning region)
- [ ] R-009 (gov-warning matcher, three layers):
  - Prefix: case-sensitive `text.startsWith("GOVERNMENT WARNING:")`
  - Body: NFKC + smart-quote/dash collapse + markdown-strip + whitespace-collapse → exact compare to canonical § 16.21 string (constant in `lib/verify/strict/gov-warning-canonical.ts`)
  - Diagnostic: Damerau-Levenshtein distance for explanation
- [ ] CI mutation fuzz harness (`fast-check`) generates ≥ 100 mutations of the canonical string; matcher rejects every one; build fails if any passes
- [ ] R-010 (nuanced ladder): `case-strip → punct-strip → NFKC → fuzzball.token_set_ratio` → `≥ 92 Pass(/Likely Match) / 0.78–0.92 LLM-judge / < 0.78 Fail`
- [ ] LLM-judge endpoint `/api/judge-field` (called only inside gray band); never invoked for strict fields; cached per `(extracted, expected)` pair within session
- [ ] R-007: `FieldResult` includes `value`, `expected`, `status` (8-state enum), `confidence`, `explanation` (templated, rule-sourced), `suggestedAction`, `evidenceQuote`, `bbox`
- [ ] R-008: overall status rolled up: any strict Fail → Fail; any Warning + no Fail → Pass with Warnings; etc.
- [ ] R-013: detail screen shows the image preview with overlay; clicking a field row draws a yellow polygon (built by locating `evidenceQuote` in `wordBoxes`); polygon clears when field is unfocused
- [ ] Templated explanations registered in `lib/verify/explain/templates.ts`; one template per `RuleOutcome` kind
- [ ] All 8 status states render with distinct visual treatment (color + icon + text label, never color-only per R-018)
- [ ] All quality gates green
- [ ] `STUDY_GUIDE.md` updated: "How the gov-warning matcher works (3 layers)" + "Why nuanced ≠ strict"

## Files to touch
- **Create:** `lib/verify/strict/gov-warning-canonical.ts`, `gov-warning.ts`, `abv.ts`, `net-contents.ts`
- **Create:** `lib/verify/nuanced/ladder.ts`, `brand.ts`, `class-type.ts`, `bottler.ts`, `country.ts`
- **Create:** `lib/verify/status-engine.ts` (2-D matrix → 8-state enum)
- **Create:** `lib/verify/explain/templates.ts`, `lib/verify/explain/render.ts`
- **Create:** `lib/verify/types.ts` (RuleOutcome, FieldResult, OverallStatus enums)
- **Create:** `lib/ocr/tesseract.ts` (worker init + extract API)
- **Create:** `lib/bbox/locate.ts` (locate evidenceQuote in wordBoxes → polygon)
- **Modify:** `app/api/extract-label/route.ts` (run Tesseract in parallel; run verification pipeline)
- **Create:** `app/api/judge-field/route.ts` (LLM-judge handler)
- **Create:** `lib/ai/prompts/judge-nuanced-match.ts`
- **Modify:** `app/review/page.tsx` (replace ExtractedDataCard with VerificationDetail screen)
- **Create:** `components/VerificationDetail.tsx` — image-preview-with-overlay + per-field row table + overall verdict panel
- **Create:** `components/FieldRow.tsx` (status badge, expand to show explanation/evidence/action)
- **Create:** `components/LabelImagePreview.tsx` (canvas-based image with bbox polygon overlay)
- **Create:** `test/fixtures/mutations/gov-warning-mutations.ts` (mutation generators for fast-check)

## Test specs (write first per TDD)
1. `lib/verify/strict/gov-warning.test.ts` — happy path passes; missing prefix fails; lowercased prefix fails; missing comma after `Surgeon General` fails; modified text in body fails. **fast-check property test**: `fc.property(canonicalMutations(), m => govWarningMatch(m) === false)` must hold for ≥ 100 generated mutations.
2. `lib/verify/strict/abv.test.ts` — equivalent values pass within tolerance (spirits ±0.3pp; wine ±1.0pp / ±1.5pp); off-tolerance fails; format equivalence (`%` ≡ `percent`, `45.0%` ≡ `45%`).
3. `lib/verify/strict/net-contents.test.ts` — `750 mL` ≡ `750ml` ≡ `0.75 L`; off-volume fails.
4. `lib/verify/nuanced/ladder.test.ts` — `Stone's Throw` vs `STONE'S THROW` → Likely Match (≥ 92); `Stone's Throw` vs `Stone Mountain` → Fail (< 78); gray-band example calls judge mock.
5. `lib/verify/status-engine.test.ts` — strict cells collapse to {Pass, Fail, Missing, Low Confidence}; image-quality flag overrides any non-Pass to Manual Review.
6. `lib/verify/explain/render.test.ts` — every `RuleOutcome` kind renders to a non-empty templated string.
7. `lib/bbox/locate.test.ts` — locate quoted text in word-stream → returns union polygon; not-found returns null.
8. `app/api/extract-label/route.test.ts` — full pipeline returns merged result with all expected fields populated.
9. `test/e2e/verification.spec.ts` — load demo scenario 4 (gov-warning caps); see strict Fail with bbox on warning paragraph.

## Notes
- The canonical § 16.21 string is verbatim from `research-findings/01-ttb-regulatory.md` §1.1.
- Tesseract.js worker is initialized once per Vercel function instance and reused (warmup is non-trivial). Tests use a mocked Tesseract result.
- LLM-judge cache is in-memory (per-process), keyed on a hash of `(extracted, expected, fieldName)`.
- `evidenceQuote` from the LLM may not exactly match Tesseract's tokenization; `lib/bbox/locate.ts` should normalize and use a sliding-window match with a configurable similarity threshold (default 0.85).
- Status engine matrix lives in code (not config) — it's part of the spec.
- This is the largest slice. If it runs over 12h, consider deferring nuanced-match LLM-judge to a sub-issue and shipping with deterministic-only matching for nuanced fields (gray band routes to Manual Review until the judge ships).
