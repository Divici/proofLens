# ADR 0007 — OCR strategy: Tesseract local-only, LLM-fallback on Vercel

**Date:** 2026-05-01
**Status:** Accepted
**Phase:** 9 (Deploy + Production Smoke)

## Context

PRESEARCH §5.1 and §5.5 lock a hybrid extraction pipeline:

- Vision LLM (Claude Haiku 4.5 via OpenRouter) extracts structured fields.
- Tesseract.js runs in parallel and supplies `rawText` + word-level
  bboxes.
- The strict gov-warning matcher reads `rawText` (Tesseract output, not
  LLM output) so the **100 %-recall guarantee** is defended by a
  non-LLM source. This is the most important architectural property of
  the system — it's the regulatory hard requirement.

Phase-9 deploy smoke against `prooflens-ai.vercel.app` hit 504s on every
`/api/extract-label` POST after the page loaded successfully. The
Vercel function logs revealed the root cause:

```
Cannot find module '..'
Require stack:
  - /var/task/node_modules/.pnpm/tesseract.js@5.1.1/.../worker-script/node/index.js:13
    at Object.<anonymous> (...worker-script/node/index.js:13:16)
    at /opt/rust/bytecode.js:2:1110
```

`worker-script/node/index.js` does `require('..')` — a CJS shorthand
for the parent directory's `index.js`, which Node resolves correctly.
Vercel's experimental Rust-based bytecode runtime (`/opt/rust/bytecode.js`)
does **not** honor that shorthand; the `require()` fails with
`MODULE_NOT_FOUND` even though the parent file is present in
`/var/task`. The function then hangs until Vercel's `maxDuration`
reaper kills it.

We attempted nine successive fixes:

1. `maxDuration` 60s → 120s (`vercel.json`).
2. Bundle `eng.traineddata` into `public/tessdata/`.
3. Self-host `langPath` via `${VERCEL_URL}/tessdata`.
4. Trace `tesseract.js-core` WASM into the serverless bundle via
   `outputFileTracingIncludes`.
5. Broader pnpm-store trace globs (`./node_modules/.pnpm/tesseract.js*/**`).
6. `/api/diagnose` endpoint with file-presence audit.
7. `pnpm patch` registering `patches/tesseract.js@5.1.1.patch` via
   `patchedDependencies` in `pnpm-workspace.yaml`.
8. Pin `pnpm@10.32.1` via `packageManager` so Vercel honored the
   patch syntax.
9. `prebuild` script (`scripts/patch-tesseract.mjs`) doing an idempotent
   string replace on `node_modules/.../worker-script/node/index.js`.

Every one of those nine deploys produced the **byte-identical** error
stack — `/var/task/node_modules/.pnpm/tesseract.js@5.1.1/...` (no
`_patch_ha_` suffix), same `require('..')` failure, same hang. Vercel's
runtime is rewriting the file before invoking it; nothing we ship in
the deployment can change that path.

## Decision

**Tesseract is local-development-only.** On Vercel the route
(`app/api/extract-label/route.ts`) detects `process.env.VERCEL` and:

- Skips the `tesseractExtract(buffer)` call entirely.
- Uses the LLM's verbatim `governmentWarningText.value` as the `rawText`
  source for the strict matcher.
- Returns `{ words: [], confidence: 0 }` — bbox highlighting becomes a
  no-op on production; the UI gracefully omits the yellow rectangle.
- Adds `ocrSource: "tesseract" | "llm-fallback"` to the response so the
  UI / persisted `Review` records can surface which path was taken.

Local dev (`pnpm dev`) and the test suite still run Tesseract in
parallel — no changes to that path.

## Consequences

### Wins

- The deployed app actually works. `/api/extract-label` returns 200
  inside the latency budget on Vercel.
- Layer 2 against the deployed instance maintained **11/11 gov-warning
  recall** on this code path before the patch experiments started — the
  LLM-as-rawText fallback is empirically validated.
- Schema-coercion fix from Phase 8 is unaffected — the LLM extraction
  path still benefits from the bare-scalar coercer.

### Losses

- **Defense-in-depth weakened.** The 100 %-recall guarantee was
  originally backed by Tesseract (a non-LLM source) so a hypothetical
  future LLM regression couldn't silently pass a mutated gov-warning.
  On production we now trust the LLM to copy the warning text
  verbatim. The system prompt explicitly instructs verbatim
  preservation, and Layer 2 confirms it works in practice. CI mutation
  fuzz still defends the **matcher logic**; only the ground-truth
  source is different.
- **Bbox highlighting unavailable on production.** Click-to-highlight
  draws nothing on the image overlay because there are no Tesseract
  word bboxes to anchor to. The component renders the field row click
  state correctly; only the rectangle is missing.
- **Hallucination cross-check weakened.** The original design demoted
  any LLM `evidenceQuote` not present in Tesseract's `rawText` to
  manual review. On production that cross-check is short-circuited
  (rawText IS the LLM output, so every quote trivially "appears"). The
  nuanced ladder + confidence gate still catches gross hallucination.

### Out-of-scope alternatives considered

- **Move OCR client-side.** Browser tesseract.js works without the
  Vercel bytecode bug. Would restore full feature parity but adds a
  5–8 s wait on the user's first label upload (worker init + WASM
  download), changes the client/server contract, and breaks the batch
  Web Worker pool's current shape. Worth doing if the project
  graduates from a polished POC to a production product.
- **Replace Tesseract with AWS Textract or Google Document AI.** Adds
  external infrastructure + cost; defeats the "OpenRouter only"
  preference locked in PRESEARCH §5.6.

## Implementation

- `app/api/extract-label/route.ts` — `skipTesseract` branch + `ocrSource`
  field.
- `app/api/extract-label/route.test.ts` — regression test asserting
  Tesseract is NOT called when `VERCEL=1` is set, and the response
  carries `ocrSource: "llm-fallback"`.
- `lib/ocr/tesseract.ts` — reverted to the simple default-CDN
  `createWorker` form. The self-host `langPath` indirection is gone.
- `next.config.ts` — `outputFileTracingIncludes` removed.
- `vercel.json` — `maxDuration: 120` retained as headroom for cold-
  start LLM calls.
- Removed: `app/api/diagnose/route.ts`, `scripts/patch-tesseract.mjs`,
  `patches/tesseract.js@5.1.1.patch`, `public/tessdata/`,
  `patchedDependencies` entry in `pnpm-workspace.yaml`.

`packageManager: pnpm@10.32.1` is retained — version pinning is good
practice independent of this decision.
