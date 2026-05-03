# Plan — Extraction hardening (ABV + net contents)

> Self-contained plan for the five hardening items identified during the
> Phase-9 user-reported "label says 45% but system saw 38%" analysis.
> Companion to `decisions/0009-grader-audit-warnings-and-deferrals.md`
> and `2026-05-03-grader-audit-and-fixes.md`.

**Goal:** Add cross-check defenses against vision-LLM hallucination on
the two strict numeric fields (ABV, net contents). Today the LLM is
the **sole source** for these values — Tesseract OCR runs in parallel
but is consulted only for gov-warning ground truth and bbox highlights.
A single LLM misread or hallucination is invisible to the rest of the
system; the matcher trusts the LLM blindly.

**Architecture:**
1. Tesseract raw text becomes a second-opinion check on numeric fields.
   When the LLM and Tesseract disagree past tolerance, demote to
   manual review with a clear "AI says X / OCR sees Y" explanation.
2. Surface both readings in the UI so reviewers can see the
   disagreement without having to dig.
3. Lower confidence when the existing internal-consistency check
   couldn't run (proof not extracted alongside ABV).
4. Wire the fallback model (Claude Sonnet 4.6) for low-confidence
   re-extraction. Plumbing exists; just isn't invoked.
5. Add beverage-specific sanity bands (spirits ABV ≥ 15%, wine ≤ 25%,
   etc.) — pre-LLM-error guardrails that flag obvious misreads.

**Tech stack:** Existing — Tesseract.js + regex parsing in
`lib/verify/strict/abv.ts` + the OpenRouter wrapper in
`lib/ai/openrouter.ts`. No new deps.

---

## 1. Why this work exists

### 1.1 Phase-9 user report

Reviewer reported: label clearly shows `45% Alc./Vol. (90 Proof)` but
the verification result says "found 38% Alc./Vol. (76 Proof)". On
investigation the **specific** symptom turned out to be a state-
staleness bug in the page (already fixed in commit `d75d6c2`-ish — see
commit log). But the analysis surfaced a real architectural gap:

> "There is no cross-check between Tesseract OCR and the LLM
> extraction for the ABV value. If the LLM hallucinates 38 the system
> has no defense."

This plan closes that gap.

### 1.2 What "no defense" means concretely

Today's pipeline (`lib/verify/pipeline.ts:362-367`):

```ts
const candidate =
  typeof extracted.alcoholContentText.value === "string"
    ? extracted.alcoholContentText.value
    : typeof extracted.abvPercent.value === "number"
      ? `${extracted.abvPercent.value}%`
      : null;
// abvMatch(candidate, expected, beverageType) — pure regex parse
```

`extracted` comes entirely from the LLM. Tesseract's `rawText` is
ignored for ABV. The strict matcher's only defense against bad LLM
input is the **internal-consistency check** — proof must equal 2× ABV
within tolerance:

```ts
if (parsed.abv !== null && parsed.proof !== null) {
  const expectedProof = parsed.abv * 2;
  if (Math.abs(parsed.proof - expectedProof) > resolvedTolerance * 2) {
    return { status: "fail", reason: "internal_inconsistency", ... };
  }
}
```

This catches *some* hallucinations — but only when:
1. The LLM returned both ABV and proof, AND
2. They disagree.

Self-consistent hallucinations like `(38, 76)` pass the check because
once the model commits to "38" it derives proof from 2× internally.
ABV-only labels skip the check entirely.

Same architectural shape applies to net contents (`pipeline.ts:454+`)
— LLM is the only source; Tesseract isn't consulted.

### 1.3 Why this isn't paranoia

The brief's hard rule is **100% recall on government-warning strict
fail.** Gov-warning has Tesseract as ground-truth defense + a
mutation-fuzz CI gate at `numRuns: 100`. ABV doesn't have either.

Sarah Chen's interview puts the stakes plainly: spirits ABV is the
field most often subject to consumer regulation (proof tax, taxable-
grade boundary at 14% wine, etc.). A hallucinated ABV that passes
match-validation is exactly the failure mode that erodes trust in the
tool.

---

## 2. Audit — current state per item

### 2.1 No Tesseract cross-check on ABV / net contents

