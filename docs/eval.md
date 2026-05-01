# proofLens Phase-7 Eval

This document explains how to run the four-layer eval methodology against
proofLens. Per `PRESEARCH.md` §5, proofLens has **one AI mode, no
variants, no rubric**, so only Layers 1 and 2 are in scope. Layers 3 and
4 are intentionally skipped.

## What lives where

| Path | Purpose |
|---|---|
| `eval/golden/*.json` | 37 hand-curated cases (programmatically generated) |
| `eval/generate-golden.mjs` | Regenerates the JSON cases from a single source of truth |
| `eval/runner.ts` | Layer 1 (deterministic) + Layer 2 (golden-set) runner |
| `eval/helpers.ts` | Pure helpers shared with `eval/helpers.test.ts` |
| `eval/deterministic.yaml` | Spec of Layer 1 assertions (reviewer-readable) |
| `eval-results.md` | Committed results — auto-written by every runner invocation |

## Layer-by-layer scope

| Layer | What it does | Cost | Network |
|---|---|---|---|
| 1 — Deterministic | Drives `runVerificationPipeline` against synthesised `mockExtraction` + `mockOcr` per case. Pure code, no LLM. | $0.00 | None |
| 2 — Golden Set | POSTs each case's image to `/api/extract-label` on a running server. Records actual verdict, latency, AI spend. | ~$0.30 (37 × $0.010) | Calls OpenRouter via the running app |
| 3 — Variant Comparison | Skipped. proofLens has one AI mode. | n/a | n/a |
| 4 — LLM-as-Judge | Skipped. No subjective rubric. | n/a | n/a |

## Locked targets

(Mirrored in `eval-results.md` and `PRESEARCH.md` §1.)

| Metric | Target |
|---|---|
| Verdict accuracy | ≥ 95% on golden set |
| p50 latency end-to-end | ≤ 5.0s |
| p95 latency end-to-end | ≤ 8.0s |
| Per-label AI cost | ≤ $0.05 (target ~$0.010 blended) |
| Gov-warning recall on strict-fail cases | **100% (zero misses) — hard requirement** |

The 100 % gov-warning recall floor is enforced in BOTH layers — the runner
exits non-zero on any miss, regardless of overall accuracy. This is the
single most consequential field; a missed gov-warning fail is a
regulatory liability.

## Running Layer 1 (deterministic — no API key needed)

```bash
pnpm eval:deterministic
```

This runs in ~5 seconds, makes no network calls, and writes
`eval-results.md` with the Layer 1 results filled in. Layer 1 is the same
code path the `eval/runner.test.ts` integration test exercises in
vitest, so a vitest run is a quick way to validate the golden set
without the standalone CLI.

Failure modes:

- **Schema validation** — a case's `input.expectedData` or `mockExtraction`
  doesn't parse against the Zod schemas in `lib/ai/schema.ts`.
- **Verdict mismatch** — the pipeline's `overall` (or any per-field
  `status`) doesn't match the case's `expected`.
- **Gov-warning recall miss** — a case tagged `100-percent-recall`
  produced anything other than `overall=fail` AND `governmentWarning=fail`.

## Running Layer 2 (golden set against the live server)

### Prerequisites

1. Set `OPENROUTER_API_KEY` in `.env.local` (see `.env.example` for the
   full env-var list).
2. Start the Next dev server: `pnpm dev`. Wait for the
   `Ready in N ms` line.

### Against a local server

```bash
pnpm eval
```

The runner POSTs each case's image to `http://localhost:3000/api/extract-label`,
records the response, and tabulates verdict accuracy, p50/p95 latency,
and total + average cost. Estimated cost: **~$0.30** for 37 cases at
~$0.010/label. Target run time: **5–10 minutes** (sequential calls; the
real production batch path is concurrent but the eval runner is
deliberately serial so per-case latency reads are clean).

### Against a deployed URL

```bash
BASE_URL=https://prooflens.vercel.app pnpm eval
```

Same script, different target. The deployed instance still needs
`OPENROUTER_API_KEY` configured in its Vercel env (the runner doesn't
forward it from the local environment).

