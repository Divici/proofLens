# 0009: Polish — demo bundle + a11y + restricted-network + docs

**Blocked by:** 0005, 0006, 0007, 0008
**Blocks:** nothing (final build slice)
**Requirements addressed:** R-016 (empty/loading/error states), R-018 (accessibility), R-019 (docs), R-020 (demo data bundle), R-022 (restricted-network posture)
**Demoable:** All 7 PRD §19 demo scenarios reproducible from one click. Keyboard-only flow works end-to-end. Lighthouse a11y score ≥ 95. README walks a fresh user from clone to deployed URL. `/settings` shows provider allow-list with reachability indicators.
**Estimated effort:** 5-6h

## Acceptance criteria
- [ ] R-020 (demo bundle)
  - All 7 PRD §19 scenarios bundled in `public/demo-labels/` + `public/demo-data/` (replace earlier placeholders)
    - 01: Spirits Pass
    - 02: Stone's Throw nuanced brand
    - 03: ABV mismatch
    - 04: Gov-warning capitalization
    - 05: Incomplete gov-warning
    - 06: Bad image quality (glare/blur)
    - 07: Batch mixed
  - "Load demo data" dropdown on `/review` lists all 7 single-label scenarios
  - "Load demo batch" on `/batch` loads scenario 7 (mix)
  - One real public-domain TTB COLA sample for scenario 01 (verified license-free); 4-5 hand-crafted Figma mocks for the edges
  - Each demo image paired with `expected-data.json`
- [ ] R-016 (empty/loading/error states)
  - All states from PRD §11.5 implemented with plain English (no "500 Internal Server Error" raw)
  - States covered: no-upload, no-expected-data, verification-running, batch-running, AI-failed, image-unreadable, upload-failed, export-failed, review-saved, review-reopened
  - Each state has a Storybook-style snapshot test
- [ ] R-018 (accessibility)
  - Inter for UI; ui-monospace for raw text
  - All interactive elements keyboard-reachable; skip-to-main-content link
  - Focus visible (tailwind `focus-visible` rings)
  - Status indicators: color + icon + text label (never color-only)
  - All form fields have `<label>` or `aria-label`
  - All images have `alt` (or `role="presentation"` for decorative)
  - Lighthouse a11y ≥ 95 on `/`, `/review`, `/batch`, `/history`, `/settings`
  - Keyboard E2E test runs the full single-label flow without mouse
- [ ] R-019 (docs)
  - `README.md` covers: product overview, problem statement, how to run locally, how to deploy to Vercel Hobby, how to use the app, AI/OCR approach, verification approach, HITL workflow, batch flow, image-quality handling, gov-warning validation, data storage and privacy (the IT note story), assumptions, tradeoffs, known limitations (tab-close batch reset, no cross-device, IndexedDB quota), future improvements
  - `docs/architecture.md`: link to PRESEARCH.md + RESEARCH.md
  - `docs/troubleshooting.md`: common issues + fixes (camera permissions, quota, provider down)
  - `STUDY_GUIDE.md` final pass per `~/.claude/rules/study-guide.md` — "What we're building", "How it works", "Key decisions and why", "How each piece works", "Things that don't work well", "Key metrics and results"
  - `decisions/ADR-NNNN-*.md` files — one per major architectural decision (auth removal, OpenRouter, Tesseract sidecar, IndexedDB, 9-slice plan, etc.)
- [ ] R-022 (restricted-network posture)
  - `/settings` page shows provider allow-list: OpenRouter (required), Tesseract.js (in-process — always reachable), Langfuse (eval-time only)
  - Each provider shows reachability status from `/api/health`
  - If OpenRouter unreachable: large banner on `/review` + `/batch` ("AI extraction unavailable; review history and exports still work")
  - Provider allow-list is read-only display in this slice; runtime enforcement is via env-var allow-list (changes require redeploy)
- [ ] All quality gates green
- [ ] All PRD §18 acceptance criteria audit checked off

## Files to touch
- **Create:** `public/demo-labels/01-..07-*.{jpg,png}` (replace earlier placeholders with final assets)
- **Create:** `public/demo-data/01-..07-*.json`
- **Create:** `public/demo-batch/manifest.json` (paired list for scenario 07)
- **Create:** `app/settings/page.tsx`
- **Create:** `app/api/health/route.ts` (extended provider checks)
- **Create:** `components/ProviderStatusList.tsx`
- **Create:** `components/SkipToMain.tsx`
- **Modify:** `components/LabelUploader.tsx` (add demo-data dropdown integration)
- **Modify:** all components for accessibility pass (ARIA labels, keyboard handlers, focus rings)
- **Create:** `docs/architecture.md`, `docs/troubleshooting.md`
- **Modify:** `README.md` (full final draft)
- **Modify:** `STUDY_GUIDE.md` (final pass)
- **Create:** `decisions/ADR-0001-no-auth-no-server-persistence.md`, `ADR-0002-openrouter-only.md`, `ADR-0003-tesseract-sidecar.md`, `ADR-0004-indexeddb-history.md`, `ADR-0005-vertical-slice-build.md`

## Test specs (write first per TDD)
1. `components/EmptyStates.test.tsx` — each state renders with correct copy + icon.
2. `app/settings/page.test.tsx` — shows provider list; reachability indicators reflect health response.
3. `test/e2e/keyboard-only.spec.ts` — full single-label flow via Tab/Enter/Space/arrow keys; passes with 0 mouse events.
4. `test/e2e/demo-scenarios.spec.ts` — load each of the 7 scenarios; each produces the documented expected outcome from PRD §19.
5. `test/a11y/lighthouse.test.ts` — `lighthouse` Node API runs against each route; assert score ≥ 95.

## Notes
- ADR files use the `architecture-decision-records` skill format; one ADR per significant decision.
- The README is the deliverable per R-019; treat it as user-facing documentation, not internal notes.
- Real TTB COLA sample for scenario 01: source from https://www.ttbonline.gov/colasonline/publicSearchColasBasic.do — pick a label whose status is "Approved" with no copyright issues; cite the COLA ID in the demo-data JSON `notes` field.
- Hand-crafted Figma mocks: design once with all the requirements visible (for scenario 1), then derive 4-5 mutations (capitalization, ABV change, missing field, blur filter applied). One source-of-truth + variants is faster than 7 from scratch.
- Mobile a11y: 44px minimum touch targets; test on a real iPhone Safari for at least one E2E pass.
- This slice is the "final coat of paint" — if a polish item slips, the must-have is R-018 (a11y) + R-019 (README + ADRs); demo bundle and restricted-network posture have lower must-have weight.
