# Research: proofLens

> Output of conductor Phase 1 — Loop 0 (autonomous web research). Synthesizes
> the work of four parallel research agents into a single brief. Agent
> deep-dives live in `research-findings/`. This is the source-of-truth
> input to Phase 2 (architecture decisions) and Phase 7 (eval design).
>
> Compiled: 2026-04-30. Mode: `greenfield` (regulated/compliance project).

---

## TL;DR

**Stack (recommended, pending Phase 2 confirmation):**
Next.js 16 (App Router) + TypeScript strict + shadcn/ui + Tailwind v4 +
Drizzle ORM + Neon Postgres + Better Auth (with `anonymous` plugin) +
Cloudflare R2 (opt-in image retention) + Inngest (batch processing) +
Helicone (LLM proxy) + Langfuse (eval traces) + Vercel Pro (Fluid compute).

**AI extraction strategy:**
Claude Haiku 4.5 (vision) **in parallel with** AWS Textract on every label.
Textract is the ground-truth string source for the strict gov-warning check
(vision-LLMs silently normalize capitalization, which would break our
100%-recall requirement). Sonnet 4.6 fallback re-runs the ~20% of labels
with low-confidence fields. Estimated **$0.010 blended per label** (6.3×
under our $0.05 ceiling) and **p50 ~3.8s / p95 ~7.0s** end-to-end (inside
our 5s/8s targets).

**Verification:**
Hybrid deterministic-first. Strict fields (gov-warning, prefix capitalization,
ABV numeric, net-contents) are pure code with a CI mutation fuzz harness for
100% recall. Nuanced fields run a typed match-ladder; an LLM-judge runs only
inside a 0.78–0.92 similarity gray band, never on strict checks. Templated
rule-sourced explanations are the audit-of-record; LLM narrative is a labeled
secondary on manual-review rows only.

**Critical regulatory finding:**
There is **no fourth "Other / Unknown" TTB regulatory category**. Products fall
into Part 4 (wine), Part 5 (spirits), or Part 7 (malt) by composition. Our
alignment included an "Other / Unknown" UI option — that needs to be
re-scoped in Phase 2 (proposal: route "other" to manual-review-only with
universal-fields check, not its own ruleset).

**Forward-looking risk:**
TTB Notices 237 (Alcohol Facts panel) and 238 (Major Food Allergen labeling)
were published Jan 2025; comment period closed Aug 2025; not yet final. Once
final, ABV becomes mandatory for *all* beverages and a new disclosure panel
is required, with a 5-year compliance window. proofLens should leave
architectural room — extensible field schema — without strict-failing labels
that lack these today.

---

## 1. TTB Regulatory Findings (`01-ttb-regulatory.md`)

### 1.1 Canonical government warning text — § 16.21 (verbatim)

```
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not
drink alcoholic beverages during pregnancy because of the risk of birth
defects. (2) Consumption of alcoholic beverages impairs your ability to
drive a car or operate machinery, and may cause health problems.
```

- Two commas: after `Surgeon General` and after `or operate machinery`. No
  Oxford comma. US spelling.
- Single ASCII space after the prefix colon and between sentences.
- Prefix `GOVERNMENT WARNING:` must be **all-caps and bold** (§ 16.22(a)(2));
  rest of warning may not be bold.
- Type-size minimums: **1mm** (≤ 237 mL container), **2mm** (> 237 mL to 3 L),
  **3mm** (> 3 L).
- **No approved variation** — the regulation prescribes one string.

> This is the constant we hard-code. The gov-warning matcher does NFKC
> normalize → smart-quote/dash → markdown-strip → whitespace-collapse, then
> exact byte-equal compare against this constant. The prefix check is a
> separate strict comparison against `GOVERNMENT WARNING:`.

### 1.2 Per-beverage mandatory fields