### Reading `eval-results.md`

The file is structured per the conductor eval SKILL spec:

1. **Header** — git SHA at run time, ISO timestamp, conductor version,
   total run cost (sum across cases for Layer 2; $0 for Layer 1).
2. **Locked targets** — the table from above, copied verbatim so the
   reviewer can compare row-by-row.
3. **Layer 1 — Deterministic** — passed / failed count, accuracy, gov-warning
   recall, then per-case results table.
4. **Layer 2 — Golden Set** — same shape plus latency + cost metrics.
   Stubbed with an instruction line if Layer 2 hasn't been run.
5. **Per-case failure list** — only present if any case failed; lists the
   specific assertion mismatches so a maintainer can triage.

The runner exits non-zero if **any** of the locked targets miss. CI
treats Layer 1 as required (it's free + fast); Layer 2 is a manual
smoke before each deploy.

## Adding more golden cases

The 37 cases ship out of one source file at `eval/generate-golden.mjs`.
To add a case:

1. Edit `eval/generate-golden.mjs`. Add a `push({...})` entry following
   one of the existing patterns (happy-path, strict-fail, nuanced-match,
   image-quality, beverage-aware, demo-scenario).
2. Run `pnpm eval:generate` — it wipes `eval/golden/` and regenerates
   one JSON file per case.
3. Run `pnpm eval:deterministic` to confirm Layer 1 still passes.
4. (Optional) Run `pnpm eval` to confirm Layer 2 lands on the same
   verdict against the real LLM extraction.

### When to add a case

- A real bug shipped past verification — add a regression case.
- A new beverage-rule edge case (e.g. wine ≤ 14 % vs > 14 % required).
- A new gov-warning mutation surfaces (mutation-fuzz alone covers most,
  but golden cases pin the named scenarios).

### Conventions

- IDs are zero-padded three digits, monotonically increasing.
- Names are kebab-case starting with the case family (`happy-path-…`,
  `strict-fail-…`, `nuanced-…`, `image-quality-…`, `beverage-…`,
  `demo-scenario-…`).
- Tags drive the runner's tag-bucket reporting; pick from the families
  above plus the field tag (`gov-warning`, `abv`, `brand`) and the
  beverage tag (`spirits`, `wine`, `malt-beverage`, `other-unknown`).

## Reproducibility

- Provider pinning is enforced inside `lib/ai/openrouter.ts`
  (`allow_fallbacks: false`).
- `temperature: 0` is set on every Claude call so Layer 2 verdicts are
  near-deterministic (small model variance still possible — the ≥ 95 %
  accuracy target accounts for this).
- The runner records the git SHA in the results header so you can
  bisect drift over time.
- `eval-results.md` is committed to the repo per the SKILL spec.

## Troubleshooting

**"`tsx: command not found`"** — run `pnpm install` to install dev deps.

**"Cannot find module …pipeline.ts"** — the runner uses `.ts` import
specifiers, which Node's native TS support handles when invoked via
`tsx`. Use the package.json scripts (`pnpm eval:deterministic`,
`pnpm eval`), not raw `node`.

**"HTTP 500: env validation failed"** — the running server doesn't
have `OPENROUTER_API_KEY` set. Add it to `.env.local` and restart `pnpm dev`.

**"image not found at …"** — `eval/generate-golden.mjs` references
`public/demo-labels/*.jpg`. If you've deleted the demo images, run
`node scripts/generate-demo-labels.mjs` to recreate them.

**Layer 1 passes, Layer 2 fails on a single case** — the LLM extraction
disagreed with the synthesised `mockExtraction`. Inspect the per-case
failure block in `eval-results.md`. Common causes:
- LLM returned `null` for a field your mockExtraction populated.
- LLM extracted with a slight wording variant that the nuanced ladder
  routes to `manual-review` instead of `likely-match` because the
  judge isn't reachable.

For drift between layers, prefer fixing the `mockExtraction` to match
real LLM behaviour rather than hand-tuning expectations.
