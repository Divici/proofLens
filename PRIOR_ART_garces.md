# Prior Art: SebastianGarces/alcohol-label

> Reference notes on a prior solution to the same TTB alcohol-label verification problem.
> Source repo: https://github.com/SebastianGarces/alcohol-label
> Live demo: https://alcohol-label.vercel.app/
> Compiled: 2026-04-29 from public README, APPROACH.md, PRODUCT.md, DESIGN.md, presearch.md, and the visible folder structure (no clone, no fork).
> This file is intentionally untracked — it is internal study material, not project documentation.

---

## TL;DR

A take-home prototype that compares alcohol label artwork to TTB application data with a stateless Next.js + Vercel app. The novel technical choices: (1) **VLM-only extraction** (no OCR), (2) **tiered model routing** — Claude Haiku 4.5 for bulk field extraction, Claude Sonnet 4.5 for the government warning and per-field escalation when confidence < 0.7, (3) **deterministic verdict** — the LLM never decides PASS/FAIL; a typed matching ladder in `lib/match` does, and (4) **exact-match canonical comparison** for the government warning text against `27 CFR 16.21`, never delegated to an LLM. Their reported eval: 28/29 (96.6%) verdict accuracy, p50 ~4s, ~$0.014/label. Total $4.64 OpenRouter spend across the entire build.

---

## 1. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node 22 + Bun | Bun for install + scripts; Vercel default for runtime |
| Framework | Next.js 16 (App Router) | Server Actions for single label, API route for batch |
| Language | TypeScript (strict) | Zod schemas at every cross-module boundary |
| UI | shadcn/ui + Tailwind v4 + base-ui | Custom design tokens layered on top |
| Forms | react-hook-form + Zod | Single Zod schema feeds form, server, validation |
| LLM gateway | OpenRouter via `openai` SDK | Provider-pinned to Anthropic; one SDK swaps models |
| Models | Claude Haiku 4.5 + Sonnet 4.5 | Tiered (see §3) |
| Image preprocessing | `sharp` | rotate (EXIF) → resize 1568px → JPEG q85 |
| Async/cache | @tanstack/react-query v5 | Single-call caching for single-label flow |
| Browser persistence | IndexedDB | Per-field rejection-explanation cache (I7); no server DB |
| CSV / diff | papaparse + diff | Batch CSV in/out + warning red-line view |
| Errors | Sentry (Next.js wizard) | Source-mapped server traces |
| Lint/format/test | Biome + Vitest | Single tool for lint+format; Vitest for fast unit tests |
| Deploy | Vercel Hobby | Lives within 10s function + 4.5MB body limits |