| Field | Beer (Part 7) | Wine (Part 4) | Spirits (Part 5) |
|---|---|---|---|
| Brand name | Required | Required | Required |
| Class / type | Required | Required | Required |
| Name & address | Required | Required | Required |
| Net contents | Required (US customary; metric optional) | Required (mL/L; standards of fill) | Required (mL/L; standards of fill) |
| ABV | Only when added flavors contribute alcohol (§ 7.65) | Required > 14% ABV; optional ≤ 14% if "table"/"light" (§ 4.36) | **Always required** in same field of vision as brand + class (§ 5.63) |
| Country of origin | If imported | If imported | If imported |
| § 16.21 health warning | Required | Required | Required |
| Sulfite declaration (≥10 ppm SO₂) | If applicable | If applicable | If applicable |
| FD&C Yellow No. 5 | If applicable | If applicable | If applicable |
| Cochineal / carmine | If applicable | If applicable | If applicable |
| Aspartame: `PHENYLKETONURICS: CONTAINS PHENYLALANINE.` (strict caps) | If applicable | If applicable | If applicable |

**There is no fourth regulatory category.** Composition determines Part 4 / 5 / 7.

### 1.3 ABV / proof rules

- Acceptable ABV formats (per §§ 4.36, 5.65, 7.65):
  - `Alcohol __ percent by volume`
  - `__ percent alcohol by volume`
  - `Alcohol by volume __ percent`
- Accepted equivalencies: `%` ≡ `percent`, `/` ≡ `by`, `alc` ≡ `alcohol`,
  `vol` ≡ `volume`.
- Tolerances:
  - **± 0.3 percentage points** (spirits, malt)
  - **± 1.0 / ± 1.5 percentage points** (wine, depending on class)
- Proof is **spirits-only and optional** (proof = 2 × ABV).

### 1.4 Standards of fill (recently updated — T.D. TTB-200, Jan 2025)

- **Spirits (§ 5.203):** 25 authorized sizes including new entries 700 mL,
  720 mL, 945 mL, 1.8 L, 2 L, 3 L, 3.75 L, and 355 mL (canned).
- **Wine (§ 4.72):** updated list now includes 355 mL.
- **Malt beverages (§ 7.70):** no fixed list — US customary unit rules with
  metric optional and additive only.

### 1.5 Forward-looking — TTB Notices 237 & 238

- Published 2025-01-17. Comment period closed 2025-08-15. **Not yet final.**
- Once final: ABV becomes mandatory for all beverages; an "Alcohol Facts"
  panel + 9-allergen disclosure required; 5-year compliance window.
- **proofLens posture:** do not strict-fail labels missing these today.
  Leave architectural room (extensible field schema, beverage-version pin
  on each review record).

---

## 2. AI Vision / OCR Strategy (`02-ai-vision-ocr.md`)

### 2.1 Primary model selection

| Provider | Model | Why chosen | $/1M in / out | TTFT / throughput |
|---|---|---|---|---|
| Anthropic | Claude Haiku 4.5 (vision) | Best-in-class cost + speed; reliable strict tool-use schemas; prompt caching | $1 / $5 | 0.56s / 91-98 t/s |
| Anthropic | Claude Sonnet 4.6 | Fallback for low-confidence fields (~20% of labels) | $3 / $15 | — |
| AWS | Textract `Detect Document Text` | **Ground-truth string source for gov-warning** (LLMs normalize caps) | ~$0.0015 / page | — |

### 2.2 Tiered routing

```
   ┌───────────────────────────┐
   │ Preprocessing (sharp on   │
   │ server, browser canvas    │
   │ pre-upload if camera)     │
   └──────────────┬────────────┘
                  ▼
   ┌──────────────┴────────────┐
   │   PARALLEL (every label)  │
   ├──────────────┬────────────┤
   │ Haiku 4.5    │ Textract   │
   │ vision       │ DDT        │
   │ → fields +   │ → raw text │
   │   confidence │   (truth)  │
   └──────────────┴────────────┘
                  │
                  ▼
   ┌───────────────────────────┐
   │ Field-level merge:        │
   │  - Haiku → fields         │
   │  - Textract → gov-warning │
   │    text + raw_text        │
   └──────────────┬────────────┘
                  ▼
   ┌───────────────────────────┐
   │ Confidence gate (~20%):   │
   │ if any field low/medium → │
   │ Sonnet 4.6 with OCR text  │
   │ injected as context       │
   └──────────────┬────────────┘
                  ▼
        Verification pipeline
```

### 2.3 Cost & latency forecast

- **Cost / label:** ~$0.010 blended (Haiku $0.0040 + 20% × Sonnet $0.012 +
  Textract $0.0015 + cross-check overhead). 6.3× under $0.05 ceiling.