**Today:** LLM is the sole source for `extracted.abvPercent` and
`extracted.netContents`. Tesseract's `rawText` carries the same
numeric content (or its OCR best-effort) but is never compared.

**Risk:** LLM digit-confusion (`3↔8`, `5↔6`), wrong-field grabs
(picks "750" from net contents and reads as ABV), and prior-driven
hallucinations all bypass the matcher.

**Fix:** New module `lib/verify/strict/cross-check.ts` that scans
`rawText` for ABV-shaped patterns and net-contents-shaped patterns,
returning the parsed numbers it found. Pipeline compares those to
the LLM's values; on disagreement past tolerance, demote pass →
**manual-review** with a `cross_check_disagreement` outcome that
shows both readings in the explanation.

### 2.2 No raw-OCR display next to AI evidence

**Today:** `evidenceQuote` shows the LLM's verbatim quote ("38% Alc./
Vol. (76 Proof)"). Tesseract's raw text is in a separate panel that
the reviewer has to expand. They can't compare.

**Risk:** A reviewer trusting the AI evidence quote at face value
won't notice when Tesseract read something completely different.

**Fix:** Inside `FieldRow`, when results land, surface a small
"OCR text near this region" line under the evidence quote — pulled
from `rawText` by selecting words within the field's bbox (or
nearby). When the AI quote and the OCR text differ visibly,
highlight the divergence.

### 2.3 No confidence penalty when proof is missing

**Today:** A `(38% ABV, null proof)` extraction skips the
internal-consistency check silently. The displayed confidence is
the LLM's self-reported value, which may be high.

**Risk:** Reviewer sees "Confidence: 99%" on a value with no
defense whatsoever. Confidence pill misrepresents the reality.

**Fix:** In `pipeline.ts` ABV block, when `parsed.proof === null`
AND `expected.beverageType === "distilled-spirits"` (where proof is
universal on real labels), reduce displayed confidence to ≤ 0.7 so
the field demotes to a softer status. Add a rule outcome
`abv_proof_missing_no_consistency_check` for the explanation.

### 2.4 Fallback model not wired

**Today:** Schema has `aiSpend.fallbackUsd` field. `lib/ai/openrouter.ts`
exports `extractLabel` that takes a model parameter. ENV has
`OPENROUTER_MODEL_FALLBACK`. Nothing actually invokes the fallback.

**Risk:** When Haiku 4.5 gives low-confidence garbage, we ship the
garbage. A re-extract on Sonnet 4.6 often catches what Haiku missed.

**Fix:** In `app/api/extract-label/route.ts`, after primary
extraction, if `extractionConfidence < 0.6` OR any of the strict
fields (`alcoholContentText`, `netContents`, `governmentWarningText`)
have `confidence < 0.6`, re-call with the fallback model and merge
the higher-confidence values. Track both costs.

### 2.5 No beverage-specific numeric sanity bands

**Today:** Matcher accepts any parsed number 0–100% as ABV. A `2%
spirits` or `92% wine` would pass through the regex parser cleanly
even though both are obviously wrong.

**Risk:** When the LLM hallucinates a wildly out-of-band number we
silently fail it as "out of tolerance" instead of flagging the
extraction itself as suspect.

**Fix:** New helper `isAbvInBeverageBand(abv, beverageType)` —
returns false when ABV is implausible for the beverage class:
- Distilled spirits: must be 15-95% (vodka through Everclear)
- Wine: 5-25% (lower-alcohol through fortified)
- Malt beverage: 0.5-20% (non-alcoholic through eisbock)

Out-of-band → demote to manual-review with an
`abv_out_of_beverage_band` outcome.

### 2.6 Summary table

| Item | Status today | Action |
|---|---|---|
| Tesseract cross-check on numeric fields | ❌ Missing | **Task 1** — new cross-check module |
| Raw-OCR side-by-side in field row | ⚠️ Hidden in panel | **Task 2** — inline next to evidence |
| Confidence penalty when proof null | ❌ Missing | **Task 3** — pipeline overlay |
| Fallback model on low confidence | ⚠️ Wired but uncalled | **Task 4** — invoke when confidence < 0.6 |
| Beverage-specific sanity bands | ❌ Missing | **Task 5** — pure helper + pipeline wiring |

---

## 3. Files to create / modify

