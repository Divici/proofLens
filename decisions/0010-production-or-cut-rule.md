# 0010: Production-or-cut rule — no half-features

**Date:** 2026-05-03
**Status:** Accepted
**Phase:** Post-Phase-9 finalize

## Context

Several Phase-9 follow-up changes shipped features that worked in
local dev but broke on Vercel. The root cause is consistent: ADR 0007
documents that Tesseract.js is disabled on Vercel (the experimental
Rust bytecode runtime can't resolve tesseract.js v5's CJS
worker_threads chain). The `rawText` and `words[]` outputs are
synthesized as a sparse fallback in production (see
`app/api/extract-label/route.ts:234`):

- `rawText` becomes the LLM's gov-warning capture only (≈ 320 chars).
- `words[]` is empty.

Code that consumes those values silently degrades on Vercel. Two
concrete cases:

1. **Bbox click-to-highlight** — depended on `words[]`. UI rendered
   the affordance ("Click a field on the right to highlight its
   source") but the click did nothing visually on production.
2. **Bottler function-phrase scanner** — depended on `rawText`. On
   Vercel the verb-bearing label text isn't in `rawText`, so the
   scanner false-warned on every label that contained the verb.

The user's explicit instruction (this session, paraphrased):

> "Any tools that don't work in production should not be in the app
> or a working alternative should be used."

This ADR codifies that rule.

## Decision

Going forward, when a feature depends on a local-only or
environment-specific signal:

1. **Default to cut.** Remove the affordance from the UI and the
   handler from the codebase. Don't ship a feature that's silently
   dead in production.

2. **Working alternative is the only valid alternative to cut.**
   "Build a fallback" is acceptable only when the fallback genuinely
   provides the feature in production. Half-features (works on
   local, dead on Vercel) are not allowed.

3. **Document the cut.** When a feature is removed under this rule,
   record the decision in this ADR (or extend it) so a future agent
   doesn't reintroduce the same broken pattern.

## What this ADR cuts (today)

- **Bbox click-to-highlight overlay** in the review page's left-
  column LabelImagePreview. The SVG overlay code in
  `components/LabelImagePreview.tsx` stays (still useful for tests
  and for any future Vercel-friendly bbox source), but the page no
  longer passes a non-null `bbox` prop. The "Click a field on the
  right..." help-text is removed. Field-row click still expands the
  HumanOverridePanel — that's a real action, not a dead promise.
- The page-level `activeField` / `activeBbox` state is removed; the
  controlled `selectedField` / `onSelectField` props on
  `VerificationDetail` are still accepted (back-compat) but no caller
  passes them — `VerificationDetail` falls back to its internal
  `activeField` state for the override-panel toggle.

## What this ADR keeps (with a working alternative)

- **Bottler function-phrase scanner** — fixed in the same change set.
  The scanner now merges `rawText` AND the LLM's
  `bottlerName.evidenceQuote` into a single haystack. On Vercel,
  rawText is sparse but the LLM's evidence quote typically contains
  the verb-bearing slice (e.g., "BREWED AND BOTTLED BY STONE'S THROW
  BREWING CO."). On local dev, both sources have the verb; merging
  is a no-op safety net. See `lib/verify/nuanced/bottler-function-
  phrase.ts`.

## Consequences

### Wins

- No more "feature looks like it works locally but produces a dead
  click / false signal on Vercel". The deployed app's UX matches
  what the local app shows.
- Future agents have a clear rule to apply when adding features that
  touch `rawText` / `words[]` / any local-only signal.
- The audit plan at
  `memory-bank/plans/2026-05-03-full-review-and-finalize.md`
  references this ADR as the source of the production-or-cut rule.

### Trade-offs

- **Lost functionality:** local-dev users who clicked a field row
  saw a bbox highlight on the label image. That's gone for everyone.
  Acceptable: the feature was inconsistent and any reviewer who only
  used production never had it.
- **Bbox in PDF exports:** the `FieldResult.bbox` field is still
  populated by the pipeline (when Tesseract runs locally) and still
  flows into PDF exports. The export of saved reviews uses whatever
  bbox was present at save time. This is an inconsistency — saved
  reviews from local dev have bboxes; saved reviews from Vercel
  don't. We accept this for now because the export consumer is the
  reviewer themselves (it's an audit document, not a regulator
  artifact).
- **The pipeline still computes bboxes when Tesseract is available.**
  We could remove that code too, but leaving it preserves the option
  to re-enable bbox UI if a Vercel-friendly source lands later
  (e.g., LLM-returned approximate bboxes in a future prompt
  iteration).

## Future work

If a Vercel-friendly bbox source lands (most likely path: extend
the LLM extraction prompt to include approximate bbox per field as
a four-int tuple), the click-to-highlight UI can be re-added. That
would be a feature ADR, not a reversal of this one — this ADR only
cuts the broken affordance, not the conceptual feature.

## Supersedes

None. Extends ADR 0007 (OCR prod-vs-local). Cited from
`memory-bank/plans/2026-05-03-full-review-and-finalize.md`.
