# proofLens — Presearch (Architecture Locked)

> Output of conductor Phase 2. Synthesizes Phase 0 alignment + Phase 1 research
> into the locked architecture for the build phase. Tracked artifact, drop-in
> compatible with downstream skills (`to-issues`, `scaffold`, `build`,
> `eval`, `sweep`).
>
> Compiled: 2026-04-30. Status: **LOCKED** (pending Phase 3.5 final review).

---

## 1. Product summary

proofLens is a polished web app that helps TTB compliance reviewers verify
that uploaded alcohol-label artwork matches the expected application data.
Reviewers upload a label (single, batch, or live camera), enter expected
values, and the app extracts visible label fields, compares them against
the expected values per TTB rules (Parts 4 / 5 / 7), flags issues with
explanations and confidence, surfaces image-quality problems, and supports
human override and final decision. Deployed live URL is the deliverable.

**Hard performance targets:** verdict accuracy ≥ 95% on a hand-labeled
golden set ≥ 30 labels; p50 ≤ 5.0s, p95 ≤ 8.0s end-to-end; ≤ $0.05/label
AI cost; **100% recall** on government-warning strict-fail.

**IT constraint (Marcus's note):** "not storing anything sensitive for
this exercise." Interpretation: zero server-side persistence of user
data. All review data lives in IndexedDB in the user's browser.
Server endpoints are stateless.

---

## 2. Requirements registry (R-IDs)

Derived from PRD §6 (Product Goals) + §9 (Full Scope) + §10 (Field Rules) +
§11 (UX) + §12 (Performance) + §18 (Acceptance Criteria). Every R-ID gets
phase coverage in §15. No R-ID may be left unassigned.

### R-001 — Single label upload + verification flow
Upload one label image, enter expected app data, verify, see field-level +
overall results, override, decide, export, save to local history.
*Source: PRD §9.1, §11.2, §18.2.*

### R-002 — Batch label upload + verification flow
Upload up to 250 labels with paired CSV/JSON expected-data, queue +
process 10 concurrent, see per-label progress, filter results, open
detail view, retry failed, export, save batch history.
*Source: PRD §9.2, §11.3, §18.3.*

### R-003 — Live camera capture
Capture from rear camera (mobile) or webcam (desktop), with retake gate
before submit. Same verification path as upload.
*Source: alignment Q3.*

### R-004 — Expected application data input
Manual form (PRD §13.1 schema) + "Load demo data" buttons + CSV/JSON
paired import for batch (auto-pair by filename, downloadable template).
*Source: PRD §9.3.*

### R-005 — Beverage-aware verification
UI selector for Beer / Wine / Spirits / Other-or-Unknown. Per-type
required-field table drives which fields are Required / Conditional /
Optional / Not-Applicable. "Other / Unknown" runs universal checks only
and routes everything else to manual review with a banner.
*Source: PRD §9.16, alignment Q4, RESEARCH §1.2.*

### R-006 — AI extraction with confidence + evidence
Vision LLM extracts structured fields (PRD §13.2 schema) with per-field
confidence and `evidenceQuote`. Tesseract OCRs the full label for
ground-truth text + word-level bbox. Bbox is computed by locating the
LLM's evidenceQuote in Tesseract's word stream.
*Source: PRD §9.4, §9.13, RESEARCH §2 + §3.5.*

### R-007 — Field-by-field verification
Per-field result with status enum (Pass / Likely Match / Warning / Fail /
Missing / Low Confidence / Needs Manual Review / Not Required) + confidence
+ explanation + suggested action + evidence reference + human-override
state. Status assigned by hybrid deterministic-first pipeline (strict
matchers + nuanced ladder + gray-band LLM-judge).
*Source: PRD §9.5, §10.x, RESEARCH §3.*

### R-008 — Overall result calculation
Roll up field results to one of: Pass / Pass with Warnings / Needs Manual
Review / Fail / Request Better Image. Show field-level breakdown alongside
overall; never collapse detail. Show processing time.
*Source: PRD §9.6.*

### R-009 — Government warning strict validation (100% recall)
Three-layer matcher: (1) prefix `GOVERNMENT WARNING:` exact case-sensitive,
(2) NFKC + smart-quote/dash + markdown-strip + whitespace-collapse + exact
compare to canonical § 16.21 string, (3) Damerau-Levenshtein near-miss
diagnostic for the explanation. Tesseract.js (not the LLM) supplies the
ground-truth string for the strict compare. CI mutation fuzz harness
(`fast-check`) enforces 100% rejection of all known mutations; build
failure if any mutation passes.
*Source: PRD §9.9, §10.7, alignment Q6, RESEARCH §1.1 + §3.2 + A.1.*

### R-010 — Nuanced field matching
Match ladder per nuanced field (brand, class/type, bottler name, country):
case-strip → punct-strip → NFKC → fuzzy-similarity (`fuzzball`) → status.
LLM-judge fires only inside 0.78–0.92 similarity gray band, never on
strict fields. Templated rule-sourced explanations.
*Source: PRD §9.10, §10.1–10.6, RESEARCH §3.*

### R-011 — Image quality detection
Detect and surface blur / glare / skew / low-light / cropping / low-res /
obstruction / multiple-labels. Use vision-LLM signals + image-statistics
heuristics (Laplacian variance for blur; histogram analysis for
exposure). Image-quality signals override any non-Pass field cell to
"Needs Manual Review" / "Request Better Image".
*Source: PRD §9.11, §18.4, RESEARCH §3.4.*

### R-012 — Human override + final decision
For each field: show original AI status, allow agent to set new status,
capture reason note, timestamp, reviewer name. Final review decision
(Approved / Rejected / Needs Manual Review / Request Better Image) with
notes. Preserve AI result and human decision separately in the review
record.
*Source: PRD §9.7, §9.8, §13.4, §18.5.*

### R-013 — Image preview + zoom + rotate + bbox highlight overlay
Side-by-side image vs extracted-data view. Zoom + rotate controls on the
image. Click a field row → bbox polygon highlights on the image overlay
(yellow rectangle rendered from Tesseract word positions, computed via
the locate-evidenceQuote algorithm).
*Source: PRD §9.12, alignment J.*

### R-014 — Review history (browser-local)
List of past reviews per browser (IndexedDB). Search, filter by status,
filter by beverage, reopen, AI-vs-overridden indicator. Free-text reviewer
name on each review (audit field, not identity). Records are per-browser;
no cross-device.
*Source: PRD §9.14, alignment C, IT note.*

### R-015 — Export reports
PDF (per-label review report — image, fields, results, decision, notes,
signature line, generated server-side via `@react-pdf/renderer`). CSV
(batch summary + per-field results sheet via `papaparse`). JSON (full
structured dump). Batch export = ZIP via `archiver`.
*Source: PRD §9.15, §17.2, alignment Q8.*

### R-016 — Polished empty / loading / error states
Plain-English error messages, never raw HTTP codes. States for: no upload,
no expected data, verification running, batch running, AI failed,
image unreadable, upload failed, export failed, review saved, review
reopened.
*Source: PRD §11.5.*

### R-017 — Performance targets
Single label: p50 ≤ 5.0s, p95 ≤ 8.0s. Tracked + displayed in UI. UI shows
clear progress on longer operations. Batch: per-label progress, partial
results, retry failed.
*Source: PRD §12.1, §12.2, alignment Q6.*

### R-018 — Accessibility
Clear typography (Inter), high contrast, ≥ 44px touch targets, full
keyboard navigation, screen-reader-friendly ARIA labels, color + icon +
text status indicators (not color-only), plain language.
*Source: PRD §15.*

### R-019 — Documentation deliverable
README + setup + run + deploy + AI/OCR approach + verification approach +
HITL workflow + batch flow + image-quality handling + gov-warning
validation + data storage / privacy + assumptions + tradeoffs + known
limitations + future improvements.
*Source: PRD §16, §17.1.*

### R-020 — Demo data bundle
Hybrid: 2-3 real public-domain TTB COLA samples for happy paths + 4-5
hand-crafted Figma mocks for edge-case demos (gov-warning capitalization,
ABV mismatch, missing net contents, glare/blur). Each demo image paired
with a one-click `expected-data.json`. Camera-capture demo flow tested.
*Source: PRD §9.17, §19, alignment Q3.*

### R-021 — Deployed live URL
App accessible at a public URL; reviewers can complete the flows
end-to-end without setup. PRD §17.2.

### R-022 — Restricted-network posture
Configurable provider allow-list surfaced in `/settings`. App displays
which providers are reachable; missing providers degrade gracefully
with banner notices.
*Source: PRD §14, RESEARCH §4.4.*

---

## 3. Architecture overview

### 3.1 Data-flow diagram

```
              Client (Next.js, browser, mobile or desktop)
   ┌────────────┬─────────────┬───────────────────────────┐
   │ Upload     │ Camera      │ Batch (paired CSV+files)  │
   │ <input>    │ getUserMedia│ <multi-file dropzone>     │
   └────────┬───┴─────┬───────┴────────────┬──────────────┘
            │         │                    │
            │  client-side preprocessing (Canvas / Web Worker:
            │  EXIF rotate, resize ≤ 1568px, JPEG q 85)
            │         │                    │
            ▼         ▼                    ▼
   ┌─────────────────────────────────────────────────────┐
   │ Web Worker pool (10 concurrent) calls               │
   │   POST /api/extract-label  (stateless)              │
   └────────────────────┬────────────────────────────────┘
                        │
                        ▼
   ┌─────────────────────────────────────────────────────┐
   │ Stateless Route Handler /api/extract-label          │
   │   • image stays in memory only                      │
   │   • PARALLEL: Claude Haiku 4.5 (via OpenRouter)     │
   │              + Tesseract.js (full-label OCR)        │
   │   • merge: Haiku → fields; Tesseract → raw text +   │
   │            word-bboxes + gov-warning ground truth   │
   │   • confidence gate: ~20% re-run on Sonnet 4.6      │
   │     (via OpenRouter) with OCR text injected         │
   │   • verification pipeline: strict matchers +        │
   │     nuanced ladder + LLM-judge gray-band            │
   │   → return FieldResult[] + overall + bbox + thumb   │
   │   → NOTHING persisted server-side                   │
   └────────────────────┬────────────────────────────────┘
                        │
                        ▼
                 result returned
                        │
                        ▼
   ┌─────────────────────────────────────────────────────┐
   │ Browser persists to IndexedDB                       │
   │   • thumbnail (256px JPEG)                          │
   │   • field results + extracted + raw_text + bboxes   │
   │   • image-quality flags                             │
   │   • reviewer name (free-text input, not identity)   │
   │   • final decision + notes                          │
   │ Browser renders detail screen with bbox highlight   │
   │ overlay on the displayed image.                     │
   └─────────────────────────────────────────────────────┘
```

### 3.2 Why stateless server + browser-local storage

- **Marcus IT note**: "not storing anything sensitive." Stateless
  endpoints + IndexedDB satisfy this strictly.
- Drops Neon Postgres, Drizzle, Better Auth, Cloudflare R2, Inngest from
  the recommended-stack-research output — significant simplification.
- Trade: no cross-device history; data lost if browser data is cleared;
  batch resets if tab closes mid-run (250 files × ~5s @ 10 concurrent
  ≈ 2 min — manageable). Acceptable for a POC.

---

## 4. Tech stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) | Forge default; RSC + Route Handlers fit our stateless model |
| Language | TypeScript (strict) | Forge default; Zod schemas at every cross-module boundary |
| UI components | shadcn/ui + Tailwind v4 | Forge default; calm-internal-tool aesthetic fits |
| Forms | react-hook-form + Zod | Single Zod schema feeds form, server validation, types |
| Browser persistence | IndexedDB via `idb` | Tiny wrapper, typed; review history + extracted data + thumbs |
| LLM gateway | OpenRouter (OpenAI-compatible) | Single SDK, model swap = config var, built-in cost dashboard |
| LLM models | Claude Haiku 4.5 (vision, primary) + Claude Sonnet 4.6 (fallback) | Via OpenRouter; tiered routing |
| OCR | Tesseract.js (`tesseract.js` npm) | OSS; runs in Vercel function or browser; gov-warning ground truth + word-level bbox |
| Image preprocessing (server) | `sharp` | EXIF rotate, resize, JPEG q85 |
| Image preprocessing (client) | Canvas + Web Worker | Pre-upload from camera capture |
| Camera capture | Custom thin wrapper (`getUserMedia` + iOS Safari `facingMode` workarounds) | No good library; rolling our own |
| Fuzzy matching | `fuzzball` | rapidfuzz-style for nuanced ladder |
| Levenshtein (gov-warning diagnostic) | `fastest-levenshtein` | Speed for near-miss diagnostic |
| Unit conversion (volume) | `convert-units` | mL ↔ L ↔ cL ↔ fl oz |
| Unicode normalization | native `String.normalize("NFKC")` | No external dep |
| Markdown strip | `remove-markdown` | Defensive when OCR returns bold |
| Schema | `zod` | RuleOutcome, FieldResult, judge response |
| Property tests | `fast-check` + `vitest` | Mutation fuzz; equivalency tests |
| LLM-judge regression | `promptfoo` (optional) | Phase 7 eval tooling |
| Concurrency | Web Worker pool (custom) + `bottleneck` (rate-limit) | 10 concurrent calls; per-provider limit |
| PDF | `@react-pdf/renderer` | Server-side, React-component templates |
| CSV | `papaparse` | De-facto |
| ZIP (batch export) | `archiver` (streaming) | Avoids OOM on 250-file ZIPs |
| Production cost telemetry | OpenRouter dashboard | Built-in; per-key cost + model usage; no extra tool |
| Eval traces (Phase 7) | Langfuse Cloud | Golden-set traces + offline eval; free tier |
| Testing | Vitest + RTL + fast-check + Playwright + MSW | Unit + property + E2E + network mock |
| Deployment | Vercel Hobby + Fluid compute | Free tier; Fluid covers 5–8s hot path; preview URLs per PR |
| Domain / DNS | Vercel-provided `.vercel.app` (or custom domain if user provides) | Free with Hobby |

### 4.1 What is NOT in the stack (and why)

- **Postgres / any DB** — no server-side user data per IT note.
- **Better Auth / any auth lib** — no accounts; reviewer name is free-text.
- **Cloudflare R2 / object storage** — originals always ephemeral.
- **Inngest / batch infra** — browser-side Web Worker pool; stateless server.
- **Drizzle / ORM** — nothing to ORM.
- **Helicone** — OpenRouter dashboard covers production cost telemetry.
- **AWS Textract / Google DocAI** — Tesseract.js in-process; no AWS / GCP dep.

---

## 5. AI strategy (locked)

### 5.1 Pattern

Hybrid: **Vision-LLM + parallel OCR for ground truth + tiered fallback +
deterministic verification + gray-band LLM-judge**.

### 5.2 Per-task model assignment

| Task | Where | Model | Why |
|---|---|---|---|
| Single-pass field extraction (vision) | OpenRouter | `anthropic/claude-haiku-4.5` | Cheapest vision-capable model that hits our latency + structured-output reliability |
| Low-confidence retry with OCR context | OpenRouter | `anthropic/claude-sonnet-4.6` | ~20% of labels; better reasoning when confidence is low |
| Government-warning ground-truth string | In-process | Tesseract.js on the bbox-cropped warning region | Non-LLM source defends 100%-recall on caps |
| Full-label OCR for word-bboxes | In-process | Tesseract.js on the full label | Gives us bbox source for highlight + raw text |
| LLM-judge for gray-band nuanced fields | OpenRouter | `anthropic/claude-haiku-4.5` | Cheap; only fires inside 0.78–0.92 similarity band |
| Phase 7 eval scoring (offline) | Langfuse + OpenRouter | `anthropic/claude-sonnet-4.6` | Stronger judge for golden-set scoring |

### 5.3 Cost forecast

- ~$0.010 blended/label (Haiku $0.0040 + 20% × Sonnet $0.012 + Tesseract
  $0 + LLM-judge ~$0.001 occasional). 5× headroom under $0.05 ceiling.

### 5.4 Latency forecast

- p50 ~3.8s, p95 ~7.0s end-to-end. Inside 5s/8s targets.

### 5.5 Hallucination + recall guards

- Force vision-LLM JSON output via response_format / tool-use schema.
- For each field: require `value`, `evidenceQuote`, `confidence`, with
  `null` allowed when not visible.
- Cross-check `evidenceQuote` against Tesseract raw text; if not
  present → confidence demoted to "low" and flagged as "Needs Manual
  Review".
- Gov-warning strict-fail uses Tesseract output, not LLM output — defends
  100%-recall on the most consequential field.
- CI mutation fuzz harness (`fast-check`) generates mutations of the
  canonical § 16.21 string and asserts the matcher rejects every one;
  build fails if any mutation slips through.

### 5.6 Provider abstraction

OpenRouter is the abstraction. Model names live in env vars:
`OPENROUTER_MODEL_PRIMARY`, `OPENROUTER_MODEL_FALLBACK`,
`OPENROUTER_MODEL_JUDGE`. Phase 7 eval can swap via config.

---

## 6. Verification strategy (locked)

### 6.1 Pipeline

```
extracted FieldResult[]   expected ApplicationData
         │                          │
         └──────────┬───────────────┘
                    ▼
          ┌─────────────────────┐
          │ Field router        │
          │  → strict matcher?  │
          │  → nuanced ladder?  │
          │  → not required?    │
          └─────────┬───────────┘
                    ▼
   ┌────────────────────────────────────────┐
   │ STRICT (gov-warning, prefix-caps,      │
   │ ABV numeric ± tolerance, net-contents) │
   │  → pure code                           │
   │  → cannot reach LLM-judge              │
   │  → CI mutation fuzz on gov-warning     │
   └────────────────┬───────────────────────┘
                    │
   ┌────────────────────────────────────────┐
   │ NUANCED (brand, class/type, bottler,   │
   │ country)                               │
   │  → match ladder: case-strip → punct-   │
   │    strip → NFKC → fuzzy-similarity     │
   │  → LLM-judge ONLY in 0.78–0.92 band    │
   └────────────────┬───────────────────────┘
                    ▼
          ┌─────────────────────┐
          │ Status engine       │
          │ (matchStrength, AI  │
          │  confidence) → 8-   │
          │  state status enum  │
          │  + image-quality    │
          │  override layer     │
          └─────────┬───────────┘
                    ▼
          ┌─────────────────────┐
          │ Explanation render  │
          │  → templated        │
          │  → optional LLM     │
          │    narrative on     │
          │    Manual-Review    │
          │    rows only        │
          └─────────┬───────────┘
                    ▼
        FieldResult { value, expected, status, confidence,
                       explanation, narrativeExplanation?,
                       evidence, bbox, override? }
```

### 6.2 Gov-warning matcher (3 layers)

1. **Prefix layer** — `text.startsWith("GOVERNMENT WARNING:")` exact
   case-sensitive. Mismatch → strict Fail with explanation
   "Required prefix is not in uppercase."
2. **Body layer** — `normalize(extracted) === normalize(canonical)` after
   NFKC + smart-quote/dash collapse + markdown-strip + whitespace-collapse.
   Mismatch → strict Fail.
3. **Diagnostic layer** — Damerau-Levenshtein distance to canonical;
   informs the explanation ("appears modified by N characters").

CI mutation fuzz:
```ts
// 03-verification-logic.md spec
fc.assert(fc.property(canonicalMutations(), (mutated) => {
  expect(govWarningMatch(mutated)).toBe(false);
}));
```

### 6.3 Nuanced match ladder (per nuanced field)

```
strip case → strip punct → NFKC → fuzzball.token_set_ratio(extracted, expected)
  ≥ 92  → Pass (Likely Match if not byte-equal)
  0.78–0.92 → LLM-judge (claude-haiku-4.5 on OpenRouter)
              → judge returns one of: Pass / Likely Match / Manual Review / Fail
  < 0.78 → Fail (or Manual Review if confidence low)
```

### 6.4 Status engine (2-D matrix)

Strict cells collapse to `{Pass, Fail, Missing, Low Confidence}`. Image
quality overrides any non-Pass to `Needs Manual Review` /
`Request Better Image`.

---

## 7. UI design approach

| Aspect | Locked |
|---|---|
| Aesthetic north-star | Calm internal-tool / federal filing — neutral palette, high contrast, clear typography (Inter), dense-but-orderly, status-color limited (green pass / amber warn / red fail / blue manual-review) |
| Source | Manual + iterate from north-star (no Stitch, no external design files) |
| Component library | shadcn/ui + Tailwind v4 |
| Device targets | Desktop-primary + mobile-first-class (responsive, single-column on mobile, multi-column desktop) |
| Brand assets | None — use Inter / system fonts; build small in-app SVG logo |
| Reviewer-facing typography | Inter for UI; ui-monospace for raw text excerpts |

### 7.1 Screen list (full polished product)

1. **Home / New review** — picker between Single + Batch + Camera + Demo
2. **Single review screen** — the §11.2 PRD layout (upload → enter expected → verify → review → decide → export)
3. **Batch review screen** — the §11.3 layout (upload + paired CSV → queue → progress → summary → filter table → per-label detail)
4. **Per-label detail screen** — image preview with zoom/rotate + bbox highlight overlay + extracted-vs-expected comparison + per-field controls + override + final decision + export
5. **History screen** — list of past reviews with search/filter/reopen/AI-vs-overridden indicator
6. **Settings screen** — provider allow-list, demo-data picker, "what's stored" disclosure
7. **Help / about** — plain-English explanation of AI reliability, what's stored, what's not

---

## 8. Data model

### 8.1 IndexedDB schema (browser-local)

```ts
// stores via `idb`
db.review:        Review[]      keyPath: id (uuid)
db.batch:         Batch[]       keyPath: id (uuid)
db.demoData:      DemoData[]    keyPath: scenarioId
db.settings:      Setting[]     keyPath: key

interface Review {
  id: string;
  createdAt: ISO8601;
  reviewerName: string;          // free-text input, audit field
  beverageType: 'beer' | 'wine' | 'spirits' | 'other';
  rulesVersion: 'ttb-2026-04-30';
  expectedData: ApplicationData; // PRD §13.1 schema
  extracted: ExtractedLabelData; // PRD §13.2 schema
  fieldResults: FieldResult[];   // PRD §13.3 schema
  overall: OverallStatus;
  imageQualityFlags: ImageQualityFlag[];
  thumbnail: Blob;               // 256px JPEG
  bboxes: Record<FieldName, BboxPolygon[]>;
  rawText: string;
  decision: HumanDecision;       // PRD §13.4 schema (or undefined if pending)
  processingTimeMs: number;
  aiSpend: { primaryUsd: number; fallbackUsd: number };
}

interface Batch {
  id: string;
  createdAt: ISO8601;
  reviewerName: string;
  reviewIds: string[];
  status: 'queued' | 'processing' | 'complete' | 'partial-failed';
  summary: BatchSummary;
}
```

### 8.2 Server endpoints (all stateless)

| Method | Path | Purpose | Persists? |
|---|---|---|---|
| POST | `/api/extract-label` | Image in, FieldResult+thumbnail out | No |
| POST | `/api/judge-field` | Gray-band LLM-judge call | No |
| POST | `/api/render-pdf` | Review record in, PDF out | No |
| GET | `/api/health` | Provider reachability check | No |

---

## 9. Observability + telemetry

| Concern | How |
|---|---|
| Production cost / latency | OpenRouter dashboard (per-key usage, per-model breakdown, daily aggregations). No proxy. |
| Per-call structured tracing | Optional `console.info` log lines on the server (Vercel Logs); not user-tied |
| Phase 7 eval traces | Langfuse Cloud (golden-set traces, offline eval scoring). Free tier sufficient for POC. |
| Client-side telemetry | None — no analytics tracking per IT note |
| Error reporting | Native Next.js error boundaries + Vercel's built-in runtime logs |

---

## 10. Testing strategy

| Layer | Tool | Pattern |
|---|---|---|
| Unit | Vitest | TDD red-green-refactor (per `~/.claude/rules/tdd.md`); strict matchers, nuanced ladder, ABV/proof parser, volume converter |
| Property | `fast-check` | Mutation fuzz on canonical gov-warning string; equivalency-class fuzz on ABV/volume parsers |
| Component | RTL + Vitest + jsdom | Per shadcn component flow; states (empty / loading / error / saved / reopened) |
| Integration (server endpoints) | Vitest + MSW for OpenRouter | Stateless route handler contracts; structured-output schema; provider-down fallbacks |
| E2E | Playwright | Single-label flow; batch flow; camera-capture flow (with `page.context.grantPermissions(['camera'])`); IndexedDB roundtrip |
| Eval (Phase 7) | Langfuse + golden set | Verdict accuracy ≥ 95%; gov-warning recall = 100%; latency p50 ≤ 5s, p95 ≤ 8s |

### 10.1 Quality gates that block a merge

- All Vitest tests passing
- All Playwright E2E green
- TypeScript build clean (`tsc --noEmit`)
- Lint clean (eslint + biome or whichever the scaffold uses)
- Mutation fuzz on gov-warning passes (CI step)

---

## 11. Bootstrap decisions (pre-answered)

| Decision | Lock |
|---|---|
| Directory structure | `memory-bank/` + `decisions/` (standard) — generated by `scaffold` skill |
| Worktree isolation for build agents | yes (parallel slice work) |
| TDD workflow per `~/.claude/rules/tdd.md` | yes — mandatory |
| Auto-commit per `~/.claude/rules/commit-message.md` | yes |
| `STUDY_GUIDE.md` per `~/.claude/rules/study-guide.md` | yes — gitignored |
| Decision log | `decisions/` ADR folder, generated via `architecture-decision-records` skill at slice boundaries |

---

## 12. Risk register + mitigations

| # | Risk | Mitigation | Owner |
|---|---|---|---|
| R1 | Vision-LLM normalizes gov-warning capitalization | Tesseract.js on cropped warning region as ground truth + CI mutation fuzz | gov-warning slice |
| R2 | Tesseract accuracy on phone-camera shots (glare, perspective) | Client-side preprocessing (Canvas: deskew, contrast stretch, brightness normalize); LLM bbox crop reduces region size; image-quality detection demotes confidence | image-quality slice |
| R3 | Vercel Hobby ToS restricts commercial use | Documented limitation; flag if proofLens becomes a paying product | docs |
| R4 | OpenRouter provider blip / rate-limit | `bottleneck` per-provider limit; circuit-breaker fallback to retry-with-backoff; UI banner if all providers unreachable | extraction slice |
| R5 | Tesseract WASM cold-start latency on Vercel | Warm-keep via cron `/api/health` ping every 5 min; preload in build step | deployment slice |
| R6 | LLM-judge non-determinism in gray band | Bound the gray band tightly; cache judge responses keyed on (extracted, expected) pair within a single session; document non-determinism in README | nuanced-match slice |
| R7 | IndexedDB quota on heavy batch use | Quota check before batch; offer "export and clear" before quota fills; document in README | history slice |
| R8 | Browser-side Web Worker pool stalls if tab closes | Document as a known limitation; suggest "keep tab open during batch"; per-label results write to IndexedDB as they complete (so partial batches survive) | batch slice |
| R9 | Provider catalog drift in OpenRouter | Pin model name versions in env; document upgrade procedure | observability slice |
| R10 | TTB rules update during product lifetime | `rulesVersion` field on every review record; explicit "designed strictly to today's rules" assumption in README; refactor when 237/238 finalize | docs |

---

## 13. Vertical-slice candidates (input to Phase 3 `to-issues`)

These are slice candidates only — `to-issues` skill cuts the actual issue
files. Each slice must end demoable.

1. **Slice 1 — Project scaffold + dev loop**
   - Next.js 16 app, Tailwind v4, shadcn/ui base, TypeScript strict,
     Vitest + Playwright wired, Vercel preview URL deploys.
   - Demoable end: blank app at a URL with `/health` and `/about`.
   - R-IDs: foundation.

2. **Slice 2 — Single-label happy path (vertical tracer bullet)**
   - Upload one image, manual expected-data form, call
     `/api/extract-label` (calls Haiku via OpenRouter only — no Tesseract,
     no verification logic yet), display extracted JSON.
   - Demoable end: upload a label, see extracted fields on screen.
   - R-IDs: R-001 (partial), R-004 (manual entry only), R-006 (LLM only).

3. **Slice 3 — Tesseract ground truth + bboxes**
   - Add Tesseract.js to `/api/extract-label`. Run in parallel with Haiku.
     Return word-bboxes. Locate evidenceQuote → bbox. Render bbox overlay
     on image preview in detail screen.
   - Demoable end: upload a label, see field with click-to-highlight bbox.
   - R-IDs: R-006, R-013.

4. **Slice 4 — Verification pipeline + 8-state status enum**
   - Strict matchers (gov-warning + ABV + net-contents). Nuanced ladder.
     Status engine. Templated explanations. CI mutation fuzz on
     gov-warning.
   - Demoable end: load demo data scenario 1, see Pass overall; demo
     scenario 4 (gov-warning capitalization), see strict Fail with
     explanation and bbox highlight on the warning paragraph.
   - R-IDs: R-007, R-008, R-009, R-010.

5. **Slice 5 — Beverage-aware rules + image-quality detection**
   - Beverage selector. Per-type field-rule table. "Other" route.
     Image-quality heuristics (Laplacian variance for blur, histogram
     analysis for exposure). Quality flags override status.
   - Demoable end: scenario 6 (glare/blur) → Manual Review +
     "Request Better Image"; spirits vs wine vs beer routes correctly.
   - R-IDs: R-005, R-011.

6. **Slice 6 — Human override + final decision + IndexedDB persistence**
   - Override controls per field (status + reason). Final decision UI
     (Approve / Reject / Manual Review / Request Better Image). Save to
     IndexedDB. History screen with reopen.
   - Demoable end: review a label, override a field, save final
     decision, see in history.
   - R-IDs: R-012, R-014.

7. **Slice 7 — Live camera capture**
   - `getUserMedia` wrapper. Rear-cam preference. Capture preview +
     retake gate. Browser-side preprocessing pipeline. Same downstream
     verification.
   - Demoable end: phone or desktop webcam → snap label → verify.
   - R-IDs: R-003.

8. **Slice 8 — Batch flow with Web Worker pool**
   - Multi-file upload. Paired CSV/JSON import (filename pairing).
     Web Worker pool of 10. Per-file progress. Filterable result table.
     Soft-warn at 50, hard cap at 250. Retry failed.
   - Demoable end: drop 30 files + paired CSV, see queue → results
     populating live, filter to "needs review".
   - R-IDs: R-002, R-004 (CSV/JSON), R-017.

9. **Slice 9 — Exports**
   - PDF (`@react-pdf/renderer` server-side); CSV (`papaparse`); JSON;
     batch ZIP (`archiver`).
   - Demoable end: one-click export of single review (PDF + JSON);
     batch export ZIP.
   - R-IDs: R-015.

10. **Slice 10 — Demo data bundle + polish pass**
    - 7 demo scenarios bundled (paired image + JSON). One-click "Load
      demo data" buttons. Empty/loading/error state pass.
    - Demoable end: every PRD demo scenario reproducible from one click.
    - R-IDs: R-016, R-020.

11. **Slice 11 — Accessibility + restricted-network posture + docs**
    - A11y pass (keyboard, ARIA, contrast). `/settings` provider
      allow-list. README + setup + run + deploy + everything else from
      R-019.
    - Demoable end: keyboard-only flow works; README walks a fresh
      user through deploy.
    - R-IDs: R-018, R-019, R-022.

12. **Slice 12 — Eval phase (Phase 7 work, but slice-shaped here)**
    - Build the golden set (≥ 30 labels). Wire Langfuse for offline
      scoring. Run end-to-end eval. Tune for failure cases.
    - Demoable end: `eval-results.md` with verdict accuracy ≥ 95%,
      gov-warning recall 100%, latency p50 ≤ 5s.
    - R-IDs: R-017 (verification of), R-009 (verification of).

13. **Slice 13 — Deploy + smoke-test**
    - Vercel Hobby production deploy. Smoke-test eval against live URL.
      DNS / domain wiring (`.vercel.app` default; user can swap to
      custom).
    - Demoable end: live URL responds; full single + batch flow works
      against production.
    - R-IDs: R-021.

**Estimated effort:** 13 slices, ~2-4 hours each (some larger). Slices
2, 3, 4 are the riskiest (the AI + verification core); slices 7, 8 are
the showcase moments; slices 11, 12, 13 are the polish/ship runway.

---

## 14. Scope tiers

### Must-have (the polished product per alignment)
R-001 through R-022.

### Should-have (small polish, can be cut if a slice runs over)
- Provider allow-list UI (R-022 can degrade to env-var-only config)
- Optional LLM-narrative explanation on Manual-Review rows (R-007)
- Real-time batch result filter while running (vs after-batch only)

### Cut-if-behind (not in alignment, do not build)
- Cross-device sync (explicitly out per IT note)
- Real auth (explicitly out per Phase 2 pivot)
- Stored original images (explicitly out per Phase 2 pivot)
- Bbox highlights for Manual-Review-only fields (acceptable to omit)

---

## 15. R-ID phase coverage map

| R-ID | Slice(s) | Phase | Priority | Status |
|---|---|---|---|---|
| R-001 | 2, 4, 6 | 5 | Must | Pending |
| R-002 | 8 | 5 | Must | Pending |
| R-003 | 7 | 5 | Must | Pending |
| R-004 | 2, 8 | 5 | Must | Pending |
| R-005 | 5 | 5 | Must | Pending |
| R-006 | 2, 3 | 5 | Must | Pending |
| R-007 | 4 | 5 | Must | Pending |
| R-008 | 4 | 5 | Must | Pending |
| R-009 | 4 | 5 | Must | Pending |
| R-010 | 4 | 5 | Must | Pending |
| R-011 | 5 | 5 | Must | Pending |
| R-012 | 6 | 5 | Must | Pending |
| R-013 | 3 | 5 | Must | Pending |
| R-014 | 6 | 5 | Must | Pending |
| R-015 | 9 | 5 | Must | Pending |
| R-016 | 10 | 5 | Must | Pending |
| R-017 | 8, 12 | 5+7 | Must | Pending |
| R-018 | 11 | 5 | Must | Pending |
| R-019 | 11 | 5 | Must | Pending |
| R-020 | 10 | 5 | Must | Pending |
| R-021 | 13 | 9 | Must | Pending |
| R-022 | 11 | 5 | Must | Pending |

Every R-ID is assigned. No gaps.

---

## 16. Open items (architecture-during-build, intentionally deferred)

These are small enough to lock at slice-implementation time, not
upfront:

- Concrete IndexedDB key naming + index design (slice 6).
- Concrete Zod schema layouts for ApplicationData / ExtractedLabelData
  (slice 2).
- Image-quality heuristic thresholds (Laplacian σ, exposure histogram
  bins) — tune during slice 5 against demo data.
- Tesseract worker init strategy (slice 3) — pre-warm vs lazy.
- Camera capture quirks per device discovered during slice 7 testing.
- Stitch MCP not used; if a UI slice runs into design questions, agent
  iterates with the user via screenshot reviews at slice boundaries.

---

## 17. Status

**LOCKED** — pending Phase 3.5 final review. After `to-issues` writes
the slice files, return here for the recap question:
"Anything missed before we start building?"
