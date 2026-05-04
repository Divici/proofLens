# proofLens — Approach, Tools, and Assumptions

This is the brief's *"documentation of approach, tools used, assumptions made"* deliverable. It's deliberately concise — the README covers setup and how to use the app; this doc covers *why* the architecture looks the way it does.

The verbatim project brief (every UX decision cites it) lives at [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md). A deeper architectural walk-through is at [`docs/architecture.md`](./docs/architecture.md).

---

## Approach

proofLens compares an alcohol-label image against the application data the agent has on file and produces a per-field verdict plus an overall rollup. The hard regulatory constraint — **`27 CFR § 16.21` government warning text must match verbatim** — drives the architecture.

### 1. Hybrid deterministic-first verification

- **Strict matchers** (gov-warning, ABV, net-contents) are pure code. The gov-warning matcher is guarded by a `fast-check` mutation-fuzz harness that generates 11 mutation categories and asserts every one is rejected at `numRuns:100`. Build fails if any mutation slips through.
- **Nuanced matchers** (brand, class/type, bottler, country) flow through a typed match ladder: NFKC + smart-quote/dash fold + case fold + punctuation strip → `fuzzball.token_set_ratio` → 3-band decision. The gray band (similarity 0.78–0.92) optionally consults the LLM judge.
- **Strict fields cannot architecturally reach the LLM judge.** The "LLM normalised our compliance check away" failure mode is closed off by code shape, not policy.
- **Verdicts are deterministic.** Same input → same output. The LLM extracts facts; the server compares.

### 2. LLM-only extraction

- **Vision LLM** (Claude Haiku 4.5 via OpenRouter, structured tool-use) returns every required field with an `evidenceQuote` and a per-field `confidence` score.
- **Government-warning text** is captured verbatim by the LLM and consumed directly by the strict matcher. The matcher's character-level enforcement (NFKC + smart-quote/dash fold + Damerau-Levenshtein on the body) plus the CI mutation fuzz harness defend the 100 %-recall constraint at the matcher level — Layer 2 production smoke holds **11/11 gov-warning recall**.

### 3. Templated rule-sourced explanations

Every `RuleOutcome.kind` has a registered template in `lib/verify/explain/templates.ts`. Same input → same explanation prose. Surfaces in the FieldRow on screen, in PDF exports as a sub-row under each field, and in CSV exports as an "Explanation" column. The LLM judge's prose is auxiliary and only appears on Manual Review rows.

### 4. Browser-only persistence

Saved reviews live in IndexedDB (`prooflens` database, four object stores). Server endpoints — `/api/extract-label`, `/api/judge-field`, `/api/render-pdf`, `/api/health`, `/api/template/csv` — are stateless. Uploaded images are dropped at the end of the request. No server-side user data, no auth, no cross-device sync.

### 5. User flow

