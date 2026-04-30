# Slice 0002 — Single-label happy path (LLM only) — execution plan

## Source-of-truth spec

`issues/0002-single-label-happy-path-llm.md` — read in full.

## Branch

`slice/0002-single-label-llm` off `main`. Worked in
`.worktrees/slice-0002-single-label-llm/`.

## Context delta from slice 0001

After slice 0001 merge: Next.js 16 app exists with shadcn/ui,
Tailwind v4, Vitest + Playwright, env validation, `/api/health`,
`/about`. `package.json` already pins `tesseract.js`, `sharp`, `zod`,
`idb`, `react-hook-form`, `@hookform/resolvers`, `openai`, etc. — no
new dependency installs should be required for this slice.

## Track graph

Tracks A and B are independent; Track C depends on A; Track D depends
on A + B + C. Track E (demo data) is independent. One execution agent
can serialize them.

### Track A — AI client + schemas (TDD)
1. `lib/ai/schema.ts` — Zod schemas for:
   - `ApplicationData` (PRD §13.1): brand, classType, abv, netContents,
     bottlerName, bottlerAddress, countryOfOrigin, govWarningRequired,
     applicationNotes, beverageType (placeholder enum, full handling
     in slice 0004)
   - `ExtractedLabelData` (PRD §13.2): per-field shape with `value`,
     `evidenceQuote`, `confidence` (0..1); plus `rawText` (will be
     populated by Tesseract in slice 0003 — leave as optional/nullable
     for now), `imageQualityNotes`, `extractionConfidence`
2. **Failing test first**: `lib/ai/schema.test.ts` — Zod parses valid
   payloads; rejects malformed; per-field confidence ∈ [0,1].
3. `lib/ai/pricing.ts` — token-cost constants (per-1M tokens for
   primary + fallback model). Simple object lookup; values from env or
   hardcoded defaults that match the OpenRouter list-prices in
   research.
4. `lib/ai/prompts/extract-fields.ts` — system + user prompt template
   for vision extraction. Strict tool-use schema. Instruct model to
   set fields to `null` when not visible; require `evidenceQuote` per
   field; explicitly forbid normalizing capitalization on the
   government warning text (defensive note even though the strict
   check is in slice 0003).
5. **Failing test first**: `lib/ai/openrouter.test.ts` — client invokes
   OpenRouter with strict tool-use schema; mocks via MSW; returns
   parsed `ExtractedLabelData`. Cost computation correctness on a
   mocked response.
6. `lib/ai/openrouter.ts` — wraps the `openai` SDK with OpenRouter
   `baseURL`, exposes `extractLabel(imageBlob, model): Promise<{
   data: ExtractedLabelData, costUsd: number, latencyMs: number }>`.
   Uses `process.env.OPENROUTER_MODEL_PRIMARY` by default.

### Track B — image preprocessing (TDD)
1. **Failing test first**: `lib/image/preprocess.test.ts` —
   EXIF-rotated image is corrected; oversized image resized ≤ 1568px;
   output is JPEG q85; small image passes through unchanged.
2. `lib/image/preprocess.ts` — `sharp` wrapper:
   `preprocess(buffer): Promise<{ buffer, width, height,
   originalSizeBytes, processedSizeBytes }>`.

### Track C — `/api/extract-label` handler (TDD)
1. **Failing test first**: `app/api/extract-label/route.test.ts` —
   - POST with valid `multipart/form-data` (image + expected-data
     JSON) returns 200 + `ExtractedLabelData` + `processingTimeMs` +
     `aiSpend.primaryUsd`
   - Rejects request with no image with 400
   - Rejects request with malformed expected-data JSON with 400
   - Returns 502 on OpenRouter failure (mocked via MSW)
   - Image preprocessed before extraction (verifiable via mock)
2. `app/api/extract-label/route.ts`:
   - `runtime: nodejs`
   - Parse multipart formData (`request.formData()`)
   - Validate expected-data JSON against `ApplicationData` schema
   - Run `preprocess()` → buffer
   - Call `extractLabel(buffer, env.OPENROUTER_MODEL_PRIMARY)`
   - Return `{ extracted, processingTimeMs, aiSpend, expected }`
   - **Stateless**: no persistence, image discarded after response

### Track D — UI (RTL tests + Playwright E2E)
1. **Failing test first**: `components/LabelUploader.test.tsx` —
   drag-and-drop + click-to-upload; rejects non-image MIME; preview
   shown after select.
2. `components/LabelUploader.tsx`.
3. **Failing test first**:
   `components/ExpectedDataForm.test.tsx` — react-hook-form + zod
   resolver; required fields validated; "Load demo data" button fills
   form with scenario 01 data.
4. `components/ExpectedDataForm.tsx`. Uses shadcn `Input`, `Label`,
   `Select` components.
5. **Failing test first**:
   `components/ExtractedDataCard.test.tsx` — renders fields with
   value, evidenceQuote, confidence; null values render as
   "Not visible" with appropriate styling.
6. `components/ExtractedDataCard.tsx`.
7. `app/review/page.tsx`:
   - Top heading + breadcrumb
   - Two-column layout: image preview + form on left, extracted card
     on right (after verify)
   - Loading state during extraction with progress indicator
   - Plain-English error states
   - Latency + cost displayed
8. **Failing test first**: `test/e2e/single-label.spec.ts` — load demo
   scenario 01 → see extracted fields rendered. Mock OpenRouter via a
   request-interceptor route in Playwright (since real network calls
   to OpenRouter need a key).

### Track E — Demo scenario 01
1. `public/demo-labels/01-spirits-pass.jpg` — placeholder image. Use a
   simple text-on-background mockup created with `sharp` if no real
   image is available. Slice 0009 replaces with the final demo bundle.
2. `public/demo-data/01-spirits-pass.json` — `ApplicationData` JSON
   matching PRD §19 Scenario 1: brand=Old Tom Distillery, etc.
3. `lib/demo/scenarios.ts` — registry of demo scenarios with
   `{ id, name, labelPath, dataPath, description }`.

## E2E mocking strategy

Real OpenRouter calls in E2E need a key + cost real money. For the
e2e smoke we add a Playwright route handler that intercepts
`POST /api/extract-label` and returns a fixture `ExtractedLabelData`
response. The server endpoint is exercised in unit tests (with MSW
mocking OpenRouter); the E2E covers the full UI flow with the server
mocked at the API boundary.

Alternative: use a `MOCK_OPENROUTER=1` env var that makes
`lib/ai/openrouter.ts` return a fixture instead of calling out. This
is simpler but couples the prod code to a test flag; prefer the route
interceptor.

## Acceptance gate

Per `issues/0002-single-label-happy-path-llm.md`. All tests green:
- Vitest grows from 10 to ~25-30 tests
- Playwright grows from 3 to 4 specs
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e &&
  pnpm build` all green

## Out of scope (do NOT start)

- Tesseract.js usage — slice 0003
- Verification pipeline / matchers / ladder — slice 0003
- Bbox highlights — slice 0003
- Status enum + 8-state UI — slice 0003 + 0004
- Beverage rules + image quality — slice 0004
- Override + history + IndexedDB — slice 0005

## Estimated effort

4-5h. Most time is in the AI client wiring + UI components.