**Deliberately rejected:** Postgres / Redis / SQLite (stateless server is the entire deployment story), dedicated OCR (Vision/Textract/PaddleOCR — VLM is OCR + reasoning in one call), Cloudinary for image processing (sharp's 4 lines do it), auth (out of scope), e2e tests (deployed prototype is the runtime check).

---

## 2. Architecture

```
┌─────────┐   ┌──────────────────────┐   ┌────────────┐   ┌──────────────────┐
│ Browser │   │ Next.js (Vercel)     │   │ OpenRouter │   │ Anthropic Claude │
│         │──▶│ Server Action        │──▶│ /chat/     │──▶│ Haiku 4.5        │
│ shadcn  │   │ /api/verify-one      │   │ completions│   │ Sonnet 4.5       │
│ RHF+Zod │   │  lib/verifier ──┐    │   └────────────┘   └──────────────────┘
│ IDB     │   │  lib/match    ──┤    │           ▲                    ▲
└─────────┘   │  lib/vlm     ───┘    │           │ tool-use           │ ephemeral
              │  sharp resize 1568px │           │ structured output  │ prompt cache
              └──────────────────────┘           └────────────────────┘
```

- **Single-label** path: React Server Action (`app/actions.ts → verifyLabel`).
- **Batch** path: client orchestrates `POST /api/verify-one` with **concurrency 6**.
- **Verifier core**: field extraction (Haiku) + warning extraction (Sonnet) run in `Promise.all`; deterministic matching ladder runs synchronously after.
- **No database.** Server is pure functions; batch state lives in client memory and IndexedDB.
- **Server-side rate limit**: in-memory per-IP (acknowledged as prototype-only).

### Project layout

```
app/                       # routes, Server Action, API
  actions.ts               # verifyLabel server action
  api/
    verify-one/            # POST endpoint used by batch loop
    warm/                  # warm-up endpoint (likely cold-start mitigation)
    sentry-example-api/
  about/, batch/           # extra routes
  layout.tsx, page.tsx, global-error.tsx, globals.css
components/
  result/                  # FieldRow, WarningRedline, ExplainRejection, TelemetryFooter, TieredRoutingNote
  batch/                   # ProgressHeader + queue UI
  upload/                  # dropzone
  verifier/                # form composition
  layout/                  # nav, shell
  ui/                      # shadcn primitives
lib/
  verifier/                # index.ts (orchestration), cache.ts, tiered-summary.ts
  vlm/                     # call.ts, client.ts, escalate.ts, explain.ts, extract.ts,
                           # image.ts, models.ts, pricing.ts, tiebreak.ts, warning.ts
  match/                   # field.ts, jaro-winkler.ts, normalize.ts, warning.ts, index.ts
  canonical/               # government-warning.ts (27 CFR 16.21 verbatim)
  schema/                  # Zod: Application, LabelExtract, Result, Batch
  rate-limit/              # in-memory IP rate limiter
  storage/                 # IndexedDB wrapper (rejection-explanation cache)
  batch/                   # CSV parse + queue runner + keyboard nav helpers
  upload/                  # upload helpers
  utils.ts
public/samples/            # 5 demo single labels + samples.json + batch/ (24 labels)
scripts/                   # generate-samples.ts, generate-batch.ts (SVG-rendered demo data)
eval/                      # eval harness; bun run eval / eval:compare / eval:dry
dev-docs/                  # original brief + research + screenshots
```

Notable design choice: keep `lib/` separated by **concern** (extract / match / canonical / schema), not by **layer** (controllers / models / services). Each subfolder has its own `__tests__/`.

---

## 3. AI strategy — tiered model routing

```
                    ┌─── Haiku 4.5: extract all fields (parallel)  ──┐
Server Action / API ┤                                                 ├─▶ verify + match (deterministic)
                    └─── Sonnet 4.5: extract gov. warning (parallel) ─┘

For each field with confidence < 0.7:
   ─▶ Sonnet 4.5: re-extract that single field
       (merged into result; field marked `escalated=true`)

For fuzzy match in [0.85, 0.95):
   ─▶ Sonnet 4.5: tiebreak that pair (LLM verdict drives result, marked `method: llm_tiebreak`)

On user click "Why did this fail?":
   ─▶ Sonnet 4.5: explain a specific rejection (cached in IndexedDB)
```

**Why the split:**
- **Haiku for the bulk read.** ~1.5–2.5s, cheap, accurate on clean labels. Structured tool-use returns reliable JSON.
- **Sonnet for the warning.** Highest-stakes output; better faithful long-text transcription.
- **Parallel calls** because field-extract and warning-extract share no state — `Promise.all` turns 7s sequential into ~4s.
- **Per-field escalation, not whole-label.** A "Reviewed by Sonnet" badge surfaces the routing.

**Reliability disciplines (all in `lib/vlm`):**
- Hard `AbortController` timeout **4.5s per VLM call** (5s p95 end-to-end budget).
- One retry on 429/5xx with `(200ms, 800ms)` backoff. No retry on 401.
- Provider pin: `provider: { order: ['anthropic'], allow_fallbacks: false }` so we don't get re-routed to a vendor that breaks tool-call shape or vision.
- Anthropic ephemeral prompt caching (`cache_control: ephemeral`) on the system prompt, verified via `cached_tokens` in the OpenRouter dashboard.

**Prompt-injection defense (architectural, not heuristic):**
- The VLM extracts; the server compares.
- The model **never sees both the application data and the label image in one call** — it can't be social-engineered into "deciding" the result.
- Prompts ask for facts ("what is the brand name?"), never judgments ("does this label pass?").
- Verdict is computed deterministically in `lib/match/`.

---

## 4. Verifier algorithm

### 4.1 Field matching ladder

For each field in `Application` (filtered by `beverageType`):

1. Find corresponding `LabelExtract` field.
2. **Normalize both:** NFKC → trim → collapse whitespace → smart-quotes → straight quotes → lowercase.
3. If equal → `MATCH (method: exact)`.
4. Else compute Jaro-Winkler similarity:
   - `≥ 0.95` → `MATCH (method: normalized)` — handles `STONE'S THROW` ≡ `Stone's Throw`.
   - `[0.85, 0.95)` → call Sonnet for an LLM tiebreak; LLM verdict wins, marked `method: llm_tiebreak`.
   - `< 0.85` → `MISMATCH` with character-level diff.
5. **Field-specific overrides:**
   - **ABV:** parse to numeric, compare to one decimal place; `45%` ≡ `45.0% alc/vol` ≡ `45 percent`.
   - **Net contents:** parse `750 mL` / `750ml` / `750 ML` / `750 milliliters` to canonical mL.
   - **Addresses:** join multi-line, normalize separators, token-set ratio ≥ 0.9.
6. **Wine 14% rule:** if labeled and application ABV cross 14%, FAIL with code `wine_14pp_rule` regardless of similarity (27 CFR Part 4 calls these out as different classes).

### 4.2 Government warning — two-prong exact verification

The warning is **not judged by the LLM**:

1. VLM extracts `fullText`, `headerIsAllCaps`, `headerAppearsBold` (structural flags).
2. Server normalizes whitespace and drops `(1)` / `(2)` paragraph markers.
3. **Exact equality** against canonical text in `lib/canonical/government-warning.ts` (verbatim from 27 CFR 16.21).
4. PASS iff **all three**: text equal AND `headerIsAllCaps` AND `headerAppearsBold`.
5. Failures populate a typed `WarningFailure[]` for the side-by-side `<ins>`/`<del>` red-line view.

Quote from APPROACH.md: *"The TTB rejects applications over missing commas in the warning. An LLM that 'reads the warning and decides if it's compliant' is one prompt drift away from a real-world compliance miss."*

### 4.3 Bottler ↔ importer category-swap detection (I13)

A second pass after `runFieldChecks`. For any field that came back `missing` while the application carried a value, check the **partner slot** (`bottlerName ↔ importerName`, `bottlerAddress ↔ importerAddress`) on the label extract. If the application's value matches the partner's label value (Jaro-Winkler ≥ 0.85 for names, token-set ≥ 0.9 for addresses), rewrite the result:

- `status: missing → fuzzy_match`
- `method: absent → category_swap`
- `labelValue` filled in from the partner slot
- Rationale: *"The application lists this value under bottler, but the label shows the same entity as the importer (27 CFR 5.66 vs 5.67). Confirm the correct role."*

This downgrades the row from FAIL (red) to REVIEW (yellow), threading through to the human-readable explanation. Symmetric — works in both directions.

### 4.4 Beverage-type-aware required fields

Required-field sets parameterized by `beverageType`:

| Field | Spirits | Wine ≤14% | Wine >14% | Beer |
|---|---|---|---|---|
| brandName, classType, netContents | required | required | required | required |
| alcoholContent | required | optional | required | optional |
| countryOfOrigin (imports) | conditional | conditional | conditional | required (27 CFR 7.69) |

Stops the verifier from over-flagging legal omissions on wine/beer.

---

## 5. Image preprocessing pipeline

Single function in `lib/vlm/image.ts`:

1. `sharp(input).rotate()` — applies the EXIF orientation flag. (Solves Jenny's "weird sideways phone photos" complaint.)
2. Resize longest edge → **1568px** (Anthropic-recommended max for Claude vision).
3. JPEG quality **85**.
4. EXIF stripped as a side-effect (small security win).

That's the whole image pipeline. No OpenCV, no Cloudinary, no external image API.

---

## 6. API surface

| Path | Method | Purpose |
|---|---|---|
| `/` | page | single-label flow |
| `/batch` | page | batch flow (drag CSV + images, live progress, CSV export) |
| `/about` | page | how-it-works explanation |
| `app/actions.ts → verifyLabel` | Server Action | single-label verify |
| `/api/verify-one` | POST | per-label verify (called from batch loop) |
| `/api/warm` | GET (likely) | cold-start mitigation |
| `/api/sentry-example-api` | — | Sentry wizard scaffold |

Batch is **client-orchestrated**: the browser parses the CSV with papaparse, fans out to `/api/verify-one` with a concurrency-6 limiter, and renders progressive results. No server-side queue, no Redis, no background jobs.

---

## 7. Demo data strategy

- `public/samples/` — 5 single labels, **SVG-rendered deterministically** by `bun scripts/generate-samples.ts` so the warning text is always the canonical 27 CFR 16.21 wording, byte-for-byte.
- The 5 samples cover, in order: clean bourbon (PASS), smart-match case difference (REVIEW), title-case + non-bold warning header (FAIL), wrong ABV (FAIL), sideways photo with EXIF orientation 6 (PASS after auto-rotate).
- `public/samples/batch/` — 24 labels rendered by `bun scripts/generate-batch.ts` covering spirits/wine/beer with expected mix of 18 PASS / 3 REVIEW / 3 FAIL.
- `/batch` page has a **"Load demo batch (24 labels)"** button that populates the dropzone with all 24 images plus matching `applications.csv` in one click.

This is one of the cleanest parts of the project — generating demo labels deterministically means the canonical-warning byte-equality test is verifiable without hand-curated images. We should consider doing the same for proofLens.

---

## 8. Performance & evaluation

Three execution modes evaluated on 29 golden samples (5 single + 24 batch), all calls through real OpenRouter with provider pinning:

| | **Tiered** (default) | Haiku-only | Sonnet-only |
|---|---|---|---|
| Verdict accuracy | **28/29 (96.6%)** | 28/29 (96.6%) | 26/29 (89.7%) |
| p50 latency | 4.0s | 3.2s | 5.5s |
| Cost per label | $0.0144 | $0.0080 | $0.0239 |

**Counter-intuitive finding:** Sonnet-only is *worse* than Tiered or Haiku-only. Their explanation: Sonnet's verbatim transcription is slightly more "interpretive," which fails the verifier's strict matching on stylized labels.

**Aggregate OpenRouter spend over a month: $4.64 / 622 requests / 1.86M tokens.** Most of that volume from two `bun run eval:compare` runs (~$1.34 each).

Eval harness commands:
```
bun run eval            # Tiered only
bun run eval:compare    # all three modes (regenerates eval-results.md)
bun run eval:dry        # local dry-run, no API calls
```

---

## 9. UX / design system

Design north star: **"The Marked-Up Filing."** Looks like a printed federal filing being marked up in real time, not a SaaS dashboard.

Concrete rules they enforce:
- **Cream paper surface** (`oklch(0.985 0.008 85)`), never `#fff`. Ink-near-black text, never `#000`.
- **One accent color**: rust (the editor's red pen). Used only on primary CTA, red-line annotation underline, and citation links.
- **Two type voices**: Geist (narrator) and Geist Mono (witness). Mono is reserved for extracted text, normalized values, diff text, and regulation citations.
- **18px body floor**, **48px minimum touch height** — for "Sarah Chen's 73-year-old mother" persona.
- **Status conveyed by color + icon + text simultaneously** — never color alone.
- **Borders carry layout**, not shadows. Exactly one named shadow (`shadow-card`) for the result card.
- **Mono diff** with `<ins>`/`<del>` overrides for the warning red-line; reads like pencil markup, not syntax highlighting.
- **No purple, no sparkle, no gradients, no "Powered by AI" badge.**

Signature components:
- **Status banner** — large icon + status word + meta line. Includes a `Slow` chip when latency > 5s ("the system tells on itself").
- **Field row** — three regions: (left) name + rationale + escalation pill, (center) APPLICATION/LABEL value pair in mono, (right) status badge.
- **Warning red-line** — two side-by-side mono blocks (canonical / extracted) with `diffWords` overlay; flag rows for `headerIsAllCaps` and `headerAppearsBold` each as their own dot-icon-text line.

---

## 10. Operational posture

- **Sentry** wired via the Next.js Sentry wizard (`sentry.edge.config.ts`, `sentry.server.config.ts`, `instrumentation.ts`, `instrumentation-client.ts`). Source maps uploaded from Vercel build.
- **OpenRouter dashboard** is the prototype's per-call observability surface — cost, latency, model, finish-reason all visible per-key.
- **Spend cap**: $5/day per OpenRouter key.
- **In-product telemetry footer (I14)** — every result card shows real $/call and ms/call from the OpenRouter usage payload, scored against pricing in `lib/vlm/pricing.ts`.
- **Production roadmap** they call out: span-level tracing via Langfuse / Helicone / Braintrust, Vercel Blob for batch image persistence, cron-driven nightly eval, provider failover, per-tenant rate limit + spend cap.

---

## 11. Innovations they shipped (their I-numbered list)

CORE (all visible in the demo):

| # | What | Stakeholder it answers |
|---|---|---|
| I2 | Smart-match transparency: `method: normalized` badge with tooltip | "STONE'S THROW ≡ Stone's Throw" |
| I3 | EXIF auto-rotate via sharp | sideways phone photos |
| I4 | Government warning red-line view (`<ins>`/`<del>`) | title-case warning header |
| I6 | Batch upload — concurrency 6 queue, sortable + filterable, CSV export, retry-failed, one-click demo seed | Janet's batch case |
| I7 | One-click "Explain this rejection" via Sonnet, cached in IndexedDB | "judgment, not just matching" |
| I8 | 5 pre-loaded SVG-rendered sample labels | friction-free evaluation |
| I11 | Tiered model routing with visible badge + tooltip + summary note | cost+latency optimization that's *visible* |
| I13 | Bottler ↔ importer category-swap detection | how an experienced agent reads imported labels |
| I14 | In-product cost & latency telemetry footer | Sarah's 5-second rule + transparency |
| I15 | Golden-dataset eval harness with 3-mode comparison | reproducible methodology — surfaced the Sonnet-only counter-result |

STRETCH:
- I12 Keyboard-first batch review (`j`/`k`/space/`?`) — shipped.
- I5 Streaming progressive results — cut (would have required reshaping the Server Action).
- I1 Confidence heatmap with bbox overlay — cut (depends on Haiku reliably returning bboxes).

---

## 12. What they explicitly cut (and why) — useful boundary

| Cut | Reason given |
|---|---|
| Multi-image submissions (front/back/side) | Triples preprocessing complexity for marginal coverage |
| COLA / TTB Online integration | Requires auth + government API access |
| PDF export | "Compliance theatre" — CSV is what reviewers paste into spreadsheets |
| ABV lab-vs-label tolerance | Brief is form-vs-label only; tolerance is a policy question |
| Persistent server-side history / multi-tenant | Stateless prototype — next-hour-of-work, not this hour |
| Auth, RBAC, audit log | Out of scope for prototype |
| True OCR fallback | VLM-only — if model can't read it, user retries with a clearer photo |
| IndexedDB batch resume | Reload loses in-memory `File` objects; correct resume needs blob storage |
| Foreign-language labels | Would need extra prompts |

This is a useful list to consult when scoping proofLens — the same question of whether to attempt vs. cut applies to most of these.

---

## 13. Things worth stealing for proofLens

1. **VLM-only extraction with provider pinning.** Skip the OCR-vs-vision-model debate; pin `allow_fallbacks: false` so the eval is reproducible.
2. **Two-prong warning verification** — VLM extracts text + structural flags (`headerIsAllCaps`, `headerAppearsBold`); server does exact-match against canonical. Never let an LLM "decide" warning compliance.
3. **Verdict is deterministic, not LLM-decided.** Keep the matching ladder typed and the LLM behind a "facts only" prompt.
4. **The model never sees both the application and the label in one call.** Architectural prompt-injection defense.
5. **Hard 4.5s timeout + one retry on 429/5xx** with `(200ms, 800ms)` backoff. Keeps the 5s p95 budget honest.
6. **Anthropic `cache_control: ephemeral` on the system prompt.** Verifiable via `cached_tokens` in OpenRouter.
7. **Tiered routing with a visible badge.** Cost optimization is most defensible when the user can see it.
8. **Bottler↔importer category-swap detection.** Domain-specific demote-from-FAIL-to-REVIEW that mirrors how experienced agents reason.
9. **SVG-rendered deterministic demo labels.** Lets you assert the canonical warning byte-equally without hand-curated images.
10. **Eval harness committed to the repo with 3-mode comparison.** `bun run eval:compare` regenerates a markdown report — the methodology a reviewer can re-run.
11. **In-product cost/latency telemetry.** Numbers per call directly from the OpenRouter usage payload, scored against `pricing.ts`.
12. **Design system in code, not Figma.** `DESIGN.md` documents named rules ("One Pen Rule", "Status-Trio Rule", "18px Floor Rule") that map to Tailwind tokens — easy to enforce in PR review.
13. **Flagging slow results in-band** ("Slow" chip when > 5s) — the system tells on itself before the reviewer notices.

---

## 14. Choices we might revisit

1. **No persistence at all.** Stateless was right for a prototype, but their own roadmap calls out Vercel Blob + queue worker as the right next step. If proofLens is meant to be more than a prototype, plan for blob storage and a real batch worker from day one.
2. **In-memory per-IP rate limit.** Acknowledged as prototype-only. Production needs per-tenant accountability.
3. **No streaming progressive results (I5).** They cut it as a Phase 6 risk. Worth considering up front since it changes the Server Action shape.
4. **Confidence bbox heatmap (I1) abandoned** because Haiku bbox reliability was a coin flip. Worth re-spiking with current Claude — bbox quality has improved.
5. **One eval set of 29 samples.** Good for a take-home; production needs broader coverage and adversarial cases (foreign labels, glare, partial occlusion, multi-label photos).
6. **Sonnet-only is *worse* than Tiered** in their eval — argues against reflexive "use the best model." Worth replicating that 3-mode comparison early in proofLens to see if our prompts behave the same way.
7. **No streaming + no Server Action chunking** means a slow Sonnet call blocks the whole single-label result. Streaming progressive fields would soften this without changing the verifier.
8. **Bun + Node 22 + Vercel Hobby** is great for one developer. If this becomes multi-developer, the Bun/npm/pnpm choice may bite — most CI providers default to Node-native package managers.

---

## 15. Open questions for our own presearch

- Do we want to commit to the same VLM-only stance, or budget for an OCR fallback for genuinely unreadable labels?
- Do we want to differentiate from this implementation (e.g., evidence highlighting with actual bbox overlays, multi-image support, real persistence), or do we accept that "the same product, but cleaner" is also a valid bar?
- Their tiered routing chose Haiku-then-Sonnet. With Claude 4.x available, is Haiku-only viable end-to-end (their own eval suggests yes, at 55% of the cost)?
- Is the `27 CFR 16.21` canonical warning text a legitimate reference for our copy, or do we need the same byte-exact source?
- Their batch is client-orchestrated. For 200–300 labels that's fine. For "thousands per import" scale, we'd want a real queue. Do we need to plan for that?
- Their per-label cost is $0.014. Acceptable for our use case, or do we need to drive it lower?

---

## Source attribution

All information above was gathered by reading public documents in the repo via WebFetch:
- `README.md`, `APPROACH.md`, `PRODUCT.md`, `DESIGN.md`, `presearch.md`
- Folder listings for `app/`, `app/api/`, `lib/`, `lib/verifier/`, `lib/match/`, `lib/vlm/`

No code was cloned, forked, copied, or executed. Quoted phrases are pulled verbatim from the public README/APPROACH/DESIGN/PRODUCT files in the repository.
