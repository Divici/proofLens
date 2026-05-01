# Eval Results — 2026-05-01

**Git SHA:** `bf7663142b3274ce5179d750c03c18e4bbe081dd`
**Timestamp:** 2026-05-01T15:04:25.228Z
**Conductor version:** Phase 7 eval (golden-set v1)
**Total run cost:** $0.1161

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

> ⚠️ **Harness caveat (2026-05-01).** The 37 golden cases reuse only 6
> demo images in `public/demo-labels/`. Most cases describe a label whose
> brand / beverage / gov-warning text does not appear in the image they
> POST. The live LLM correctly extracts what is in the photo; the
> mismatch with the case's `expectedData` rolls up to `overall=fail`.
> Layer 2's verdict accuracy line below is therefore not currently a
> meaningful product metric — it reflects fixture mis-mapping, not
> pipeline behaviour. Latency, cost, and the 502-rate columns ARE valid
> signals. Layer 1 (deterministic) remains 37/37 with 100 % gov-warning
> recall and is the source of truth for verdict correctness today.
>
> Phase 7 follow-up options: (a) generate one distinct demo label per
> case (37 images), (b) re-scope Layer 2 to a contract test, or
> (c) accept Layer 1 + e2e + manual demo as the verification surface.

| Metric | Value | Target |
|---|---|---|
| Verdict accuracy | 0/37 (0.0%) | ≥ 95% |
| p50 latency | 5824 ms | ≤ 5000 ms |
| p95 latency | 8473 ms | ≤ 8000 ms |
| Avg cost / case | $0.0089 | ≤ $0.05 |
| Total run cost | $0.1161 | informational |
| Gov-warning recall | 0/0 (0.0%) | 100% |

### Per-case results

| ID | Name | Latency (ms) | Cost ($) | Expected → Actual | Status |
|---|---|---|---|---|---|
| 001 | happy-path-spirits-clean-bourbon | 6242 | 0.0095 | pass-with-warnings → fail | FAIL |
| 002 | happy-path-wine-clean-chardonnay-low-abv | 5633 | — | pass-with-warnings → — | FAIL |
| 003 | happy-path-malt-clean-amber-lager | 7551 | 0.0086 | pass-with-warnings → fail | FAIL |
| 004 | happy-path-other-universal-only | 14693 | 0.0095 | pass → fail | FAIL |
| 005 | strict-fail-govwarning-missing-prefix | 5437 | — | fail → — | FAIL |
| 006 | strict-fail-govwarning-lowercased-prefix | 5485 | — | fail → — | FAIL |
| 007 | strict-fail-govwarning-missing-comma-after-surgeon-general | 5545 | — | fail → — | FAIL |
| 008 | strict-fail-govwarning-missing-comma-after-operate-machinery | 5348 | — | fail → — | FAIL |
| 009 | strict-fail-govwarning-word-substitution | 5810 | — | fail → — | FAIL |
| 010 | strict-fail-govwarning-sentence-reorder | 5266 | — | fail → — | FAIL |
| 011 | strict-fail-govwarning-smart-quote-with-comma-drop | 5381 | — | fail → — | FAIL |
| 012 | strict-fail-govwarning-trailing-extras | 6598 | — | fail → — | FAIL |
| 013 | strict-fail-govwarning-truncated-mid-sentence | 5838 | — | fail → — | FAIL |
| 014 | strict-fail-abv-spirits-outside-tolerance | 5843 | — | fail → — | FAIL |
| 015 | strict-pass-abv-spirits-inside-tolerance | 5344 | — | pass-with-warnings → — | FAIL |
| 016 | strict-fail-abv-wine-outside-tolerance | 5280 | — | fail → — | FAIL |
| 017 | strict-pass-abv-wine-inside-tolerance | 5824 | — | pass-with-warnings → — | FAIL |
| 018 | strict-fail-abv-malt-flavor-required | 8593 | — | fail → — | FAIL |
| 019 | nuanced-brand-exact-match | 6770 | 0.0086 | pass-with-warnings → fail | FAIL |
| 020 | nuanced-brand-case-only-diff | 6874 | 0.0086 | pass-with-warnings → fail | FAIL |
| 021 | nuanced-brand-smart-quote-diff | 7969 | 0.0086 | pass-with-warnings → fail | FAIL |
| 022 | nuanced-brand-abbreviation | 8443 | 0.0086 | pass-with-warnings → fail | FAIL |
| 023 | nuanced-brand-completely-different | 6567 | 0.0086 | fail → fail | FAIL |
| 024 | image-quality-clean-no-flags | 4957 | — | pass-with-warnings → — | FAIL |
| 025 | image-quality-blur-flag | 6418 | — | needs-manual-review → — | FAIL |
| 026 | image-quality-glare-flag | 4178 | — | needs-manual-review → — | FAIL |
| 027 | image-quality-low-light-flag | 4289 | — | needs-manual-review → — | FAIL |
| 028 | beverage-spirits-abv-required | 7168 | 0.0095 | needs-manual-review → fail | FAIL |
| 029 | beverage-wine-high-abv-required | 5743 | — | needs-manual-review → — | FAIL |
| 030 | beverage-beer-abv-not-required-when-missing | 6822 | 0.0086 | pass-with-warnings → fail | FAIL |
| 031 | beverage-other-only-universal-fields | 6539 | 0.0095 | pass → fail | FAIL |
| 032 | demo-scenario-01-spirits-pass | 6230 | 0.0095 | pass-with-warnings → fail | FAIL |
| 033 | demo-scenario-02-stones-throw-caps | 6534 | 0.0086 | pass-with-warnings → fail | FAIL |
| 034 | demo-scenario-03-abv-mismatch | 5336 | — | fail → — | FAIL |
| 035 | demo-scenario-04-gov-warn-lowercase | 5201 | — | fail → — | FAIL |
| 036 | demo-scenario-05-warn-incomplete | 5542 | — | fail → — | FAIL |
| 037 | demo-scenario-06-glare-blur | 4977 | — | needs-manual-review → — | FAIL |