1. Land in `/queue` (the agent's home — pending applications)
2. Click a row → `/review?scenario=<id>` opens with image + form pre-loaded (mirrors the brief's "data already on file in COLA" workflow)
3. Click **Verify label** → AI extraction + verification pipeline runs
4. Review per-field verdicts (Pass / Likely match / Warning / Fail / Missing / Low confidence / Manual review / Not required) plus the rolled-up overall pill
5. Apply per-field overrides (with a required reason) and pick a final decision (Approve / Reject / Manual review / Request better image)
6. **Save** → review persists in browser IndexedDB; the queue removes that row
7. Export PDF / JSON / CSV from `/history` later (saved reviews are reopenable + editable)

Bulk uploads live at `/batch` (Janet Park's "200, 300 at once" use case): drop label files + a paired CSV of expected data, watch the live queue, save the whole batch atomically when done.

---

## Tools used

| Layer | Tool | Why |
|---|---|---|
| Framework | **Next.js 16** (App Router) + **React 19** | Server endpoints + page routes from one toolchain |
| Language | **TypeScript** strict + `noUncheckedIndexedAccess` | Catches null/undefined at compile time |
| UI | **shadcn/ui** + **Tailwind v4** + **base-ui** | Familiar patterns, accessible primitives, no design-system churn |
| Vision LLM | **Claude Haiku 4.5** (Anthropic) | Cheap + fast on clean labels; reliable structured tool-use |
| LLM gateway | **OpenRouter** via `openai` SDK | Single SDK; swap models via env vars (primary / fallback / judge) |
| Image preprocessing | **`sharp`** | Auto-rotate via EXIF + downscale to ≤ 2 MP (handles "weird sideways phone photos") |
| Fuzzy matching | **`fuzzball`** (token-set ratio) + **`fastest-levenshtein`** | Set-aware match for nuanced fields; Damerau-Levenshtein for gov-warning prose |
| Text diff | **`diff`** (jsdiff) | Side-by-side red-line for failing gov-warning rows |
| Validation | **Zod** | Runtime schema validation at every cross-module boundary |
| Forms | **react-hook-form** + Zod resolver | Single Zod schema feeds form, server, and validation |
| Browser persistence | **IndexedDB** via **`idb`** | Per Marcus IT note: no server-side user data |
| Test (unit) | **Vitest** + **RTL** + **`fast-check`** | Mutation fuzz at `numRuns:100` against the gov-warning matcher |
| Test (e2e) | **Playwright** | Default project + `production-sim` project that boots with `VERCEL=1` |
| Mocking | **MSW** | Server-route mocking for unit tests |
| PDF render | **`@react-pdf/renderer`** (server-side) | Audit-of-record export rendered in Node |
| CSV | **`papaparse`** | RFC-4180-safe quoting/escaping |
| Hosting | **Vercel Hobby + Fluid compute** | One-command deploy, default region `iad1` |

The full dependency surface is in [`package.json`](./package.json); rationale for each non-obvious dep is in the table above.

---

## Assumptions made

- **TTB rules effective today.** Forward-looking notices (237/238) are out of scope. The canonical § 16.21 text is captured verbatim at `lib/verify/strict/gov-warning-canonical.ts`.
- **No PII or sensitive data persisted.** Per Marcus's IT note — *"we are not storing anything sensitive for this exercise."* Uploaded images live only in the request memory; review history lives in the reviewer's browser.
- **No COLA integration.** The queue is mock and APP-IDs are synthetic. Marcus: *"that's a whole different beast with its own authorization requirements."*
- **Reviewer is trusted.** No auth, no role gating, no audit-log stripping. The audit trail lives in the saved Review record itself (free-text reviewer name + timestamp + reason captured at every override).
- **Network outbound is restricted.** The deployed app uses one outbound domain only: `openrouter.ai`. Tesseract is in-process; no other ML endpoints. Marcus: *"our network blocks outbound traffic to a lot of domains."*
- **Single browser tab per batch.** IndexedDB writes coordinate via IDB's own transaction guarantees, not via cross-tab signaling. Closing the tab mid-batch loses unsaved rows; saves are atomic at batch-completion.
- **Beverage-aware ABV tolerances.** Spirits ±0.3 pp, wine ±1.5 pp / ±1.0 pp by ABV band, malt ±0.3 pp. Wine ≤ 14 % ABV is **Conditional → Optional**.
- **Volume tolerance** 0.1 % on net-contents conversions (mL ↔ L ↔ cL ↔ fl oz).
- **`isImported` auto-derived** from non-US `countryOfOrigin`. The brief's *"country of origin for imports"* maps cleanly to "if it isn't US, it's imported."
- **Reviewer name is an audit field, not an identity assertion.** Free-text input, sticky across sessions in the local `settings` store.

---

## Trade-offs and known limitations

- **Latency over the brief's 5 s ceiling on the tail.** Sarah Chen: *"if we can't get results back in about 5 seconds, nobody's going to use it."* Production p50 ≈ 5.7 s, p95 ≈ 7.3 s — the LLM round-trip dominates. Mitigations available but not shipped: per-VLM-call `AbortController` timeout + retry on 429/5xx, ephemeral prompt caching, provider pinning.
- **OpenRouter daily spend cap of $10.** The provider key is configured with a $10/day hard cap. At an average ≈ $0.0085 per `/api/extract-label` call, that's a budget of roughly 1,100 verifications per day before OpenRouter starts rejecting requests. Sufficient for the POC + reviewer-evaluation traffic profile; production deployment would need a higher cap and per-tenant accounting.
- **`fallbackUsd` always 0.** Schema + cost-tracking plumbing is in place; the confidence-gate routing to the fallback model isn't wired end-to-end yet.
- **No cross-device sync.** Per-browser IndexedDB. Reviewers should export important reviews (PDF / JSON / CSV) before clearing browser data.
- **Real bottle photos limited.** The queue ships 16 entries (6 synthetic deterministic JPEGs + 10 real-photo variants). Brief encouraged AI-generated test labels; we shipped a small real-photo set on top.
- **Mock COLA queue.** The 16 queue rows synthesize from `DEMO_SCENARIOS` + `REAL_SCENARIOS`. Production deployment would need a real backend.
- **Vercel Hobby ToS.** Acceptable for the POC; the architecture is cleanly portable to Pro / Enterprise if commercialised.

---

## Quality gates

```
pnpm typecheck      # strict TypeScript, noUncheckedIndexedAccess
pnpm lint           # ESLint (next config), 0 warnings
pnpm test           # Vitest + fast-check mutation fuzz
pnpm test:e2e       # Playwright (default chromium project)
pnpm test:e2e:prod-sim   # Playwright (Vercel-flavored, VERCEL=1)
pnpm eval:deterministic  # Layer-1 golden-set eval
```

All five must pass. The gov-warning mutation fuzz at `numRuns:100` is part of `pnpm test`; CI fails on any matcher regression. Production smoke against the deployed instance has hit **11/11 gov-warning recall** (Layer 2).

Test counts at the time of writing: vitest **656 / 656**, Playwright **26 chromium + 15 production-sim**, eval Layer 1 **37 / 37**, gov-warning recall on production smoke **11 / 11**.
