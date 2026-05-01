# Slice 0009 — Polish + a11y + restricted-network + docs + deferrals — execution plan

## Source-of-truth spec

`issues/0009-polish-and-docs.md`. **Final build slice.** Conductor
pauses at the polished-demo milestone after this lands.

## Branch

`slice/0009-polish-and-docs` off main. Worktree:
`.worktrees/slice-0009-polish-and-docs/`.

## Context

After slice 0008: full single-label review (upload + camera) + override
+ history + reopen + batch + exports all ship. This slice closes out
the polish, the documentation, and the deferred items accumulated
across earlier slices.

## Priority-ordered deliverables (MUST → SHOULD → NICE)

The agent works the list top-to-bottom. If running out of context,
**must-haves block the merge**; should-haves are nice-but-defer-if-needed;
nice-to-haves can slip to a follow-up.

### MUST-HAVE (block merge)

1. **R-018 — Accessibility pass**
   - Skip-to-main-content link on every route
   - All interactive elements keyboard-reachable; focus-visible rings
     (Tailwind `focus-visible:ring-*`)
   - All status indicators: color + icon + text label (no color-only)
   - All `<input>`/`<select>` have associated `<label>` or `aria-label`
   - All `<img>` have `alt` (or `role="presentation"`)
   - Lighthouse a11y ≥ 95 on `/`, `/review`, `/batch`, `/history`,
     `/about`, `/settings` (settings ships in this slice — see #4)
   - **Failing test first**: `test/e2e/keyboard-only.spec.ts` runs the
     full single-label flow via Tab/Enter/Space/arrow keys with 0
     mouse events; passes
2. **R-019 — Documentation**
   - `README.md` final draft per PRD §16: product overview, problem
     statement, run locally, deploy to Vercel Hobby, how to use, AI/OCR
     approach, verification approach, HITL workflow, batch flow, image
     quality, gov-warning validation, **data storage / privacy story**
     (Marcus IT note explicit), assumptions, tradeoffs, **known
     limitations** (tab-close batch, no cross-device, IndexedDB quota,
     Vercel Hobby ToS, Tesseract cold-start, `fallbackUsd: 0`,
     LLM-judge not yet wired, bbox exact-match-only), future
     improvements
   - `docs/architecture.md` with link to `PRESEARCH.md` + `RESEARCH.md`
   - `docs/troubleshooting.md`: camera permissions, IndexedDB quota,
     OpenRouter rate-limit, Vercel deploy issues
   - **ADRs:** generate one per major decision in slice 0006-0008:
     - `decisions/0004-camera-capture-and-state-machine.md`
     - `decisions/0005-batch-flow-main-thread-pool.md`
     - `decisions/0006-export-pipeline-and-pkzip-writer.md`
   - `STUDY_GUIDE.md` (gitignored) final pass — sections per
     `~/.claude/rules/study-guide.md`
3. **R-016 — Polished empty / loading / error states**
   - Audit every route for the PRD §11.5 states
   - Bad: raw `500 Internal Server Error`
   - Good: plain English with a clear next action
   - States: no-upload, no-expected-data, verification-running,
     batch-running, AI-failed, image-unreadable, upload-failed,
     export-failed, review-saved, review-reopened
4. **Pre-existing e2e flake fix** (rooted in slice 0005, surfaced in
   0006-0008) — `override-and-history.spec.ts` and `verification.spec.ts`
   under default parallel run; passes with `--workers 1`. Root cause:
   `fullyParallel: true + reuseExistingServer + IndexedDB cross-test
   contamination`. Fix:
   - Per-test IndexedDB cleanup (`page.evaluate(() =>
     indexedDB.deleteDatabase('prooflens'))` in `beforeEach`) — already
     done in `override-and-history.spec.ts`; replicate for any spec
     touching IndexedDB
   - Or: scope contention by adding `test.describe.configure({ mode:
     'serial' })` to specs that race
   - Verify by running `pnpm test:e2e` 5 times; zero flake

### SHOULD-HAVE (defer if context-constrained)

5. **R-022 — Restricted-network posture**
   - `app/settings/page.tsx` with provider allow-list display
   - Reachability indicators sourced from `/api/health`
   - Banner on `/review` + `/batch` if OpenRouter unreachable
6. **R-020 — Demo data bundle**
   - Replace programmatic placeholder JPEGs with at least one real
     TTB COLA sample for scenario 01 (verified license-free; cite COLA
     ID in JSON `notes`). Source URL example:
     https://www.ttbonline.gov/colasonline/publicSearchColasBasic.do
   - Hand-craft scenarios 02-06 in Figma (or programmatic SVG-rendered
     improvement) — minimum bar: each scenario reproduces the documented
     PRD §19 expected outcome
   - "Load demo data" dropdown on `/review` lists all 7 scenarios with
     descriptive labels
7. **LLM-judge call wiring** (slice 0003 deferral)
   - In `lib/verify/pipeline.ts` `runLadder` gray band, thread
     `callJudge` from `app/api/judge-field` instead of routing to
     Manual Review
   - Update gray-band test fixtures to assert judge is called
8. **CSV headers Title Case** (slice 0008 deferral)
   - `lib/export/csv/{summary,per-field}.ts` headers from snake_case
     → Title Case (`"Overall status"`, `"Processing time (ms)"`)
9. **In-progress batch CSV/JSON export** (slice 0008 deferral)
   - `app/batch/page.tsx` ExportMenu builds CSV/JSON exports off
     `items` directly (don't gate on `hydrated`)
   - PDFs still need saved Reviews (require save-first)
10. **Hard-coded "verified 2026-04-30" footer** (slice 0008 deferral)
    - Replace with `review.rulesVersion` or a `RULES_VERSION` constant
      that's pulled from a single source

### NICE-TO-HAVE (skip if anything ahead overflowed)

11. **`isImported` UI flag** (slice 0004 deferral) — adds a checkbox
    to ExpectedDataForm; threads to `pipeline.ts` `ruleContext`
12. **bbox fuzzy fallback** (slice 0003 deferral) — `lib/bbox/locate.ts`
    sliding-window match with 0.85 threshold for OCR tokenization drift
13. **Batch ZIP progress toast** (slice 0008 NICE-TO-HAVE) — replace
    binary toast with progress indicator for >10-PDF batches
14. **`Batch.title` formula** (slice 0007 fix-up follow-up) — verify
    `${count} labels — ${firstBrand}` displays correctly in History
15. **Tesseract.js warm-keep cron** at `/api/health` — every 5 min
    in production via Vercel cron config

## Quality gates

```
pnpm typecheck
pnpm lint           (0 warnings)
pnpm test           (target: ~570-600, up from 537)
PORT=3210 pnpm test:e2e   (target: ~22+, up from 20; ZERO flake under default parallel)
pnpm build
pnpm exec playwright test --reporter=line  # 5 consecutive clean runs as flake-fix proof
```

Mutation fuzz must continue 100/100.

## Estimated effort

6-8h. Largest slice. Heavy on docs + a11y audit + flake investigation.

## Reasonable deviations

- If a real TTB COLA sample can't be sourced in worktree (no network
  access), enhance the programmatic placeholder via better SVG layout
  + multiple fonts; document.
- If LLM-judge wiring proves fragile in tests, document and defer to a
  post-merge follow-up commit; the gray band routing to Manual Review
  is acceptable.
- If 5 consecutive clean e2e runs aren't achievable in the time
  available, document the root cause + mitigation; ship with
  `--workers 1` documented in CI as a known mitigation.

## Final report (REQUIRED)

The agent must report:
- Each MUST-HAVE: done / not done + commit hash
- Each SHOULD-HAVE: done / not done + commit hash + reason if not
- Each NICE-TO-HAVE: done / not done
- Quality gates pass/fail
- Mutation fuzz still 100/100?
- Lighthouse a11y scores per route (post slice 0009)
- E2E flake: fixed / mitigated / unchanged
- 5 consecutive e2e runs: passed / how many flaked
