# Eval Results — 2026-05-01

**Git SHA:** `60955ad7a6ed77962c4c0a6f9a46bbd4c6dc2ed0`
**Timestamp:** 2026-05-01T03:39:24.584Z
**Conductor version:** Phase 7 eval (golden-set v1)
**Total run cost:** $0.0000 (Layer 1 only)

## Locked targets

| Metric | Target |
|---|---|
| Verdict accuracy | ≥ 95% on golden set |
| p50 latency end-to-end | ≤ 5.0s |
| p95 latency end-to-end | ≤ 8.0s |
| Per-label AI cost | ≤ $0.05 (target ~$0.010 blended) |
| Gov-warning recall on strict-fail cases | 100% (zero misses) |

## Layer 1 — Deterministic

**37/37 cases pass** (100.0% accuracy).

**Gov-warning recall:** 11/11 strict-fail cases caught (100.0%).

| ID | Name | Tags | Expected → Actual | Status |
|---|---|---|---|---|
| 001 | happy-path-spirits-clean-bourbon | happy-path, spirits, 27-cfr-5 | pass-with-warnings → pass-with-warnings | PASS |
| 002 | happy-path-wine-clean-chardonnay-low-abv | happy-path, wine, 27-cfr-4 | pass-with-warnings → pass-with-warnings | PASS |
| 003 | happy-path-malt-clean-amber-lager | happy-path, malt-beverage, 27-cfr-7 | pass-with-warnings → pass-with-warnings | PASS |
| 004 | happy-path-other-universal-only | happy-path, other-unknown, universal-only | pass → pass | PASS |
| 005 | strict-fail-govwarning-missing-prefix | strict-fail, gov-warning, 100-percent-recall | fail → fail | PASS |
| 006 | strict-fail-govwarning-lowercased-prefix | strict-fail, gov-warning, 100-percent-recall | fail → fail | PASS |
| 007 | strict-fail-govwarning-missing-comma-after-surgeon-general | strict-fail, gov-warning, 100-percent-recall | fail → fail | PASS |
| 008 | strict-fail-govwarning-missing-comma-after-operate-machinery | strict-fail, gov-warning, 100-percent-recall | fail → fail | PASS |
| 009 | strict-fail-govwarning-word-substitution | strict-fail, gov-warning, 100-percent-recall | fail → fail | PASS |
| 010 | strict-fail-govwarning-sentence-reorder | strict-fail, gov-warning, 100-percent-recall | fail → fail | PASS |
| 011 | strict-fail-govwarning-smart-quote-with-comma-drop | strict-fail, gov-warning, 100-percent-recall | fail → fail | PASS |
| 012 | strict-fail-govwarning-trailing-extras | strict-fail, gov-warning, 100-percent-recall | fail → fail | PASS |
| 013 | strict-fail-govwarning-truncated-mid-sentence | strict-fail, gov-warning, 100-percent-recall | fail → fail | PASS |
| 014 | strict-fail-abv-spirits-outside-tolerance | strict-fail, abv, distilled-spirits | fail → fail | PASS |
| 015 | strict-pass-abv-spirits-inside-tolerance | happy-path, abv-tolerance, distilled-spirits | pass-with-warnings → pass-with-warnings | PASS |
| 016 | strict-fail-abv-wine-outside-tolerance | strict-fail, abv, wine | fail → fail | PASS |
| 017 | strict-pass-abv-wine-inside-tolerance | happy-path, abv-tolerance, wine | pass-with-warnings → pass-with-warnings | PASS |
| 018 | strict-fail-abv-malt-flavor-required | strict-fail, abv, wine | fail → fail | PASS |
| 019 | nuanced-brand-exact-match | nuanced-match, brand | pass-with-warnings → pass-with-warnings | PASS |
| 020 | nuanced-brand-case-only-diff | nuanced-match, brand | pass-with-warnings → pass-with-warnings | PASS |
| 021 | nuanced-brand-smart-quote-diff | nuanced-match, brand | pass-with-warnings → pass-with-warnings | PASS |
| 022 | nuanced-brand-abbreviation | nuanced-match, brand | pass-with-warnings → pass-with-warnings | PASS |
| 023 | nuanced-brand-completely-different | nuanced-match, brand | fail → fail | PASS |
| 024 | image-quality-clean-no-flags | image-quality, clean | pass-with-warnings → pass-with-warnings | PASS |
| 025 | image-quality-blur-flag | image-quality, blur | needs-manual-review → needs-manual-review | PASS |
| 026 | image-quality-glare-flag | image-quality, glare | needs-manual-review → needs-manual-review | PASS |
| 027 | image-quality-low-light-flag | image-quality, low-light | needs-manual-review → needs-manual-review | PASS |
| 028 | beverage-spirits-abv-required | beverage-aware, spirits, abv-required | needs-manual-review → needs-manual-review | PASS |
| 029 | beverage-wine-high-abv-required | beverage-aware, wine, abv-required | needs-manual-review → needs-manual-review | PASS |
| 030 | beverage-beer-abv-not-required-when-missing | beverage-aware, malt-beverage, abv-not-required | pass-with-warnings → pass-with-warnings | PASS |
| 031 | beverage-other-only-universal-fields | beverage-aware, other-unknown, universal-only | pass → pass | PASS |
| 032 | demo-scenario-01-spirits-pass | demo-scenario, happy-path, spirits | pass-with-warnings → pass-with-warnings | PASS |
| 033 | demo-scenario-02-stones-throw-caps | demo-scenario, nuanced-match, malt-beverage | pass-with-warnings → pass-with-warnings | PASS |
| 034 | demo-scenario-03-abv-mismatch | demo-scenario, strict-fail, abv | fail → fail | PASS |
| 035 | demo-scenario-04-gov-warn-lowercase | demo-scenario, strict-fail, gov-warning | fail → fail | PASS |
| 036 | demo-scenario-05-warn-incomplete | demo-scenario, strict-fail, gov-warning | fail → fail | PASS |
| 037 | demo-scenario-06-glare-blur | demo-scenario, image-quality, blur | needs-manual-review → needs-manual-review | PASS |

## Layer 2 — Golden Set (live `/api/extract-label`)

_Not run. Run `pnpm eval` with `OPENROUTER_API_KEY` set and `pnpm dev` running locally to populate this section._

See `docs/eval.md` for full Layer 2 invocation instructions, including how to point the runner at a deployed Vercel URL via `BASE_URL`.