### New files

| Path | Purpose |
|---|---|
| `lib/verify/strict/cross-check.ts` | Pure module — `scanRawTextForAbv(rawText)` + `scanRawTextForNetContents(rawText)`. Returns parsed numbers found in OCR, or null. |
| `lib/verify/strict/cross-check.test.ts` | Unit tests on synthetic raw-OCR strings + adversarial cases. |
| `lib/verify/strict/beverage-bands.ts` | Pure module — `isAbvInBeverageBand(abv, beverageType)` and `expectedAbvRange(beverageType)`. |
| `lib/verify/strict/beverage-bands.test.ts` | Coverage per beverage class. |

### Modified files

| Path | Change |
|---|---|
| `lib/verify/pipeline.ts` | (a) After ABV value-match, run `scanRawTextForAbv(rawText)` and demote pass → manual-review on disagreement past tolerance. (b) After net-contents value-match, run `scanRawTextForNetContents(rawText)`, same treatment. (c) When `parsed.proof === null` for spirits, lower displayed confidence and add `abv_proof_missing_no_consistency_check` outcome. (d) Run `isAbvInBeverageBand` after parse — out-of-band demotes. |
| `lib/verify/types.ts` | Add new `RuleOutcomeKind` values: `abv_cross_check_disagreement`, `net_contents_cross_check_disagreement`, `abv_proof_missing_no_consistency_check`, `abv_out_of_beverage_band`. |
| `lib/verify/explain/templates.ts` | Add explanation templates for the four new outcome kinds. |
| `lib/verify/explain/render.test.ts` | Cover the new kinds. |
| `app/api/extract-label/route.ts` | Add fallback-model retry when `extractionConfidence < 0.6` OR any strict field's `confidence < 0.6`. Merge results, track both spend. |
| `lib/ai/openrouter.ts` | Already exports `extractLabel(buffer, model)` — no change needed. |
| `components/FieldRow.tsx` | Show "OCR text near this region" under the evidence quote when raw-OCR disagrees with the AI evidence (controlled by a new prop `rawOcrDisagreement?: string`). |
| `lib/verify/pipeline.test.ts` | Regression tests for all five behaviors. |

---

## 4. Implementation order

### Task 1 — Tesseract cross-check on ABV + net contents

#### Step 1.1 — Failing tests (TDD)

**Files:** Create `lib/verify/strict/cross-check.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  scanRawTextForAbv,
  scanRawTextForNetContents,
} from "./cross-check";

describe("scanRawTextForAbv — pulls ABV-shaped numbers from Tesseract raw text", () => {
  it("finds the canonical 'NN% Alc./Vol.' pattern", () => {
    const result = scanRawTextForAbv(
      "OLD TOM DISTILLERY\n45% Alc./Vol. (90 Proof)\n750 mL",
    );
    expect(result?.abv).toBe(45);
    expect(result?.proof).toBe(90);
  });

  it("finds 'Alcohol NN by Volume' phrasing", () => {
    const result = scanRawTextForAbv("ALCOHOL 40% BY VOLUME");
    expect(result?.abv).toBe(40);
  });

  it("ignores numbers in unrelated context (volume, year, batch)", () => {
    const result = scanRawTextForAbv(
      "750 mL\nEST. 1982\nBATCH 22\nGOVERNMENT WARNING:",
    );
    expect(result).toBeNull();
  });

  it("returns null when nothing ABV-shaped is present", () => {
    expect(scanRawTextForAbv("BARDSTOWN, KENTUCKY")).toBeNull();
    expect(scanRawTextForAbv("")).toBeNull();
  });

  it("prefers the first ABV mention (front of label) over later ones", () => {
    const result = scanRawTextForAbv(
      "45% Alc./Vol.\n... lots of text ...\n40% (NUTRITION FACTS)",
    );
    expect(result?.abv).toBe(45);
  });
});

describe("scanRawTextForNetContents — pulls volume-shaped strings from Tesseract", () => {
  it("finds '750 mL'", () => {
    expect(scanRawTextForNetContents("750 mL")?.canonicalMl).toBeCloseTo(750);
  });

  it("finds '1.5 L' and converts to mL", () => {
    expect(scanRawTextForNetContents("1.5 L")?.canonicalMl).toBeCloseTo(1500);
  });

  it("finds '12 fl oz'", () => {
    const result = scanRawTextForNetContents("12 fl oz");
    expect(result?.canonicalMl).toBeCloseTo(354.882, 1);
  });

  it("returns null on no volume present", () => {
    expect(scanRawTextForNetContents("OLD TOM DISTILLERY")).toBeNull();
  });

  it("returns the first volume mention when multiple appear", () => {
    const result = scanRawTextForNetContents("750 mL  (25.4 fl oz)");
    expect(result?.canonicalMl).toBeCloseTo(750);
  });
});
```