- **Latency:** p50 ~3.8s; p95 ~7.0s. Both inside 5s/8s targets.

### 2.4 Risks & mitigations

| Risk | Mitigation |
|---|---|
| Vision-LLM silently normalizes `GOVERNMENT WARNING:` capitalization | Textract is ground-truth for the strict check; LLM only locates the paragraph |
| Anthropic structured-output reliability under-performs on real label data | Drop-in fallback: Gemini 2.5 Flash (~5× cheaper, first-class bounding boxes, `responseSchema` enforcement) |
| Hallucinated extracted values | Force JSON schema with `null` for not-visible; require bbox citation per field; cross-check against Textract raw text |
| Camera capture quality (glare, perspective, focus on phones) | Browser-side canvas resize + EXIF rotation pre-upload; image-quality detection signals → "Request Better Image" |

### 2.5 Bbox / evidence highlighting

- **Textract** returns per-block bounding polygons → reliable evidence
  highlighting for the gov-warning text region.
- **Haiku 4.5** does not natively return bbox per field; we ask for
  per-field `evidenceQuote` (the source string) and locate it in Textract's
  text+geometry to derive bbox.
- **If Anthropic primary swaps to Gemini 2.5 Flash:** bbox is native per
  field — simpler highlighting.

---

## 3. Verification Logic (`03-verification-logic.md`)

### 3.1 Pattern: hybrid deterministic-first

- Every field flows through a typed `RuleOutcome` ladder.
- **Strict fields** (gov-warning text + prefix caps, ABV numeric, net-contents
  numeric+unit) cannot reach the LLM-judge layer at all.
- **Nuanced fields** (brand, class/type, bottler name) get the deterministic
  ladder; LLM-judge fires **only** in a configured 0.78–0.92 similarity
  "gray band".

### 3.2 Government-warning matcher (3 layers)

1. **Prefix check** — case-sensitive `GOVERNMENT WARNING:` exact match.
2. **Body normalization + diff** — NFKC normalize → smart-quote/dash collapse
   → Markdown strip → whitespace collapse → exact compare to canonical
   constant.
3. **Damerau-Levenshtein near-miss diagnostic** — for "warning is present
   but altered" diagnostics that surface in the explanation.
- **Backstop:** CI mutation fuzz harness mutates the canonical string in
  every meaningful way (caps drop, comma drop, semicolon swap, word
  substitution); the matcher must reject every mutation. Test failure =
  build failure.

### 3.3 Library picks

| Concern | Library | Why |
|---|---|---|
| Fuzzy matching (rapidfuzz-style) | `fuzzball` | Token-set / partial / ratio for nuanced ladder |
| Raw Levenshtein distance | `fastest-levenshtein` | Gov-warning near-miss diagnostic |
| Volume-unit conversion | `convert-units` | mL ↔ L ↔ cL ↔ fl oz with 0.1% tolerance |
| Unicode normalization | native `String.normalize("NFKC")` | No external dep needed |
| Markdown strip (defensive) | `remove-markdown` | OCR sometimes returns bold |
| Schema typing | `zod` | RuleOutcome / FieldResult / judge response |
| Property-based tests | `fast-check` + `vitest` | Mutation fuzz, equivalency-class tests |
| Optional LLM-judge regression | `promptfoo` | Eval-phase tooling |
| ABV / proof parsing | hand-rolled regex | No library fits the equivalency rules |

### 3.4 Confidence → status mapping

A 2-D matrix on `(matchStrength, aiConfidence)` produces the 8-state status
enum (Pass / Likely Match / Warning / Fail / Missing / Low Confidence /
Needs Manual Review / Not Required). Strict-field cells collapse to
`{Pass, Fail, Missing, Low Confidence}` — no `Likely Match` on a strict
check. Image-quality signals override any non-Pass cell to
`Needs Manual Review` with `Request Better Image`.

### 3.5 Explanation strategy

- **Templated, rule-sourced** explanations are the audit-of-record. Every
  rung emits a typed `RuleOutcome`; a small template registry renders the
  user-facing prose deterministically.
- **LLM-generated narrative** allowed **only** as a labeled secondary
  `narrativeExplanation` on `Needs Manual Review` rows. Clearly distinct
  from the audit-of-record explanation.

---

## 4. Architecture & Infra (`04-architecture-infra.md`)