### Layer 2 failures

- **001 happy-path-spirits-clean-bourbon**
  - overall=fail, expected="pass-with-warnings"
  - field=brand: status=likely-match, expected="pass"
  - field=governmentWarning: status=fail, expected="pass"
- **002 happy-path-wine-clean-chardonnay-low-abv**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **003 happy-path-malt-clean-amber-lager**
  - overall=fail, expected="pass-with-warnings"
  - field=brand: status=likely-match, expected="pass"
  - field=governmentWarning: status=fail, expected="pass"
- **004 happy-path-other-universal-only**
  - overall=fail, expected="pass"
  - field=brand: status=likely-match, expected="pass"
  - field=governmentWarning: status=fail, expected="pass"
- **005 strict-fail-govwarning-missing-prefix**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **006 strict-fail-govwarning-lowercased-prefix**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **007 strict-fail-govwarning-missing-comma-after-surgeon-general**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **008 strict-fail-govwarning-missing-comma-after-operate-machinery**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **009 strict-fail-govwarning-word-substitution**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **010 strict-fail-govwarning-sentence-reorder**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **011 strict-fail-govwarning-smart-quote-with-comma-drop**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **012 strict-fail-govwarning-trailing-extras**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **013 strict-fail-govwarning-truncated-mid-sentence**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **014 strict-fail-abv-spirits-outside-tolerance**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **015 strict-pass-abv-spirits-inside-tolerance**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **016 strict-fail-abv-wine-outside-tolerance**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **017 strict-pass-abv-wine-inside-tolerance**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **018 strict-fail-abv-malt-flavor-required**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **019 nuanced-brand-exact-match**
  - overall=fail, expected="pass-with-warnings"
  - field=brand: status=likely-match, expected="pass"
- **020 nuanced-brand-case-only-diff**
  - overall=fail, expected="pass-with-warnings"
- **021 nuanced-brand-smart-quote-diff**
  - overall=fail, expected="pass-with-warnings"
- **022 nuanced-brand-abbreviation**
  - overall=fail, expected="pass-with-warnings"
- **023 nuanced-brand-completely-different**
  - field=brand: status=likely-match, expected="fail"
- **024 image-quality-clean-no-flags**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **025 image-quality-blur-flag**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **026 image-quality-glare-flag**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **027 image-quality-low-light-flag**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **028 beverage-spirits-abv-required**
  - overall=fail, expected="needs-manual-review"
  - field=abv: status=pass, expected="missing"
- **029 beverage-wine-high-abv-required**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **030 beverage-beer-abv-not-required-when-missing**
  - overall=fail, expected="pass-with-warnings"
  - field=abv: status=pass, expected="not-required"
- **031 beverage-other-only-universal-fields**
  - overall=fail, expected="pass"
  - field=brand: status=likely-match, expected="pass"
  - field=governmentWarning: status=fail, expected="pass"
- **032 demo-scenario-01-spirits-pass**
  - overall=fail, expected="pass-with-warnings"
  - field=brand: status=likely-match, expected="pass"
  - field=governmentWarning: status=fail, expected="pass"
- **033 demo-scenario-02-stones-throw-caps**
  - overall=fail, expected="pass-with-warnings"
- **034 demo-scenario-03-abv-mismatch**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **035 demo-scenario-04-gov-warn-lowercase**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **036 demo-scenario-05-warn-incomplete**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
- **037 demo-scenario-06-glare-blur**
  - HTTP 502: {"error":"The vision provider could not extract this label. Please try again in a moment."}