Run: `pnpm vitest run lib/verify/strict/cross-check.test.ts`
Expected: FAIL (module not found).

#### Step 1.2 — Implement scanners

**Files:** Create `lib/verify/strict/cross-check.ts`

```ts
import { parseAbvText, type ParsedAbv } from "./abv";
import { parseVolume, type ParsedVolume } from "./net-contents";

/**
 * Cross-check helpers — read Tesseract's raw OCR text for the same
 * numeric fields the LLM extracts. The pipeline compares these to the
 * LLM's values and demotes to manual-review on disagreement, closing
 * the architectural gap where the LLM is the sole source for ABV +
 * net-contents.
 *
 * Both helpers return null when nothing matching is found — the
 * pipeline interprets null as "no second opinion available, trust the
 * LLM", which preserves backward-compatible behavior on the Vercel /
 * LLM-fallback path where rawText is empty.
 */

export function scanRawTextForAbv(rawText: string): ParsedAbv | null {
  if (typeof rawText !== "string" || rawText.trim().length === 0) return null;
  // parseAbvText already handles the ABV + proof patterns. We feed it
  // the entire OCR text — it returns the FIRST match.
  const result = parseAbvText(rawText);
  if (result.abv === null && result.proof === null) return null;
  return result;
}

export function scanRawTextForNetContents(
  rawText: string,
): ParsedVolume | null {
  if (typeof rawText !== "string" || rawText.trim().length === 0) return null;
  return parseVolume(rawText);
}
```

Run: `pnpm vitest run lib/verify/strict/cross-check.test.ts`
Expected: PASS (10/10).

#### Step 1.3 — Pipeline wires the cross-check (ABV)

**Files:** Modify `lib/verify/pipeline.ts`

In the ABV block, after `outcome = abvMatch(...)` and before
`buildFieldResult(...)`:

```ts
// Cross-check overlay — if Tesseract raw text contains a different
// ABV value, demote pass → manual-review. Closes the architectural
// gap where the LLM is the sole source. On the Vercel/LLM-fallback
// path rawText is empty → cross-check is a no-op (preserves prior
// behavior).
let abvStatus = status;
if (outcome.status === "pass" && rawText && rawText.trim().length > 0) {
  const ocrAbv = scanRawTextForAbv(rawText);
  if (
    ocrAbv?.abv !== null &&
    ocrAbv?.abv !== undefined &&
    Math.abs(ocrAbv.abv - expected.abv) > resolvedTolerance + 0.5
  ) {
    abvStatus = "manual-review";
    ruleOutcomes.unshift({
      kind: "abv_cross_check_disagreement",
      detail: {
        aiAbv: parsed.abv,
        ocrAbv: ocrAbv.abv,
        expected: expected.abv,
      },
    });
  }
}
```

(Pass `abvStatus` to `buildFieldResult` instead of `status`.)

#### Step 1.4 — Pipeline wires the cross-check (net contents)

Same shape inside the net-contents block.

#### Step 1.5 — RuleOutcomeKind + templates

**Files:** Modify `lib/verify/types.ts`

Add `"abv_cross_check_disagreement"` and
`"net_contents_cross_check_disagreement"` to `RuleOutcomeKindSchema`.

**Files:** Modify `lib/verify/explain/templates.ts`

```ts
abv_cross_check_disagreement: ({ aiAbv, ocrAbv, expected }) =>
  `The vision model read ${num(aiAbv)}% ABV, but the OCR text on the label shows ${num(ocrAbv)}%. Expected ${num(expected)}%. Reviewer should compare the AI evidence quote to the actual artwork.`,
net_contents_cross_check_disagreement: ({ aiMl, ocrMl }) =>
  `The vision model read ${num(aiMl)} mL, but the OCR text shows ${num(ocrMl)} mL. Reviewer should compare the AI evidence to the artwork.`,
```

