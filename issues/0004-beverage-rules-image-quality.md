# 0004: Beverage-aware rules + image-quality detection

**Blocked by:** 0003
**Blocks:** 0005
**Requirements addressed:** R-005, R-011
**Demoable:** Reviewer picks Beer / Wine / Spirits / Other in the form, and the per-type field-rule table drives which fields are Required / Conditional / Optional / Not-Applicable in the verification pipeline. PRD §19 Scenario 6 (glare/blur image) returns "Needs Manual Review" with banner "Request Better Image". The beverage-type-aware verification correctly routes spirits/wine/beer/other through different field requirements.
**Estimated effort:** 4-5h

## Acceptance criteria
- [ ] R-005: beverage selector renders 4 options (Beer, Wine, Distilled Spirits, Other / Unknown)
- [ ] `lib/verify/beverage-rules.ts` defines a per-type rule table:
  - Beer (TTB Part 7): brand R, class R, name+addr R, net-contents R, ABV C (only when added flavors contribute alcohol), country C, gov-warning R, sulfites C, FD&C-Y5 C
  - Wine (TTB Part 4): brand R, class R, name+addr R, net-contents R, ABV C (R if > 14%), country C, gov-warning R, sulfites C, FD&C-Y5 C
  - Spirits (TTB Part 5): brand R, class R, name+addr R, net-contents R, **ABV always R**, country C, gov-warning R, sulfites C, FD&C-Y5 C
  - Other / Unknown: only universal fields (brand, gov-warning, net-contents) checked; everything else routes to Manual Review with the banner "Beverage type unknown — only universal fields verified. Please classify under TTB Part 4/5/7 for full verification."
- [ ] Verification pipeline reads the rule table and skips fields marked Not-Applicable; "Conditional" fields route to a per-type evaluator (e.g. wine ABV is Required only if extracted ABV > 14% OR expected indicates so)
- [ ] R-011 (image-quality detection):
  - `lib/quality/heuristics.ts` computes Laplacian-variance for blur, histogram-spread for exposure, perspective-distortion via the LLM's `imageQualityNotes`
  - Heuristic thresholds expressed as named constants with code-comments justifying the value
  - Detected flags: `blur`, `glare`, `low-light`, `skew`, `cropping`, `low-resolution`, `obstruction`, `multiple-labels`
  - Any flag → status engine demotes any non-Pass cell to `Needs Manual Review` with `suggestedAction: "Request Better Image"`
  - Detail screen shows a banner listing detected quality issues
- [ ] All 7 PRD §19 demo scenarios produce the documented expected outcome (use existing demo bundle from slice 2; this slice expands it)
- [ ] `STUDY_GUIDE.md` updated: "How beverage-type rules work" + "Why image-quality flags override status"

## Files to touch
- **Create:** `lib/verify/beverage-rules.ts` (rule table + lookup function)
- **Create:** `lib/quality/heuristics.ts`, `lib/quality/laplacian.ts`, `lib/quality/exposure.ts`
- **Create:** `lib/quality/types.ts` (ImageQualityFlag enum)
- **Modify:** `lib/verify/status-engine.ts` (consume image-quality flags)
- **Modify:** `app/api/extract-label/route.ts` (run image-quality heuristics; merge LLM imageQualityNotes)
- **Modify:** `lib/ai/schema.ts` (add `beverageType` to ApplicationData)
- **Modify:** `components/ExpectedDataForm.tsx` (add beverage selector)
- **Modify:** `components/VerificationDetail.tsx` (image-quality banner + Other-Unknown banner)
- **Create:** `public/demo-labels/06-glare-blur.jpg` + `public/demo-data/06-glare-blur.json`
- **Create:** `public/demo-labels/03-abv-mismatch.jpg` + `public/demo-data/03-abv-mismatch.json`
- **Create:** `public/demo-labels/04-gov-warn-lowercase.jpg` + `public/demo-data/04-gov-warn-lowercase.json`
- **Create:** `public/demo-labels/05-warn-incomplete.jpg` + `public/demo-data/05-warn-incomplete.json`

## Test specs (write first per TDD)
1. `lib/verify/beverage-rules.test.ts` — spirits ABV always Required; wine ABV at 14.5% Required; wine ABV at 12% Optional; beer ABV not Required by default; Other fields → Manual Review.
2. `lib/quality/laplacian.test.ts` — known-blurry fixture has variance below threshold; sharp fixture above.
3. `lib/quality/exposure.test.ts` — known-low-light fixture flagged; balanced fixture not flagged.
4. `lib/quality/heuristics.test.ts` — `analyze(image, llmNotes)` merges heuristic + LLM signals into a deduped flag list.
5. `lib/verify/status-engine.test.ts` (extended) — quality flag set + Pass cell → Manual Review with `suggestedAction: "Request Better Image"`.
6. `test/e2e/beverage-rules.spec.ts` — spirits + valid label = Pass; wine 13% + ABV missing = Optional (still Pass overall); other + missing class = Manual Review with banner.
7. `test/e2e/image-quality.spec.ts` — load demo scenario 6 → Manual Review with quality banner visible.

## Notes
- The 4 hand-crafted demo images (03, 04, 05, 06) need to be real PNGs/JPEGs. If we don't have them by slice start, generate placeholders via Figma export and replace later in slice 9.
- `Conditional` evaluation is small but per-type-specific; document each rule in code-comments with regulation citation (e.g., `// 27 CFR § 4.36(a)`).
- Image-quality heuristic thresholds are tuned during this slice against the demo bundle; thresholds become test fixtures.
- LLM `imageQualityNotes` from PRD §13.2 is unstructured prose — parse it via a small pattern-matching pass into the structured ImageQualityFlag enum (regex on substrings like "blur", "glare", "skew" etc.).
