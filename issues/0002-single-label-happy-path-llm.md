# 0002: Single-label happy path (LLM extraction only)

**Blocked by:** 0001
**Blocks:** 0003
**Requirements addressed:** R-001 (partial — extraction only, no verification yet), R-004 (manual entry only), R-006 (partial — vision-LLM only, no Tesseract yet)
**Demoable:** A reviewer opens the app, uploads one alcohol-label image, fills in the expected-application-data form, clicks Verify, and sees the extracted fields rendered as a structured JSON-like card (no comparison logic, no status enum yet). Latency tracked + displayed.
**Estimated effort:** 4-5h

## Acceptance criteria
- [ ] R-001 (partial): single-label upload + extracted-data view works end-to-end on the deployed preview URL
- [ ] R-004: manual entry form for `ApplicationData` (PRD §13.1 schema) with `react-hook-form` + `zod`; "Load demo data" button stub renders one hard-coded scenario
- [ ] R-006 (partial): `POST /api/extract-label` with `multipart/form-data` (image) + JSON body (expected-data) returns `ExtractedLabelData` (PRD §13.2 schema) via Claude Haiku 4.5 over OpenRouter
- [ ] OpenRouter client (`lib/ai/openrouter.ts`) wraps the OpenAI-compatible SDK with `baseURL` env var; structured-output via tool-use schema with strict mode
- [ ] Image preprocessing on the server: `sharp` rotates by EXIF, resizes ≤ 1568px, JPEG q85; image is in-memory only (no temp files)
- [ ] Per-field schema includes `value`, `evidenceQuote`, `confidence` (0..1)
- [ ] Latency captured server-side (`processingTimeMs`) and returned in the response; displayed in the UI
- [ ] Cost telemetry: response includes `aiSpend.primaryUsd` (computed from response token counts × env-var pricing constants)
- [ ] Loading state during extraction; plain-English error messages on failure
- [ ] All quality gates green
- [ ] `STUDY_GUIDE.md` updated: "Why we use a tool-use schema for structured output"

## Files to touch
- **Create:** `app/review/page.tsx` (single-review screen — upload + form + results card)
- **Create:** `app/api/extract-label/route.ts` (stateless POST handler)
- **Create:** `components/LabelUploader.tsx`, `components/ExpectedDataForm.tsx`, `components/ExtractedDataCard.tsx`
- **Create:** `lib/ai/openrouter.ts` (client wrapper)
- **Create:** `lib/ai/schema.ts` (Zod schemas for ApplicationData, ExtractedLabelData)
- **Create:** `lib/ai/prompts/extract-fields.ts` (the system + user prompt for vision extraction)
- **Create:** `lib/ai/pricing.ts` (env-var pricing constants for cost computation)
- **Create:** `lib/image/preprocess.ts` (sharp wrapper)
- **Modify:** `app/page.tsx` (add link to `/review`)
- **Create:** `public/demo-labels/01-spirits-pass.jpg` + `public/demo-data/01-spirits-pass.json` (one hard-coded demo scenario for the "Load demo data" button)

## Test specs (write first per TDD)
1. `lib/ai/openrouter.test.ts` — client invokes OpenRouter with strict tool-use schema; mocks via MSW; returns parsed `ExtractedLabelData`.
2. `lib/ai/schema.test.ts` — Zod parse rejects malformed AI responses; accepts valid ones; per-field `confidence` ∈ [0,1].
3. `app/api/extract-label/route.test.ts` — POST with valid image + expected-data returns 200 + `ExtractedLabelData`; rejects missing image with 400; returns 502 on OpenRouter failure.
4. `lib/image/preprocess.test.ts` — EXIF-rotated image is corrected; oversized image is resized ≤ 1568px; output is JPEG q85.
5. `test/e2e/single-label.spec.ts` — upload demo label → see extracted fields rendered in card.

## Notes
- Do NOT implement verification logic yet; raw extraction only.
- Do NOT implement Tesseract yet; that's slice 3.
- Do NOT implement bbox highlights yet; that's slice 3.
- ExtractedLabelData includes `imageQualityNotes` and `confidence` per PRD §13.2 — leave these as raw passthrough from the LLM in this slice.
- Camera capture is slice 6.
- Use `react-hook-form` + `zodResolver` for the form (controlled inputs).
- Persist nothing (per IT note); state lives in component state during the slice.