**Files:** Modify `lib/verify/explain/render.test.ts`

Add the two new kinds to `ALL_KINDS`.

#### Step 1.6 — Pipeline regression tests + commit

```ts
it("ABV cross-check: LLM says 38% but OCR rawText shows 45% → manual-review with cross_check_disagreement", async () => {
  const e = passingExtraction();
  e.alcoholContentText = { value: "38% Alc./Vol.", evidenceQuote: "38% Alc./Vol.", confidence: 0.99 };
  e.abvPercent = { value: 38, evidenceQuote: "38%", confidence: 0.99 };
  const result = await runVerificationPipeline({
    extracted: e,
    expected: { ...EXPECTED, abv: 45 },
    words: WORDS,
    rawText: "OLD TOM DISTILLERY\n45% Alc./Vol. (90 Proof)\n750 mL\n" + GOV_WARNING_CANONICAL,
    imageDims: { width: 1024, height: 1280 },
  });
  const abv = result.fieldResults.find((f) => f.field === "abv");
  // Without the cross-check this would be a strict fail (38 vs 45 = Δ 7 > 0.3 tolerance).
  // With the cross-check the OCR sees 45 which matches expected, so the LLM is the
  // suspect — demote to manual-review with the disagreement explanation.
  expect(abv?.status).toBe("manual-review");
  expect(abv?.outcomes[0]!.kind).toBe("abv_cross_check_disagreement");
});
```

Commit: `feat(verify): Tesseract cross-check on ABV + net contents (closes LLM-only-source gap)`

### Task 2 — Raw-OCR side-by-side in field row

#### Step 2.1 — Locate OCR text near the evidence

**Files:** Create `lib/verify/explain/locate-raw-ocr.ts`

Helper that takes `rawText` + an `evidenceQuote` and returns the
~80-char window of OCR text around the LLM's quote. Used by
`FieldRow` to render "OCR text near this region: ..." beneath the
evidence quote when AI and OCR disagree.

#### Step 2.2 — FieldRow renders the disagreement

**Files:** Modify `components/FieldRow.tsx`

Accept new optional prop `rawOcrDisagreement?: string`. When set,
render a small annotated diff under the evidence quote:

```
"38% Alc./Vol."  ← AI evidence
"45% Alc./Vol."  ← OCR text near this region (disagrees)
```

#### Step 2.3 — Pipeline passes the disagreement string

When the cross-check fires (Task 1), include the OCR raw text snippet
in the FieldResult so FieldRow can render it.

Commit: `feat(review): show raw OCR text inline when it disagrees with AI evidence`

### Task 3 — Confidence penalty when proof null on spirits

#### Step 3.1 — Pipeline overlay

In ABV block, after parsing:

```ts
if (
  parsed.abv !== null &&
  parsed.proof === null &&
  expected.beverageType === "distilled-spirits"
) {
  // Spirits labels universally show proof alongside ABV. Missing
  // proof means we couldn't run the consistency check, so the LLM's
  // ABV value is undefended — lower the displayed confidence so the
  // pill matches reality.
  aiConfidence = Math.min(aiConfidence, 0.7);
  ruleOutcomes.push({
    kind: "abv_proof_missing_no_consistency_check",
    detail: {},
  });
}
```

#### Step 3.2 — Template + test + commit

Commit: `feat(verify): lower ABV confidence when proof missing on spirits (no consistency-check defense)`

### Task 4 — Fallback model wiring

#### Step 4.1 — Route handler retry on low confidence

**Files:** Modify `app/api/extract-label/route.ts`

After primary extraction:

