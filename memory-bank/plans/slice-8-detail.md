# Slice 0008 — Exports (PDF + CSV + JSON) — execution plan

## Source-of-truth spec

`issues/0008-exports.md`.

## Branch

`slice/0008-exports` off main. Worktree:
`.worktrees/slice-0008-exports/`.

## Context delta

After slice 0007: `/batch` ships with a stubbed Export button
(`disabled + aria-disabled="true"`). Single-review `/review` page has
no export menu yet. This slice wires real exports.

## What's in / what's out

**In scope:**
- `app/api/render-pdf/route.ts` — stateless POST `Review` JSON → PDF
  Blob via `@react-pdf/renderer`
- `lib/export/pdf/template.tsx` — PDF report layout (per-label):
  header (proofLens + version) → metadata (reviewer, date, beverage,
  rules version) → image thumbnail → expected vs extracted field-by-
  field table → overall verdict → human override section (if any) →
  reviewer notes → § 16.21 footer → signature line
- `lib/export/csv/{summary,per-field}.ts` — papaparse-driven CSV
  generators
- `lib/export/json/{single,batch}.ts` — pure JSON serializers
- `lib/export/zip/batch.ts` — `archiver` streaming wrapper
- `components/ExportMenu.tsx` — single + batch variants via prop
- Wire ExportMenu on `/review` and `/batch` summary panel
- Replace the slice-0007 export stub with the real menu

**Out of scope:**
- Final polish + a11y final pass (slice 0009)
- README full final draft (slice 0009)
- Demo data final swap (slice 0009)

## Task graph

### Track 1 — PDF (TDD)
1. **Failing tests first**: `lib/export/pdf/template.test.tsx`
   - `<ReviewReport review={mock}>` renders all required sections
   - Image embeds (thumbnail Blob → DataURL)
   - Field rows match
   - Override section appears only when overrides exist
   - § 16.21 footer present
2. `lib/export/pdf/template.tsx` — `@react-pdf/renderer` React component.
3. **Failing tests first**: `app/api/render-pdf/route.test.ts`
   - POST with valid Review → 200 + Content-Type: application/pdf +
     non-empty body
   - Reject malformed Review with 400
4. `app/api/render-pdf/route.ts` — stateless POST handler.

### Track 2 — CSV (TDD)
5. **Failing tests first**: `lib/export/csv/summary.test.ts`
   - Given a batch + reviews, renders expected CSV row count + headers
6. `lib/export/csv/summary.ts` — papaparse `unparse`.
7. **Failing tests first**: `lib/export/csv/per-field.test.ts`
   - One row per (label × field) with override columns populated
8. `lib/export/csv/per-field.ts`.

### Track 3 — JSON (TDD)
9. **Failing tests first**: `lib/export/json/single.test.ts` +
   `batch.test.ts` — full structured dump, deterministic key order.
10. `lib/export/json/single.ts`, `lib/export/json/batch.ts`.

### Track 4 — ZIP (TDD)
11. **Failing tests first**: `lib/export/zip/batch.test.ts`
    - ZIP contains N PDF entries when given N reviews
    - ZIP contains N JSON entries
    - Stream completes; can be opened by a ZIP reader
12. `lib/export/zip/batch.ts` — `archiver` streaming.

### Track 5 — UI (TDD)
13. **Failing tests first**: `components/ExportMenu.test.tsx`
    - Single variant: PDF + JSON options
    - Batch variant: Summary CSV + Per-field CSV + All PDFs (zip) +
      All JSON (zip)
    - Loading state during render
    - Toast on success / failure
14. `components/ExportMenu.tsx` — shadcn `DropdownMenu`.
15. Update `app/review/page.tsx` — render `<ExportMenu mode="single">`
    after the verdict panel.
16. Update `app/batch/page.tsx` — replace the stubbed Export button
    with `<ExportMenu mode="batch">`.

### Track 6 — E2E
17. **Failing test first**: `test/e2e/export.spec.ts`
    - Single review export PDF (downloads, file is non-empty)
    - Single review export JSON
    - Batch export ZIP (downloads, extracts to N entries)

### Track 7 — STUDY_GUIDE.md
18. Sections "How we generate PDFs server-side" + "Why ZIP exports stream".

## Acceptance gate

Per `issues/0008-exports.md`. Vitest grows from 473 to ~510-540.
Playwright grows from 17 to ~20. All quality gates green. Mutation
fuzz still 100/100.

## Estimated effort

4-5h. Only real complexity is `@react-pdf/renderer` styling.

## Reasonable deviations

- If `archiver` doesn't play with Next.js Route Handler streaming
  (needs `Readable.toWeb` or similar), use `JSZip` as a fallback.
- PDF font: load Inter from a static file in `public/fonts/`. If
  font fails to load on Vercel, fall back to Helvetica (built-in).
- The PDF embeds the 256px thumbnail (NOT the original) — note this
  in the PDF footer ("Image is the 256px thumbnail; originals are not
  retained per the data-handling policy.").
- Batch ZIP for 250 PDFs streams to client; if memory is a concern,
  generate in chunks of 25 and append to the ZIP stream.