### 4.1 Recommended stack at a glance

| Layer | Choice | Alternative | Reason |
|---|---|---|---|
| Framework | Next.js 16 (App Router) | — | Forge default; RSC + Server Actions match our flows |
| Language | TypeScript (strict) | — | Forge default |
| UI components | shadcn/ui + Tailwind v4 | — | Forge default |
| Database | **Neon Postgres** (Vercel Marketplace) | Supabase, Vercel Postgres, Railway PG | Scale-to-zero (~500 ms cold start), branching per PR, native serverless pooler |
| ORM | **Drizzle** | Prisma, Kysely | ~33 KB, edge-native, SQL migrations, Better Auth adapter |
| Auth | **Better Auth** + `anonymous` plugin | Clerk, Auth.js, Lucia | Purpose-built `onLinkAccount` callback for guest → real-account migration; OSS, MIT, Drizzle-native |
| Object storage (opt-in) | **Cloudflare R2** | Vercel Blob, S3, Supabase | Zero egress; signed PUT URLs let client upload direct to R2 (bypasses Vercel function limits) |
| Batch processing | **Inngest** | Trigger.dev, QStash | `step.parallel()` + `concurrency: { limit: 10, key: userId }` matches our 250/10 rule; `inngest.realtime()` → SSE for progress |
| LLM proxy / cost telemetry | **Helicone** | LangSmith | One-line `baseURL` swap on the AI SDK; per-call cost/latency/tokens at zero markup |
| LLM eval / golden-set | **Langfuse Cloud** | Braintrust | Holds golden-set traces; runs offline evals during Phase 7 |
| Rate-limit / circuit-breaker | `bottleneck` + custom CB | — | Per-provider buckets |
| Image preprocessing | `sharp` (server) + Canvas/Web Worker (browser) | — | EXIF rotation, resize, JPEG quality |
| Live camera capture | Custom thin wrapper around `getUserMedia` + `enumerateDevices` | — | iOS Safari `facingMode` quirks; explicit retake gate |
| PDF export | `@react-pdf/renderer` | `pdf-lib`, Puppeteer | Server-side; React-component-based; clean for templated reports |
| CSV | `papaparse` | — | De-facto standard |
| ZIP (batch export) | `archiver` (streaming) | JSZip | Stream-based avoids OOM on 250-file ZIPs |
| Testing | Vitest + RTL + fast-check + Playwright + MSW | — | Unit + property + E2E + network mock |
| Deployment | **Vercel Pro (Fluid compute)** | Railway | Single-label hot path is 5–8s (well under Fluid's 300s cap); long compute is in Inngest; Marketplace-provisioned Neon; preview URLs per PR |

### 4.2 Data-flow (single-label happy path)

```
                 Client (browser, mobile or desktop)
   ┌───────────┬────────────┬──────────────────────┐
   │ Upload    │ Camera     │ Batch CSV+files      │
   │ <input>   │ getUserMedia│ <multi-file dropzone>│
   └─────┬─────┴──────┬─────┴─────────┬────────────┘
         │            │               │
         │  client-side preprocessing (Canvas / Web Worker:
         │  EXIF rotate, resize ≤ 1568px, JPEG q 85)
         │            │               │
         ▼            ▼               ▼
   ┌──────────────────────────────────────────────┐
   │ Next.js Server Action (single)               │
   │   or Route Handler (batch via Inngest)       │
   └────────────┬─────────────────────────────────┘
                │
                ├── ephemeral image in memory
                │
                ▼
   ┌──────────────────────────────────────────────┐
   │ PARALLEL extraction                          │
   │   Haiku 4.5 (via Helicone) ← AI SDK          │
   │   AWS Textract DDT                           │
   └────────────┬─────────────────────────────────┘
                │
                ▼
   ┌──────────────────────────────────────────────┐
   │ Verification pipeline                        │
   │   strict matchers (gov warning, ABV, ...)    │
   │   nuanced ladder (brand, class, ...)         │
   │   LLM-judge (gray band only)                 │
   │   → FieldResult[] + overall                  │
   └────────────┬─────────────────────────────────┘
                │
                ├── persist: thumbnail (256px) +
                │   FieldResult[] + extracted +
                │   raw_text + bbox + decision +
                │   reviewer_id (or guest session)
                │       → Neon (via Drizzle)
                │
                ├── if opt-in retain: signed PUT URL
                │       → Cloudflare R2
                │
                ▼
        Streamed response to client (RSC / SSE)
```

### 4.3 Vercel-vs-Railway — explicit recommendation

**Vercel Pro with Fluid compute, not Railway.** Deciding factors for *this*
workload:

- Hot path is 5–8s — well under Fluid compute's 300s default duration cap.
  Long-running compute (batch fan-out) is outsourced to Inngest, so
  Railway's "always-on container" advantage doesn't apply.
- Marketplace-provisioned Neon = single-pane billing + no manual connection
  string juggling.
- Preview URLs per PR are valuable for the iterative slice-by-slice build.
- Native Next.js posture; no `next.config` workarounds.

If a future requirement demands long-running in-process compute (model
self-hosting, streaming preprocessing > 5 min), Railway becomes the better
home.

### 4.4 Restricted-network posture

Configurable provider allow-list (Helicone, Anthropic, AWS Textract,
Cloudflare R2, Inngest, Langfuse) surfaced in `/settings`. App displays
which providers are reachable; missing providers degrade gracefully:

- Textract unreachable → fall back to vision-only extraction with a banner
  warning that gov-warning checking has reduced confidence.
- R2 unreachable → opt-in retention silently disabled with a banner.
- Helicone unreachable → bypass to direct provider URLs (cost/latency
  telemetry pauses).

---

## 5. Open Decisions for Phase 2 (Architecture)

These are the points that need explicit user confirmation before
`PRESEARCH.md` is written and locked.

| # | Decision | Recommendation | Why it needs confirmation |
|---|---|---|---|
| A | AI provider primary | Claude Haiku 4.5 + Sonnet fallback + Textract sidecar | Locks vendor + cost model |
| B | AI fallback path | Gemini 2.5 Flash if Anthropic structured-output fails eval | Whether to wire dual-provider abstraction now or later |
| C | Auth library | Better Auth + `anonymous` plugin | Newer; less battle-tested than Clerk — trade Clerk's MAU pricing for OSS + clean guest flow |
| D | Deployment target | Vercel Pro + Fluid compute | Confirms paid plan acceptable; Railway is the alternative |
| E | "Other / Unknown" beverage handling | Route to manual-review-only with universal-fields check | Was a Phase 0 alignment item; no regulatory category exists for it |
| F | Forward-looking schema (TTB Notices 237/238) | Extensible field schema with `beverage_rules_version` pin per review | Scope decision: design space for future panels yes/no |
| G | Observability split | Helicone (proxy) + Langfuse Cloud (eval traces) | Two-tool overhead vs one; alternatives: LangSmith, Braintrust, or Langfuse alone |
| H | UI design approach | TBD in Phase 2 §2.5.1 | shadcn defaults + manual iteration vs Stitch MCP generation vs hybrid |
| I | LLM-judge in production | Allowed only inside 0.78–0.92 gray band, never on strict fields | Confirms determinism stance |
| J | Bbox source | Textract polygons; derive Haiku field bbox by locating evidenceQuote in Textract geometry | If Gemini becomes primary, switch to native per-field bbox |

---

## 6. Open Items Genuinely Deferred

- Concrete CSV/JSON import schema column layout (Phase 2 architecture).
- Eval golden-set composition (Phase 7 — needs the demo labels first).
- Database schema (Phase 2 architecture, after Drizzle + Better Auth confirmed).
- API surface design for batch progress streaming (Phase 2 architecture).

---

## 7. Source Files

- `research-findings/01-ttb-regulatory.md` — 41 KB, 610 lines. eCFR primary
  citations, per-beverage rule tables, format equivalency rules,
  standards of fill, forward-looking notices.
- `research-findings/02-ai-vision-ocr.md` — 26 KB. Provider comparison
  tables, tiered-routing diagram, cost forecast, hallucination mitigations,
  bbox availability matrix.
- `research-findings/03-verification-logic.md` — 41 KB, 833 lines.
  Q-blocks, ASCII data-flow, library/dependency matrix, risk/mitigation
  table, mutation fuzz test design.
- `research-findings/04-architecture-infra.md` — 48 KB. Per-question
  comparison tables, recommended stack summary, ASCII data-flow including
  R2 retention path, Vercel-vs-Railway decision factors.