```ts
const STRICT_CONFIDENCE_FLOOR = 0.6;
const primaryNeedsRetry =
  extraction.data.extractionConfidence < STRICT_CONFIDENCE_FLOOR ||
  extraction.data.alcoholContentText.confidence < STRICT_CONFIDENCE_FLOOR ||
  extraction.data.netContents.confidence < STRICT_CONFIDENCE_FLOOR ||
  extraction.data.governmentWarningText.confidence < STRICT_CONFIDENCE_FLOOR;

let fallbackUsd = 0;
if (primaryNeedsRetry) {
  try {
    const fallback = await extractLabel(
      processedBuffer,
      env.OPENROUTER_MODEL_FALLBACK,
    );
    fallbackUsd = fallback.costUsd;
    // Field-by-field merge: keep whichever value has higher confidence.
    extraction.data = mergeByConfidence(extraction.data, fallback.data);
  } catch (cause) {
    // Fallback failure is non-fatal; we ship the primary extraction.
    console.warn("[extract-label] fallback retry failed", cause);
  }
}

// Track both costs in the response.
aiSpend: { primaryUsd: extraction.costUsd, fallbackUsd }
```

#### Step 4.2 — `mergeByConfidence` helper

**Files:** Create `lib/ai/merge-extractions.ts`

Pure helper that takes two `ExtractedLabelData` and picks per-field
the higher-confidence value. Tests cover the merge logic.

#### Step 4.3 — Commit

Commit: `feat(api): invoke fallback model on low-confidence primary extraction`

### Task 5 — Beverage-specific sanity bands

#### Step 5.1 — Failing tests + helper

**Files:** Create `lib/verify/strict/beverage-bands.test.ts` and
`lib/verify/strict/beverage-bands.ts`.

```ts
export const BEVERAGE_ABV_BANDS: Record<BeverageType, { min: number; max: number }> = {
  "distilled-spirits": { min: 15, max: 95 },
  wine: { min: 5, max: 25 },
  "malt-beverage": { min: 0.5, max: 20 },
  unknown: { min: 0, max: 100 }, // pass-through for unclassified
};

export function isAbvInBeverageBand(
  abv: number,
  beverageType: BeverageType,
): boolean {
  const band = BEVERAGE_ABV_BANDS[beverageType];
  return abv >= band.min && abv <= band.max;
}
```

#### Step 5.2 — Pipeline wires the band check

In ABV block, after parse:

```ts
if (
  parsed.abv !== null &&
  !isAbvInBeverageBand(parsed.abv, expected.beverageType)
) {
  abvStatus = "manual-review";
  ruleOutcomes.unshift({
    kind: "abv_out_of_beverage_band",
    detail: {
      foundAbv: parsed.abv,
      beverageType: expected.beverageType,
      band: BEVERAGE_ABV_BANDS[expected.beverageType],
    },
  });
}
```

#### Step 5.3 — Template + tests + commit

Commit: `feat(verify): demote out-of-band ABV (pre-LLM-error sanity check)`

### Task 6 — Quality gates + push

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm test:e2e
git push origin main
```

---

## 5. Touch list (cheat sheet)

```
NEW:
  lib/verify/strict/cross-check.ts
  lib/verify/strict/cross-check.test.ts
  lib/verify/strict/beverage-bands.ts
  lib/verify/strict/beverage-bands.test.ts
  lib/verify/explain/locate-raw-ocr.ts
  lib/ai/merge-extractions.ts
  lib/ai/merge-extractions.test.ts

MODIFIED:
  lib/verify/pipeline.ts                 (4 overlays)
  lib/verify/pipeline.test.ts            (regression tests for all 4)
  lib/verify/types.ts                    (4 new RuleOutcomeKind values)
  lib/verify/explain/templates.ts        (4 new templates)
  lib/verify/explain/render.test.ts      (cover new kinds)
  app/api/extract-label/route.ts         (fallback retry on low confidence)
  components/FieldRow.tsx                (render OCR-disagreement inline)

UNCHANGED:
  lib/verify/strict/abv.ts               (parser is fine — overlays sit in pipeline)
  lib/verify/strict/net-contents.ts      (same)
  lib/ai/openrouter.ts                   (extractLabel already takes model param)
