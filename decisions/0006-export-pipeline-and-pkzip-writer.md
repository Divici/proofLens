# 0006: Export pipeline + browser-side PKZIP writer

**Date:** 2026-04-30
**Status:** accepted
**Slice:** 0008 (exports milestone)

## Context

Reviewers need an audit-of-record they can attach to a compliance
ticket. The PRD requires four exports:

1. **Per-review PDF** — the human-readable audit copy.
2. **Per-review JSON** — machine-readable + complete + replay-able.
3. **Batch Summary CSV** — one row per review (top-level fields).
4. **Batch Per-field CSV** — one row per (review × field), including
   override audit columns.

Plus the bundled artifacts:
5. **All PDFs (zip)** — every review in one archive.
6. **All JSON (zip)** — every review JSON + a `batch.json` envelope.

The implementation choices: PDF rendering server-side (`@react-pdf/
renderer` in a Node route) vs. client-side (`react-pdf` browser
build); JSZip vs. a hand-rolled stored ZIP writer; CSV via PapaParse
vs. hand-rolled escaping.

## Decision

### PDF — server-side `@react-pdf/renderer`

`POST /api/render-pdf` receives a `Review` JSON envelope (with
thumbnail base64) and renders the PDF in the route handler:

- `@react-pdf/renderer` runs Node-only; the browser build is
  heavy (~700 KB) and the route already runs on `iad1` close to
  the user.
- Built-in fonts (Helvetica / Times-Roman / Courier) avoid Vercel
  cold-start failures from custom font registration; we accept the
  styling tradeoff.
- The thumbnail comes in as base64 — keeps the React component
  pure and synchronous (no `fetch` inside `<Image>`).

### CSV — PapaParse

`papaparse.unparse` handles RFC-4180 quoting + newlines + commas
embedded in field values without us hand-rolling escaping. Title
Case headers (slice 0009 fix-up) for spreadsheet ergonomics.

### JSON — deterministic envelope

Single-review and batch JSON envelopes use `serializeReviewJsonAsync`
and `serializeBatchJsonAsync`. Thumbnails inline as base64 (so the
JSON is fully self-contained — not "go fetch this Blob URL"). Field
order is locked so two exports of the same Review produce
byte-identical JSON.

### ZIP — hand-rolled stored (level-0) writer

`lib/export/zip/browser.ts` implements a minimal PKZIP writer in
~150 LOC. Reasons:

- **JSZip is ~120 KB minified.** The hand-rolled writer is ~5 KB.
- **We only need stored compression.** PDFs and JPEGs are already
  compressed; deflating them is a CPU sink with no payoff. CSV
  and JSON archives are small enough that level-0 storage is
  acceptable.
- **Byte-stable output.** The writer takes an explicit `mtime`
  parameter so two exports of the same batch produce byte-
  identical archives — auditors checksum these.

The writer emits Local File Headers + Central Directory Records +
the End-of-Central-Directory record per the PKZIP appnote (4.4.5
"compression method = 0"). CRC-32s are computed inline (no `zlib`
dep).

### Export menu UX

`<ExportMenu>` wraps `@base-ui/react/menu` for keyboard nav + a11y.
Single-row PDFs/JSONs and batch CSV/PDF/JSON ZIPs each show a row
with a hint sub-line and a per-row spinner so reviewers know which
action is in flight. Toasts on success and failure.

Slice 0009 fix-up: when the batch isn't yet saved, mid-batch CSV
exports work via `disablePdfExport` — the in-memory `items[]` are
synthesized into a Batch + Review[] for the CSV path; PDF / ZIP
rows render disabled with a "Save the batch first" hint.

### Filenames

Branded slugs + 8-char id stub:

- `prooflens-review-{brand-slug}-{id-stub}.pdf`
- `prooflens-review-{brand-slug}-{id-stub}.json`
- `prooflens-batch-{date}-{batch-id-stub}-summary.csv`
- `prooflens-batch-{date}-{batch-id-stub}-per-field.csv`
- `prooflens-batch-{date}-{batch-id-stub}-pdfs.zip`
- `prooflens-batch-{date}-{batch-id-stub}-json.zip`

## Consequences

### Positive

- Bundle size stays tight: no JSZip, no client-side react-pdf, no
  custom fonts.
- Exports are byte-stable; auditors can checksum.
- Toasts + per-row spinners give reviewers honest feedback during
  long-running PDF batch renders.
- The hand-rolled ZIP writer is deliberately simple — one file,
  no dependencies, easy to vet.

### Negative

- The hand-rolled ZIP writer doesn't compress. For some users with
  tens of thousands of CSV rows that might matter eventually; the
  current target (250 reviews max) is well within "just store it"
  range.
- The PDF route is a synchronous render. For a 250-PDF batch it
  takes a while; we render sequentially in the client glue to
  avoid memory spikes. Future improvement: chunked parallel
  renders with backpressure.
- `@react-pdf/renderer` doesn't support shadcn / Tailwind classes
  — the styling is StyleSheet objects in the component file. We
  accept the slight visual drift between the in-app review detail
  and the PDF artifact.

### Deferred to later slices

- Compression for the JSON archive (DEFLATE) — slice 0009 NICE.
- Progress toast for ZIP renders > 10 PDFs — slice 0009 NICE.
- Per-export digital signature / watermark — out of scope for the
  POC.

## References

- `issues/0008-exports.md` — slice spec
- `memory-bank/plans/slice-8-detail.md` — execution plan
- `lib/export/pdf/template.tsx` — PDF component
- `lib/export/pdf/wire.ts` — Review → PDF buffer wrapper
- `app/api/render-pdf/route.ts` — server-side PDF endpoint
- `lib/export/csv/{summary,per-field}.ts` — Title Case CSV exports
- `lib/export/json/{single,batch}.ts` — JSON envelopes
- `lib/export/zip/browser.ts` — minimal PKZIP writer
- `lib/export/client.ts` — browser glue + download helper
- `components/ExportMenu.tsx` — `<ExportMenu>` UI
- `test/e2e/export.spec.ts` — E2E coverage
