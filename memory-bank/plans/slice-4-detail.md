# Slice 0004 — Beverage rules + image quality — execution plan

## Source-of-truth spec

`issues/0004-beverage-rules-image-quality.md` — read in full.

## Branch

`slice/0004-beverage-rules-image-quality` off `main`. Worked in
`.worktrees/slice-0004-beverage-rules-image-quality/`.

## Context delta

After slice 0003: verification pipeline live (strict + nuanced ladder
+ status engine + templated explanations). `imageQualityPoor` param
exists in `lib/verify/status-engine.ts:31` as a TODO hook. ABV
tolerance is hardcoded to spirits ±0.3 pp. "Other / Unknown" beverage
type isn't routed yet.

## What's in / what's out

**In scope:**
- Per-beverage rule table for the four categories (Beer / Wine / Spirits / Other)
- Conditional + Required + Optional + Not-Applicable per-field routing
- Per-beverage ABV tolerances (spirits ±0.3 pp, malt ±0.3 pp, wine ±1.0 / ±1.5 pp by class)
- Conditional ABV evaluation (wine: required > 14% ABV; malt: required when added flavors contribute alcohol)
- Image-quality heuristics: Laplacian variance for blur, histogram-based exposure, perspective-distortion via LLM `imageQualityNotes`
- Image-quality flag enum: `blur`, `glare`, `low-light`, `skew`, `cropping`, `low-resolution`, `obstruction`, `multiple-labels`
- Status engine consumes quality flags → demote any non-Pass cell to Manual Review with `Request Better Image`
- Detail screen quality banner
- "Other / Unknown" routes to manual-review-only with universal-fields check + banner
- Demo scenarios 03 (ABV mismatch from slice 0003), plus new 06 (glare/blur), 02 (Stone's Throw nuanced brand), 05 (incomplete gov-warning)

**Out of scope:**
- Override + IndexedDB history (slice 0005)
- Camera capture (slice 0006)
- Batch flow (slice 0007)
- Exports (slice 0008)
- Final demo polish + a11y pass (slice 0009)

## Task graph

### Track 1 — Beverage rules table (TDD)
1. **Failing tests first**: `lib/verify/beverage-rules.test.ts`
   - Spirits: ABV always Required; sulfites N/A; FD&C-Y5 Conditional
   - Wine: ABV at 14.5% Required; ABV at 12% Optional; sulfites Conditional
   - Beer: ABV Conditional (only when added flavors contribute alcohol); sulfites N/A
   - Other: only universal-fields (brand, gov-warning, net-contents); rest → manual review
2. `lib/verify/beverage-rules.ts`:
   - Per-type rule table indexed by beverage + field
   - Lookup function `requiredFor(beverage, field, context): 'required' | 'conditional' | 'optional' | 'not-applicable'`
   - Conditional evaluators per field (e.g. wine ABV: Required only when extracted ABV > 14% or expected indicates table/light wine)
   - Each rule cited inline by regulation number (`// 27 CFR § 4.36(a)`)

### Track 2 — Per-type ABV tolerances
3. Update `lib/verify/strict/abv.test.ts` with wine + malt cases:
   - Spirits ±0.3 pp (already passes)
   - Malt ±0.3 pp
   - Wine ±1.0 pp for table wine (≤ 14%); ±1.5 pp for "light" wine
4. Update `lib/verify/strict/abv.ts` to accept `beverageType` and route to the right tolerance.
5. Document tolerances in code-comments with regulation citation.

### Track 3 — Image-quality heuristics (TDD)
6. **Failing tests first**: `lib/quality/laplacian.test.ts`
   - Known-blurry fixture (small image generated programmatically with Gaussian blur) has variance below threshold
   - Sharp fixture (high-contrast text) has variance above threshold
   - Threshold expressed as named constant with code-comment justifying the value
7. `lib/quality/laplacian.ts` — sharp-based Laplacian variance computation. Convert to grayscale, apply Laplacian kernel via sharp's `recomb` or use a small custom kernel.
8. **Failing tests first**: `lib/quality/exposure.test.ts`
   - Low-light fixture (dim) flagged
   - Overexposed fixture (washed out) flagged
   - Balanced fixture passes
9. `lib/quality/exposure.ts` — histogram-based: compute mean luminance + percentage of pixels in extreme bins.
10. **Failing tests first**: `lib/quality/heuristics.test.ts`
    - `analyze(image, llmNotes)` merges heuristic + LLM signals into a deduped flag list
    - LLM `imageQualityNotes` parsed via regex on substrings like "blur", "glare", "skew" → structured flags
11. `lib/quality/heuristics.ts` — orchestration entrypoint.
12. `lib/quality/types.ts` — `ImageQualityFlag` enum + `ImageQualityResult` type.

### Track 4 — Status engine quality override
13. Update `lib/verify/status-engine.test.ts`:
    - Quality flag set + Pass cell → `Needs Manual Review` with `suggestedAction: "Request Better Image"`
    - Quality flag set + Fail cell → `Fail` (preserved — strict-fails are still strict-fails)
14. Update `lib/verify/status-engine.ts` to consume `imageQualityPoor: boolean` (from heuristics) and apply override per the matrix.

### Track 5 — Pipeline integration
15. Update `lib/verify/pipeline.ts`:
    - Accept `beverageType` from `ApplicationData`
    - Route fields per beverage rules: skip Not-Applicable; gate Conditional fields
    - "Other / Unknown" → universal-fields-only verification + Manual Review for everything else with banner-text suggestedAction
16. Update `app/api/extract-label/route.ts`:
    - After Tesseract + LLM extract, compute image-quality heuristics on the preprocessed buffer
    - Pass `imageQualityFlags + imageQualityPoor` to verification pipeline
    - Include `imageQualityFlags: ImageQualityFlag[]` in response

### Track 6 — UI: beverage selector + quality banner
17. Update `components/ExpectedDataForm.tsx`:
    - Beverage selector already exists (4 options) — confirm it sets `beverageType` field correctly
    - Conditional fields show or hide / mark optional based on selected beverage (visual UX hint, not enforcement; enforcement is server-side)
18. Update `components/VerificationDetail.tsx`:
    - Quality banner above the field results: "Image quality issues detected: blur, glare. Suggest Request Better Image."
    - "Other / Unknown" banner: "Beverage type unknown — only universal fields verified. Please classify under TTB Part 4/5/7 for full verification."

### Track 7 — Demo scenarios 02, 05, 06
19. `public/demo-labels/02-stones-throw-caps.jpg` + `public/demo-data/02-stones-throw-caps.json` — brand "Stone's Throw" expected, label shows "STONE'S THROW" → nuanced Likely Match
20. `public/demo-labels/05-warn-incomplete.jpg` + paired data — gov-warning paragraph truncated at "...women should not drink." → strict Fail with "incomplete warning" diagnostic
21. `public/demo-labels/06-glare-blur.jpg` + paired data — same as 01 (Old Tom Distillery) but with sharp-applied Gaussian blur or contrast-stretch corruption → image-quality flags trigger Manual Review
22. Update `lib/demo/scenarios.ts` registry with 02, 05, 06.
23. Update `scripts/generate-demo-labels.mjs` to support these scenarios.

### Track 8 — E2E
24. Update `test/e2e/verification.spec.ts` to cover new scenarios:
    - 02 (nuanced) → Likely Match badge
    - 05 (incomplete warning) → Fail
    - 06 (glare/blur) → Manual Review with quality banner visible

## Acceptance gate

Per `issues/0004-beverage-rules-image-quality.md`:
- All 7 PRD §19 demo scenarios produce documented expected outcomes
- Vitest grows from 214 to ~250-275
- Playwright grows from 7 to ~10
- All quality gates green

## Estimated effort

4-5h. Mid-sized; the trickiest piece is the Laplacian variance kernel.

## Reasonable deviations

- If sharp's recomb / kernel API for Laplacian is finicky, ship a plain JS implementation that operates on the raw pixel buffer (sharp can give us `raw()` output). Document.
- Laplacian/exposure thresholds are tuned against demo fixtures during this slice; bake them as named constants with rationale comments.
- Conditional ABV evaluator for malt beverages is conservative — if the expected data doesn't indicate "added flavors contribute alcohol", treat it as Optional rather than Required. Slice 0009 polish can refine.