```

---

## 6. Quality-gate checklist

- [ ] `pnpm typecheck` — clean
- [ ] `pnpm lint` — clean
- [ ] `pnpm vitest run` — green; expect ~660 unit tests (was 625; +35 across the new modules)
- [ ] `pnpm test:e2e` — green (no spec changes expected; behavior is internal)
- [ ] `pnpm eval:deterministic` — re-run to confirm gov-warning recall stays at 11/11

---

## 7. Edge cases & gotchas

- **Vercel / LLM-fallback path.** Tesseract is skipped on Vercel (ADR
  0007); `rawText` falls back to the LLM's gov-warning capture, which
  is mostly the warning text. The cross-check `scanRawTextForAbv` will
  find nothing in that text → returns null → no overlay fires. This
  is the intended degradation: cross-check works in local dev (where
  Tesseract runs) and gracefully no-ops on Vercel. **Document this
  trade-off in ADR 0010.**
- **OCR misreads its own digits.** Tesseract isn't perfect either.
  When OCR reads "38" but label is "45", the cross-check returns
  `(38, 38)` — both agree, no defense. This is partially mitigated by
  the new beverage-band check (Task 5) and the fallback model (Task
  4). Two-layer defense beats one.
- **Multiple ABV mentions on the label.** Wine sometimes shows
  "12.5%-13.5% Alc./Vol." plus a back-label "ALC. 12.7% BY VOL."
  `parseAbvText` returns the first match — needs the same first-match
  semantics in `scanRawTextForAbv`.
- **Tolerance window for cross-check disagreement.** The plan uses
  `tolerance + 0.5` so OCR-read-noise of ±0.5 pp (common with sharp's
  re-encoding) doesn't trigger false demotes. Tunable.
- **Beverage band edge cases.** "Distilled spirits" includes flavored
  liqueurs that can be as low as 15% (Bailey's-style). Setting the
  spirits min at 15% draws a line under that floor — anything below
  is almost certainly a misread. If a real product floats around
  14.5%, the band can be tightened later without UI changes.
- **Range expressions.** Wine's `12.5%-14% Alc./Vol.` returns the
  first endpoint today. If the application's expected ABV is `13.5%`
  the matcher would compare against 12.5 and Δ would be 1.0 — which
  is within the wine ≤ 14% tolerance of 1.5. So the field passes.
  Improving range support is its own future task; not in scope here.

---

## 8. Out-of-scope

- **DPI-based mm measurements** for § 16.22 type-size compliance —
  we lack DPI metadata for any image we receive (per the
  earlier-grader-audit ADR 0009 deferral).
- **Substantive class-type compliance** ("does this 38% spirit
  actually qualify as Bourbon?") — Marcus's "we're not looking to
  integrate" rules out external lookups.
- **ABV format-compliance** (one of three TTB-prescribed phrasings) —
  separate axis from value-match; ADR 0009 deferral list.
- **Range-expression preservation in the matcher.** Today it picks
  the first endpoint. Real wine reviewers know to spot-check the
  range, so manual-review is acceptable. Future improvement.

---

## 9. Definition of done

- A scenario that mocks `(LLM ABV: 38, OCR ABV: 45, expected: 45)`
  produces `abvStatus = manual-review` with the `abv_cross_check_
  disagreement` explanation showing both readings.
- A scenario with spirits ABV = 5% (impossible) produces
  `manual-review` with `abv_out_of_beverage_band`.
- The fallback model is invoked when `extractionConfidence < 0.6`,
  and the response carries both `primaryUsd` and `fallbackUsd > 0`
  in `aiSpend`.
- FieldRow shows raw-OCR text inline when AI and OCR disagree;
  hidden otherwise.
- ADR 0010 records the architectural shift (Tesseract becomes a
  cross-check on ABV/net-contents in addition to the gov-warning
  ground truth).
- vitest 660+ green; e2e 24/24 green; typecheck + lint clean.

---

## 10. Open questions for the reviewer

1. **Cross-check threshold: how strict?** The plan uses `tolerance +
   0.5` — but should an OCR-LLM disagreement of any size trip a
   review, or only when it changes the verdict? Conservative answer
   = trip on any disagreement past tolerance; loose answer = only
   when it would flip pass↔fail.
2. **Fallback model retry — when?** `extractionConfidence < 0.6` is
   one trigger; should we also retry when ABV cross-check
   disagrees? That introduces a feedback loop (LLM disagreement →
   re-extract → may still disagree). Probably bound to one retry
   max per request.
3. **Beverage-band edges.** Spirits min at 15% excludes some real
   products (cream liqueurs). Tighter min at 12% might be safer but
   risks letting more hallucinations through. Pick after one round
   of demo-data validation.
