# System Patterns

## Architecture style

Stateless serverless web app with browser-local persistence.

- Client (Next.js, browser): drives all UX, holds all user state in IndexedDB
- Server (Next.js Route Handlers on Vercel): stateless extraction endpoints
- Zero server-side user data (per IT note)

## Single-label data flow

```
Client (upload | camera | batch row)
   ↓ preprocessing (Canvas / sharp): EXIF rotate, resize ≤1568px, q85 JPEG
POST /api/extract-label  (stateless)
   ↓ image in memory only
PARALLEL:
   • Claude Haiku 4.5 via OpenRouter → fields with evidenceQuote, confidence
   • Tesseract.js full-label OCR → raw text + word-level bboxes
       + bbox-cropped gov-warning ground truth
   ↓ merge + confidence gate (~20% to Sonnet 4.6 with OCR context)
   ↓ verification pipeline:
     • strict matchers (gov-warning 3-layer, ABV ±tolerance, net-contents)
     • nuanced ladder (case-strip → punct-strip → NFKC → fuzzball)
     • LLM-judge in 0.78–0.92 gray band only
     • status engine (2-D matrix → 8-state enum, image-quality override)
     • templated rule-sourced explanations
   → return FieldResult[] + overall + thumb + bboxes
   → server persists nothing
Browser writes to IndexedDB:
   • thumbnail (256px) + extracted + raw_text + bboxes
   • field results + image-quality flags + reviewer name
   • final decision + notes
Browser renders detail screen with bbox highlight overlay
```

## Batch flow

```
Client: drop 30-250 files + paired CSV/JSON
       → soft-warn at 50, hard cap at 250
       → pair labels to expected-data rows by filename
Web Worker pool (10 concurrent in browser) calls /api/extract-label
bottleneck respects per-provider rate limits
Per-file results stream into IndexedDB as completed
Result table updates live; filter, retry-failed, open-detail
Tab close → in-progress items lost; completed items persisted
```

## Verification pipeline

```
extracted FieldResult[]   expected ApplicationData
         └──── field router ────┘
                   │
       ┌───────────┴───────────┐
       ▼                       ▼
   STRICT (gov-warning,    NUANCED (brand,
   ABV, net-contents)      class, bottler,
       │                   country)
   pure code,                  │
   no LLM-judge,           match ladder
   CI mutation fuzz        + LLM-judge in
   on gov-warning          0.78–0.92 band
       │                       │
       └─── status engine ─────┘
                   │
            explanation render
                   │
              FieldResult
```

## Three-layer government-warning matcher

1. **Prefix:** case-sensitive `text.startsWith("GOVERNMENT WARNING:")`
2. **Body:** NFKC + smart-quote/dash collapse + markdown-strip +
   whitespace-collapse → exact compare to canonical § 16.21 string
3. **Diagnostic:** Damerau-Levenshtein distance for the explanation prose

CI fast-check property test asserts ≥100 mutations all rejected.

## Provider abstraction

OpenRouter is the abstraction. Model names are env vars:
`OPENROUTER_MODEL_PRIMARY`, `OPENROUTER_MODEL_FALLBACK`,
`OPENROUTER_MODEL_JUDGE`. Phase 7 eval can swap via config alone.

## Component boundaries

- `lib/ai/` — only place that talks to OpenRouter
- `lib/ocr/` — only place that talks to Tesseract
- `lib/verify/` — pure functions; no I/O; testable in isolation
- `lib/storage/` — only place that touches IndexedDB
- `lib/workers/` — Web Worker isolation for batch

Every cross-module boundary uses a Zod-validated schema.
