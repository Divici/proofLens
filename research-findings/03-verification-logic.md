# 03 — Verification Logic Research

> Scope: PRD §20.3 — design the per-field comparison system that turns
> `(extracted_value, expected_value, ai_confidence)` into one of eight statuses
> (`Pass`, `Likely Match`, `Warning`, `Fail`, `Missing`, `Low Confidence`,
> `Needs Manual Review`, `Not Required`) with an explanation and an evidence pointer.
>
> Hard locked constraints carried into this doc:
>
> 1. Government-warning recall must be 100% — no missed strict-fail. The
>    gov-warning matcher is deterministic code, never an LLM judgment.
> 2. Every flag must carry an explanation: field, expected, found, why,
>    confidence, suggested action (PRD §8.4, §13.3).
> 3. Every field result must include an evidence reference back to the raw
>    extraction (text span and, when available, image bounding box).

---

## Executive recommendation (TL;DR)

**Adopt a hybrid pipeline that is deterministic by default and only escalates
to an LLM judge in a narrow, well-fenced "gray zone" for non-strict fields.**

- Strict fields (gov-warning, required prefix capitalization, ABV equality,
  net-contents equality after unit conversion) run on a pure deterministic
  rule ladder and cannot be overridden by the LLM.
- Nuanced fields (brand name, class/type, producer/bottler name, address)
  run on a deterministic match ladder first; only when the ladder lands in a
  configured "gray band" (e.g. `0.78 ≤ similarity < 0.92`) does an
  LLM-as-judge get invoked as a tie-breaker between `Likely Match` and `Fail`.
- Every status and explanation is produced from a typed `RuleOutcome` —
  templated, deterministic prose — so the audit trail is reproducible. The
  LLM judge, when used, returns a structured verdict that maps into the same
  template; its raw rationale is stored as auxiliary context, not as the
  primary explanation.

This satisfies the "do not delegate strict checks to an LLM" constraint while
still letting the system be smart about `Stone's Throw` vs `STONE'S THROW`.

---

## Q1 — Canonical text comparison for the government warning

### Problem

PRD §9.9 requires:

- `GOVERNMENT WARNING:` prefix is present, all-caps, with the colon.
- The full text matches the canonical 27 CFR §16.21 statement.
- Wording is not materially changed.
- Capitalization variants like `Government Warning:` must Fail.

The canonical text (per 27 CFR §16.21, confirmed via eCFR):

> GOVERNMENT WARNING: (1) According to the Surgeon General, women should not
> drink alcoholic beverages during pregnancy because of the risk of birth
> defects. (2) Consumption of alcoholic beverages impairs your ability to
> drive a car or operate machinery, and may cause health problems.

### Recommendation

Pure code, no library magic. The check has three layers, each producing a
separate `RuleOutcome` so the explanation can pinpoint exactly which layer
failed.

**Layer 1 — Prefix check (case-sensitive, deterministic).**
Substring search for the literal `GOVERNMENT WARNING:` (uppercase, single
space, colon) in the raw extracted text. If the lowercase `government warning`
appears but the exact uppercase form does not → Fail with reason
`"prefix_capitalization"`.

**Layer 2 — Body normalization (case-preserving for prefix, case-folded for body).**

Build a normalization pipeline that runs on both the canonical text and the
extracted body (everything after the `:`):

1. `String.prototype.normalize("NFKC")` — folds compatibility forms (ligatures
   like `ﬁ` → `fi`, full-width punctuation, etc.). Built into V8/Node, no
   library required. NFKC is preferred over NFC because OCR routinely emits
   compatibility characters.
2. Smart-quote and dash folding via a small explicit table:
   `’ ‘ ‛ ′` → `'`, `“ ” ‟ ″` → `"`, `– — ‐ ‑ ‒` → `-`, `…` → `...`.
   Keep this as a hand-maintained const map; do not depend on a library here
   because the rules are short and need to be auditable.
3. Strip Markdown / HTML defensively. If the OCR or vision model returns
   `**GOVERNMENT WARNING:**` or `<b>GOVERNMENT WARNING</b>`, strip with a
   single regex pass (`/<[^>]+>/g` and a small Markdown stripper such as
   `remove-markdown`). The fact that the OCR added bold markup is itself
   evidence the warning was bolded on the label — capture that as a
   side-channel boolean, do not let it leak into the comparison.
4. Whitespace canonicalization: collapse runs of `\s+` (including
   non-breaking space ` `, zero-width space `​`, Unicode
   line/paragraph separators) to a single ASCII space; trim.
5. Case fold the body with `.toLocaleLowerCase("en-US")`. The prefix check
   in Layer 1 already enforced uppercase; Layer 2 only validates wording.

After normalization, compare body strings byte-for-byte. Any diff →
`Fail` with reason `"wording_mismatch"` and a token-level diff in the
explanation (use a small inline LCS diff so the agent sees the exact words).

**Layer 3 — Tolerant near-miss check (for diagnostics only).**
Compute Damerau-Levenshtein distance between the normalized strings. If the
strict body match failed but distance ≤ 3 chars on a ~250-char string,
include `"near_canonical_text"` as a secondary signal in the explanation
("found wording is 99% identical but differs in N characters at position
X"). This never upgrades the status — it only enriches the message so the
agent immediately sees whether it is a typo or a totally different warning.

### Library choices for Q1

- **Built-in `String.prototype.normalize("NFKC")`** for Unicode normalization.
  No external dep required, full ECMAScript support.
- **`remove-markdown`** (npm, ~3 kB) for defensive Markdown stripping.
  Optional — a 10-line regex stripper works for our subset.
- **`fastest-levenshtein`** for Layer 3 diagnostic distance (fastest JS
  implementation; benchmarks show ~78k ops/sec on short strings vs
  ~46k for js-levenshtein).

### Rejected for Q1

- `unorm` — superseded by built-in `String.prototype.normalize`.
- `fuse.js` — designed for fuzzy *search* over a corpus, not 1:1
  exact-match validation; the wrong tool for a strict check.
- Any LLM-as-judge step on the gov-warning. Locked out by constraint.

---

## Q2 — Match-ladder pattern for nuanced fields

### Problem

`Stone's Throw Distillery` vs `STONE'S THROW DISTILLERY` should be a `Pass` or
`Likely Match`, not a `Fail`. `Stone's Throw` vs `Stones Throw` (missing
apostrophe from OCR) should also pass. `Stone's Throw` vs `Stone Bridge`
should fail.

### Recommended ladder

Each rung produces a `RuleOutcome`. The ladder short-circuits on the first
strong signal. Outcomes accumulate so the explanation can say "matched after
case-fold + punctuation strip."

```
Rung 0  exact equality                         → Pass        (sim = 1.00)
Rung 1  NFKC + smart-quote/dash fold + trim    → Pass        (sim = 1.00)
Rung 2  + case fold (en-US locale)             → Pass        (sim = 1.00)
Rung 3  + strip non-alphanumeric punctuation   → Likely Match
Rung 4  + collapse repeated whitespace         → Likely Match
Rung 5  token-set ratio (rapidfuzz-style)      → Likely Match if ≥ 0.92
Rung 6  Damerau-Levenshtein normalized ratio   → Likely Match if ≥ 0.88
                                               → Gray zone   if 0.78–0.88
                                               → Fail        if < 0.78
```

The rung thresholds are tunable per field type. Brand names and class/type
designations get the strict 0.92 token-set bar (short, identity-bearing).
Producer/bottler addresses get a looser bar (0.85) because they include
formatting noise (`Suite 4` vs `Ste 4`, `St.` vs `Street`).

### Library choice for Q2

**Recommend `fuzzball` (fuzzball.js).** It is a faithful port of Python's
`fuzzywuzzy` / `rapidfuzz` semantics, with `ratio`, `partial_ratio`,
`token_sort_ratio`, `token_set_ratio`, and `partial_token_set_ratio`. All
return 0–100 scores. It is the only mainstream JS library that gives us the
full token-set arsenal needed for short identity strings. TypeScript types
ship with the package (`fuzzball.d.ts`).

Concretely:

- `token_set_ratio` — for "Stone's Throw Distillery, LLC" vs
  "Stone's Throw Distillery" (handles extra/missing tokens).
- `partial_ratio` — for "Stone's Throw" appearing as a substring of a
  longer extracted phrase.
- `ratio` — for the Damerau-Levenshtein-style similarity at Rung 6
  (fuzzball's `ratio` is Indel-distance based, which is appropriate for
  OCR insertion/deletion noise).

### Rejected for Q2

- **`fuse.js`** — excellent fuzzy search, but it returns scores tied to
  Bitap/index-based search; it is awkward to use as a 1:1 similarity
  function and lacks token-set semantics.
- **`string-similarity`** — Dice coefficient only; not enough variety
  for a multi-rung ladder.
- **Pure `fastest-levenshtein`** — fast but only returns raw edit
  distance; we would have to reimplement token-set ratio ourselves.
- **Jaro-Winkler-only** — over-rewards prefix matches; bad for brand
  pairs that share a generic prefix (`Old Forester` vs `Old Fitzgerald`).

---

## Q3 — ABV / proof equivalence

### Problem

Strings on labels include all of:
`45% Alc./Vol.`, `45% ABV`, `Alcohol 45% by Volume`, `90 Proof`, `45.0%`,
`45 % alc./vol.`, `12.5%alc/vol`, and even `40 Proof / 20% Alc by Vol`.

### Recommendation

Build a small dedicated parser. No library exists for this domain; we own
the regex. The parser returns a normalized record:

```
{ abvPct: number | null, proof: number | null, raw: string,
  source: "abv" | "proof" | "both" | "none",
  warnings: string[] }
```

Two regex passes plus a unit reconciliation step:

1. **ABV pattern (case-insensitive):**
   `/(\d{1,2}(?:\.\d{1,2})?)\s*%\s*(?:abv|alc(?:ohol)?\.?(?:[\s/.]*(?:by\s*)?vol(?:ume)?\.?)?)?/i`
2. **Proof pattern (case-insensitive):**
   `/(\d{1,3}(?:\.\d{1,2})?)\s*proof/i`
3. **Reconciliation:** if both forms are present on the same label,
   verify `abv * 2 ≈ proof` within ±0.05 absolute tolerance. If they
   disagree → emit `Warning` with a reason explaining the inconsistency.

For comparison against expected:

- Compare `abvPct` numerically. PRD §10.3 implies ABV equality is strict;
  we use an absolute tolerance of `0.1` percentage points to absorb
  rounding (`12.5%` vs `12.50%` vs `12.4%` should all match `12.5`,
  which agrees with TTB tolerance bands for distilled spirits at
  ≤100 proof: ±0.15% ABV).
- If only `proof` is on the label and expected was given in ABV,
  convert via `abv = proof / 2` (US convention) before comparing.

### Library choice for Q3

**No library — own the regex.** This is exactly the kind of domain-specific
parsing where a generic library introduces more risk than it removes. The
regex is short, testable, and easy to property-test.

### Rejected for Q3

- `units-converter` / `convert-units` — no ABV concept; `%` is dimensionless.
- An LLM parser — overkill, slow, and non-deterministic for what is
  essentially `\d+(\.\d+)?\s*%`.

---

## Q4 — Volume / net-contents equivalence

### Problem

`750mL`, `750 mL`, `750ml`, `0.75 L`, `25.36 fl oz`, `25.4 fl. oz.`, and
`750 ML` should all be equivalent. Tolerance for cross-unit comparison
should be ~0.1% to allow for the rounding inherent in `750 mL ≈ 25.36 fl oz`
(actual: 25.3605...).

### Recommendation

Two-stage approach:

1. **Tokenize** the extracted value with a regex that captures
   `(numeric)(unit)` where `unit ∈ {ml, mL, l, L, cl, fl oz, fl. oz., oz}`
   plus tolerated separators. Normalize the unit via a small lookup table.
2. **Convert to canonical milliliters** using `convert-units` (npm).
   It supports `ml`, `l`, `cl`, `fl-oz`, `pnt`, `qt`, `gal` out of the
   box, has TypeScript types, and the API is `convert(750).from('ml').to('fl-oz')`.
3. **Compare** in canonical mL with relative tolerance: `|a - b| / max(a, b) ≤ 0.001`.
   This treats `750 mL` and `25.36 fl oz` (= 750.0028 mL) as identical.

If the expected value uses one unit system and the extracted value uses
another, the explanation should call that out: `"expected 750 mL,
found 25.36 fl oz (≈ 750.00 mL); equivalent within 0.001 tolerance"`.

### Library choice for Q4

**Recommend `convert-units`.** Maintained, has first-class TS types
(`Measure`, `System`, `Unit`), supports the volume units we need, and is
small.

`js-quantities` is more powerful (handles compound units, dimensional
analysis) but its API is heavier and we do not need any of that.

### Rejected for Q4

- `js-quantities` — over-spec'd for our needs.
- Pure custom math — works, but `convert-units` gives us a small
  insurance layer of correct ratios maintained by someone else and
  trivially supports adding `cl` or `gal` later.

---

## Q5 — Confidence representation and the 8-state status enum

### Problem

The vision model returns a per-field confidence (0.0–1.0). We need a
deterministic mapping from `(matchStrength, aiConfidence, fieldRequirement)`
to one of `{Pass, Likely Match, Warning, Fail, Missing, Low Confidence,
Needs Manual Review, Not Required}`.

### Recommendation: a 2D decision matrix

Treat status as a function of two orthogonal axes:

```
                    matchStrength ──►
                  Strong       Mid        Weak       None
aiConfidence        ≥0.92    0.78–0.92   <0.78      n/a
   ▲
 High (≥0.85)      Pass     Likely Match  Fail      Missing
 Mid  (0.60–0.85)  Pass     Likely Match  Warning   Missing
 Low  (<0.60)      LowConf  LowConf      LowConf    Missing
```

Special overlays:

- If the field is `Not Required` for the beverage class (e.g. ABV on a
  beer below the labeling threshold), short-circuit to `Not Required`
  and skip the matrix entirely.
- If `aiConfidence < 0.40` OR the image-quality signal is `poor`,
  override any non-`Pass` cell to `Needs Manual Review` and emit
  `"Request Better Image"` as the suggested action.
- For strict fields (gov-warning, required-prefix capitalization,
  ABV equality after numeric tolerance), the matrix collapses to
  `{Pass, Fail, Missing, Low Confidence}`. There is no `Likely Match`
  on a strict field.

### Threshold provenance

The thresholds are anchored to industry norms surfaced in the literature:

- IronOCR's published bands: 90–100 excellent, 80–89 good, 70–79
  moderate, <70 review/reprocess. We adopt 0.85 / 0.60 (slightly more
  conservative because we are rolling up to a binary compliance call).
- Tesseract community guidance: 95 unusable / 99 correct → review band
  97.5–98.5. Our `Low Confidence` floor at 0.60 is intentionally
  permissive on the AI-confidence axis because the ladder's match
  strength is the dominant signal; AI confidence acts as a damper.
- Microsoft Document Intelligence: 0.7–0.9 minimum threshold range
  depending on use-case strictness.

The thresholds live in a single `verification-thresholds.ts` constants
file so calibration runs (Q8) can sweep them.

---

## Q6 — LLM-as-judge for ambiguous brand matches

### Recommendation

**Use it, but only inside the gray band of the deterministic ladder, only
for non-strict fields, and only with a structured-output contract.**

### Where it runs

After Rung 6 of the match ladder (Q2), if the normalized similarity falls
in the configured gray band (default `0.78 ≤ s < 0.92`), invoke the
judge. The judge gets:

- The expected value (from the application).
- The extracted value (from the label).
- The match-ladder transcript (which rungs ran, what they produced).
- A small set of in-context exemplars: 4–6 known equivalences and 4–6
  known non-equivalences specific to alcohol-label nomenclature
  (`Jack Daniel's` ≡ `JACK DANIELS`, `Old Forester` ≢ `Old Fitzgerald`,
  etc.).

### Where it does NOT run

- Government warning text (locked out).
- Required prefix capitalization (locked out).
- ABV / proof numeric equality (locked out — numbers belong to math).
- Net contents (locked out — units belong to the unit converter).
- Any field where the deterministic ladder already produced a confident
  `Pass` or confident `Fail`.

### Prompt contract

The judge returns *only* a structured verdict; its prose is not the
explanation surfaced to the agent.

```
You are an alcohol-label compliance assistant. Decide whether two
brand/producer/class strings refer to the same entity on a TTB COLA label.

Return JSON only:
{
  "verdict": "equivalent" | "not_equivalent" | "uncertain",
  "reason_code": "case_only" | "punctuation_only" | "ocr_typo" |
                 "abbreviation" | "different_entity" | "ambiguous",
  "rationale": "one sentence, ≤ 30 words"
}

Rules:
- Case differences alone → equivalent.
- Punctuation differences alone → equivalent.
- Single-character OCR-plausible typos → equivalent only if the
  surrounding tokens match.
- Different distinguishing tokens (e.g. "Old Forester" vs "Old
  Fitzgerald") → not_equivalent.
- If you are not confident → uncertain. Do not guess.
```

### Mapping the verdict to status

- `equivalent` → upgrade from gray to `Likely Match`.
- `not_equivalent` → downgrade from gray to `Fail`.
- `uncertain` → `Needs Manual Review` with the rationale attached.

### Known failure modes (from the literature)

- **Positional bias / verbosity bias** — judges over-favor longer or
  first-listed candidates. Mitigation: randomize order of expected/
  extracted on every call; we are scoring equivalence, not ranking.
- **Hallucinated equivalences** — judges sometimes invent rationales
  ("these are both subsidiaries of X"). Mitigation: the
  `reason_code` enum forces the model into a closed set; any
  free-form justification beyond the enum is discarded.
- **Self-consistency drift** — same input, different verdict on
  different calls. Mitigation: temperature 0, deterministic seed
  if available, plus a small cache keyed on
  `(normalized_expected, normalized_extracted, prompt_version)`.
- **Calibration drift across model versions** — model upgrades silently
  shift the gray-band behavior. Mitigation: pin model version, and
  re-run the regression eval (Q8) on every model bump.

### Pros / cons summary

Pros: catches the long tail of human-obvious equivalences the ladder
misses (`St.` vs `Saint`, `&` vs `and`, `Co.` vs `Company`); produces
explainable `reason_code` we can render to the agent.

Cons: cost and latency per ambiguous field (mitigated by gray-band
gating — most fields never reach the judge); risk of silent drift
(mitigated by the eval harness); zero added value on strict fields.

---

## Q7 — Determinism vs explainability tradeoff

### Recommendation: template-based explanations from typed RuleOutcomes, with optional LLM-generated prose as a secondary, clearly-labeled field.

### The `RuleOutcome` shape

Every rung of every check produces a typed outcome:

```ts
type RuleOutcome = {
  rule: "gov_warning_prefix" | "gov_warning_body" | "abv_numeric"
      | "volume_canonical" | "ladder_rung_2_case_fold" | ...
  passed: boolean
  similarity?: number          // 0..1, when meaningful
  detail: {
    // rule-specific structured payload
    expected?: string
    found?: string
    diff?: TokenDiff
    distance?: number
    canonicalMl?: { expected: number, found: number, deltaPct: number }
  }
}
```

The status engine consumes the array of outcomes and emits:

```ts
type FieldResult = {
  field: string
  status: Status                         // 8-state enum
  expected: string | null
  found: string | null
  confidence: number                     // ai confidence × match strength
  explanation: string                    // template-rendered
  suggestedAction: string                // template-rendered
  evidence: EvidenceRef                  // see below
  outcomes: RuleOutcome[]                // full audit trail
  llmJudge?: LlmJudgeVerdict             // present only if invoked
  humanOverride?: HumanOverride          // present only post-review
}
```

### Why templates, not LLM prose, for the primary explanation

1. **Reproducibility.** Same inputs → same explanation, byte-for-byte.
   Auditors care about this.
2. **Latency.** Gov-warning fail can render in <1 ms vs an extra LLM
   round-trip.
3. **No hallucination risk on the audit-facing message.** The literature
   on AI audit trails (Swept AI, Lucinity, FINOS Air-Governance) is
   unanimous: compliance-grade explanations must be sourced from
   verifiable rules, not free-form generation.
4. **Localization.** Template strings are i18n-ready trivially.

### Templates to build

A small registry mapping `rule → template`:

```
gov_warning_prefix   "Required prefix 'GOVERNMENT WARNING:' must be
                     uppercase. Found: '{found}'."
gov_warning_body     "Warning text differs from canonical 27 CFR §16.21.
                     {diff_summary}"
ladder_pass_caseonly "Match after case-fold only — content is identical."
ladder_likely        "Match after {transformations}; similarity
                     {sim}%."
abv_mismatch         "Expected {expected}% ABV, found {found}%
                     (Δ {delta} pp, tolerance ±0.1)."
volume_equivalent    "Expected {expected}, found {found}
                     (≈ {found_ml} mL, equivalent within 0.1%)."
```

### Where LLM-generated prose is allowed

As a *secondary* `narrativeExplanation` field for the agent's reading
comfort, only on `Needs Manual Review` rows, clearly labeled
"AI summary — verify before relying." The audit-of-record is always
the templated `explanation`.

### Evidence reference shape

```ts
type EvidenceRef = {
  rawTextSpan: { start: number, end: number }    // into raw OCR
  imageBox?: { x: number, y: number,
               w: number, h: number,
               page: number }                    // when vision model returns it
  extractionPass: "vision" | "ocr_fallback" | "ensemble"
  extractionConfidence: number
}
```

The evidence ref is populated by the extraction layer (Q1 of doc 02 in
this folder, when written) and threaded through the verification layer
unchanged.

---

## Q8 — Test data generation

### Recommendation: layered test strategy with property-based testing as the backbone.

### Layer A — Golden corpus (snapshot tests)

A hand-curated set of `~50` `(extracted, expected, expectedStatus,
expectedReason)` tuples, including:

- Every PRD scenario (§9.9 examples, §scenarios 1–5).
- Real TTB COLA examples scraped from public records.
- Adversarial cases: `government warning:` (lowercase),
  `GOVERNMENT WARNING.` (period instead of colon),
  body with one swapped word.
- Beverage-class variants: beer, wine, distilled spirits.

Run via Vitest snapshot tests; updates require explicit `--update`.

### Layer B — Property-based tests with `fast-check`

Use `fast-check` (the de-facto JS QuickCheck port; trusted by jest,
io-ts, ramda, query-string).

Example properties:

```ts
// Property: case-only differences should always Pass on brand fields.
fc.assert(fc.property(brandNameArbitrary(), (name) => {
  const upper = name.toUpperCase()
  const result = verifyField('brand', { expected: name, found: upper })
  return result.status === 'Pass' || result.status === 'Likely Match'
}))

// Property: any single inserted ASCII punctuation character should not
// flip a Pass to a Fail on non-strict fields.
fc.assert(fc.property(brandNameArbitrary(),
  fc.constantFrom('.', ',', '-', "'", '"'),
  fc.nat(),
  (name, punct, idx) => {
    const i = idx % (name.length + 1)
    const corrupted = name.slice(0, i) + punct + name.slice(i)
    const r = verifyField('brand', { expected: name, found: corrupted })
    return r.status !== 'Fail'
  }))

// Property: gov-warning canonical text always Passes; a single
// random word substitution always Fails.
```

Custom arbitraries:

- `brandNameArbitrary()` — drawn from a real seed list with random
  case folding, punctuation perturbation, whitespace noise.
- `abvStringArbitrary()` — a generator over the regex grammar in Q3.
- `volumeStringArbitrary()` — same for Q4.
- `govWarningCorruptionArbitrary()` — applies one of {drop char,
  swap chars, lowercase prefix, drop sentence (1) or (2),
  smart-quote substitution} to the canonical text.

### Layer C — Mutation / fuzz harness for the gov-warning matcher

Specifically because gov-warning recall must be 100%, run a bounded
mutation harness on every CI run that applies single-edit mutations
(insert/delete/substitute) to the canonical text and asserts the
matcher detects each one. This is the strongest guarantee we can
build without formal verification.

### Layer D — Regression eval for the LLM judge

For the gray-band judge, maintain a `~200`-pair labeled eval set
(equivalent / not_equivalent / uncertain). Run on every prompt
change and every model-version bump. Track precision and recall on
the `equivalent` class; gate merges on no-regression.

### Library choices for Q8

- **`fast-check`** for property-based testing.
- **`vitest`** for snapshot + property test runner.
- **`promptfoo`** (optional) for the LLM judge regression eval — it
  natively supports the `expected.json` schema we want.

---

## Q9 — Open-source / academic prior art

### Closest analogs

- **KYC / ID verification** vendors (Veriff, Sumsub, Fenergo, KYC Chain,
  Incode) all converge on the same shape: deterministic CIP rules
  auto-clear the easy cases, edge cases get analyst review.
  "Deterministic matches auto-clear low-risk users; analysts focus on
  true edge cases" — exactly the pattern we are adopting.
- **AML transaction screening** (sanctions name-match): the canonical
  pattern is OFAC-style normalization → token-set ratio →
  threshold-banded analyst review. Same shape as our Q2 ladder.
- **HL7 / pharma name matching**: token-set ratio + edit distance with
  domain-specific synonym lists is the standard.
- **Confidence-aware OCR error detection** (arXiv 2409.04117) — frames
  exactly our problem of mapping OCR confidence to a downstream
  decision; informs Q5 thresholds.
- **Audit-trail explainability literature** (FINOS Air-Governance,
  Swept AI insurance spec, Lucinity for FinCrime copilots) —
  consistently recommends rule-sourced explanations over LLM prose
  for compliance-of-record. Informs Q7.

### Useful libraries / tools beyond what we adopted

- **`promptfoo`** — open-source LLM eval harness, ideal for Q8 Layer D.
- **`langfuse`** — LLM observability with explicit "LLM-as-a-judge"
  primitives. Useful if we want to capture and replay judge calls.
- **`zod`** — for typing the `RuleOutcome`, `FieldResult`, and judge
  response. Already implied by our TypeScript-first stack but worth
  flagging.

### Papers worth citing in the README's tradeoffs section

- *Confidence-Aware Document OCR Error Detection* (arXiv 2409.04117).
- *Audit Trails for Accountability in Large Language Models* (arXiv).
- TTB regulatory text: 27 CFR Part 16, especially §16.21.

---

## Recommended verification pipeline

```
                          ┌────────────────────────────┐
                          │   Vision/OCR Extraction    │
                          │   (out of scope here;      │
                          │    PRD §9.2 / doc 02)      │
                          └─────────────┬──────────────┘
                                        │
                                        ▼
                  ┌──────────────────────────────────────────┐
                  │  ExtractedField {                        │
                  │    fieldName,                            │
                  │    rawValue: string,                     │
                  │    aiConfidence: 0..1,                   │
                  │    evidence: EvidenceRef (text span +    │
                  │              optional bbox)              │
                  │  }                                       │
                  └─────────────┬────────────────────────────┘
                                │
                                ▼
                ┌─────────────────────────────────┐
                │   Field Router                  │
                │   "is this field required for   │
                │    this beverage class?"        │
                └─┬───────────────────────────────┘
                  │
        Not Required│             Required│
                  ▼                       ▼
        ┌──────────────────┐    ┌─────────────────────────┐
        │ status =         │    │  Strict?                │
        │   "Not Required" │    │  (gov_warning,          │
        └──────────────────┘    │   prefix_caps,          │
                                │   abv_numeric,          │
                                │   net_contents)         │
                                └──┬─────────────────┬────┘
                                   │                 │
                              YES  ▼            NO   ▼
                  ┌────────────────────────┐   ┌─────────────────────────┐
                  │ STRICT PIPELINE        │   │ NUANCED PIPELINE        │
                  │ (deterministic only)   │   │                         │
                  │                        │   │  Match Ladder           │
                  │  gov_warning:          │   │   Rung 0  exact         │
                  │    L1 prefix check     │   │   Rung 1  NFKC + quote  │
                  │    L2 NFKC+normalize+  │   │   Rung 2  case fold     │
                  │       diff             │   │   Rung 3  strip punct   │
                  │    L3 near-miss diag   │   │   Rung 4  ws collapse   │
                  │                        │   │   Rung 5  token_set     │
                  │  abv:                  │   │   Rung 6  edit ratio    │
                  │    parse → numeric     │   │                         │
                  │    eq ± 0.1 pp         │   │   sim ≥ 0.92  → strong  │
                  │                        │   │   0.78 ≤ s < 0.92 gray  │
                  │  volume:               │   │   sim < 0.78  → weak    │
                  │    parse → mL canon    │   │                         │
                  │    eq ± 0.1%           │   └─────────┬───────────────┘
                  └──────────┬─────────────┘             │
                             │                  Strong   │   Gray   │  Weak
                             │                     │     │    │    │   │
                             │                     ▼     │    ▼    │   ▼
                             │              (skip judge) │ LLM JUDGE│ (skip)
                             │                           │ (gated,  │
                             │                           │  cached, │
                             │                           │  temp 0) │
                             │                           │    │    │
                             │                           │    ▼    │
                             │                           │ verdict ∈│
                             │                           │ {equiv,  │
                             │                           │  not_eq, │
                             │                           │  uncert} │
                             │                           │          │
                             ▼                           ▼          ▼
                  ┌─────────────────────────────────────────────────────┐
                  │ Status Engine                                       │
                  │   inputs:  outcomes[], aiConfidence,                │
                  │            imageQuality, judgeVerdict?              │
                  │   matrix:  Q5 2-D table + strict-field collapse +   │
                  │            low-quality override                     │
                  │   outputs: status ∈ 8-state enum                    │
                  └────────────────────────┬────────────────────────────┘
                                           │
                                           ▼
                  ┌─────────────────────────────────────────────────────┐
                  │ Explanation Renderer                                │
                  │   selects template by (rule, status, outcomes)      │
                  │   fills slots from RuleOutcome.detail               │
                  │   appends evidence ref pointer                      │
                  │   (optional) attaches narrativeExplanation from     │
                  │   LLM, clearly labeled "AI summary"                 │
                  └────────────────────────┬────────────────────────────┘
                                           │
                                           ▼
                  ┌─────────────────────────────────────────────────────┐
                  │ FieldResult {                                       │
                  │   field, status, expected, found, confidence,       │
                  │   explanation, suggestedAction,                     │
                  │   evidence (text span + bbox),                      │
                  │   outcomes (full rule trail),                       │
                  │   llmJudge? (verdict + reason_code if invoked),     │
                  │   humanOverride? (post-review)                      │
                  │ }                                                   │
                  └────────────────────────┬────────────────────────────┘
                                           │
                                           ▼
                  ┌─────────────────────────────────────────────────────┐
                  │ Overall Roll-up (PRD §9.6)                          │
                  │   any Fail → Fail                                   │
                  │   any LowConf/poor-image → Request Better Image     │
                  │   any Warning/LikelyMatch/NeedsReview → NMR or PWW  │
                  │   else → Pass                                       │
                  └─────────────────────────────────────────────────────┘
```

---

## Library/dependency summary

| Concern                        | Choice                  | Notes                                   |
|--------------------------------|-------------------------|-----------------------------------------|
| Unicode normalization          | `String.prototype.normalize("NFKC")` | Built-in, no dep             |
| Markdown stripping (defensive) | `remove-markdown`       | Optional; ~3 kB                         |
| Damerau/Levenshtein distance   | `fastest-levenshtein`   | Fastest JS impl for short strings       |
| Token-set / partial / fuzz ratio | `fuzzball`            | rapidfuzz-style API; TS types included  |
| Volume unit conversion         | `convert-units`         | TS types; mL/L/cl/fl-oz/qt/gal          |
| ABV / proof parsing            | hand-rolled regex       | Domain-specific; no library fits        |
| Schema typing                  | `zod`                   | RuleOutcome, FieldResult, judge shape   |
| Property-based testing         | `fast-check`            | De-facto JS QuickCheck                  |
| Test runner                    | `vitest`                | Snapshot + property tests               |
| LLM judge eval harness         | `promptfoo`             | Optional but recommended                |

---

## Risks and mitigations

| Risk                                              | Mitigation                                             |
|---------------------------------------------------|--------------------------------------------------------|
| Gov-warning matcher misses a near-miss            | Layered checks + mutation fuzz harness in CI           |
| LLM judge drifts on model upgrade                 | Pinned model version + 200-pair regression eval        |
| OCR returns Markdown bold and breaks comparison   | Defensive Markdown/HTML strip pre-normalization        |
| Smart-quote variants on labels (especially imports) | NFKC + explicit smart-quote/dash fold table          |
| Threshold over-fitting to seed corpus             | Property-based tests + held-out eval set               |
| Ambiguous beverage-class field requirements       | Field router driven by an explicit per-class rule map  |
| Agents distrust opaque AI-only explanations       | Templated, rule-sourced explanations as audit-of-record |

---

## Sources

- TTB / 27 CFR — [27 CFR Part 16](https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16),
  [27 CFR §16.21 mandatory label info](https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16/subpart-C/section-16.21),
  [TTB Malt Beverage Health Warning](https://www.ttb.gov/regulated-commodities/beverage-alcohol/beer/labeling/malt-beverage-health-warning),
  [TTB Distilled Spirits Health Warning](https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/ds-labeling-home/ds-health-warning).
- Unicode normalization — [MDN String.prototype.normalize](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize),
  [UAX #15](https://unicode.org/reports/tr15/),
  [ICU Normalization](https://unicode-org.github.io/icu/userguide/transforms/normalization/).
- Fuzzy match libraries — [fuzzball.js](https://github.com/nol13/fuzzball.js),
  [fastest-levenshtein benchmark](https://npm-compare.com/fuse.js,fuzzyset.js,jaro-winkler,leven,string-similarity,string-similarity-js),
  [fuse.js](https://www.fusejs.io/),
  [RapidFuzz docs (reference for token-set semantics)](https://rapidfuzz.github.io/RapidFuzz/Usage/fuzz.html).
- Unit conversion — [convert-units](https://www.npmjs.com/package/convert-units),
  [js-quantities](https://www.npmjs.com/package/js-quantities).
- Confidence thresholds — [IronOCR confidence guide](https://ironsoftware.com/csharp/ocr/how-to/tesseract-result-confidence/),
  [Microsoft Document Intelligence accuracy](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept/accuracy-confidence?view=doc-intel-4.0.0),
  [Confidence-Aware Document OCR Error Detection (arXiv 2409.04117)](https://arxiv.org/html/2409.04117v1).
- LLM-as-judge — [Langfuse LLM-as-a-Judge](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge),
  [Datadog hallucination detection](https://www.datadoghq.com/blog/ai/llm-hallucination-detection/),
  [EvidentlyAI judge guide](https://www.evidentlyai.com/llm-guide/llm-as-a-judge),
  [Promptfoo judge guide](https://www.promptfoo.dev/docs/guides/llm-as-a-judge/),
  [Informed: ChatGPT for Employer Name Matching](https://informediq.com/from-hallucination-to-validation-optimizing-chatgpt-for-employer-name-matching/).
- Property-based testing — [fast-check](https://github.com/dubzzz/fast-check),
  [fast-check docs](https://fast-check.dev/).
- Audit / explainability — [Swept AI audit trail](https://www.swept.ai/ai-audit-trail),
  [Lucinity GenAI auditability](https://lucinity.com/blog/ensuring-explainability-and-auditability-in-generative-ai-copilots-for-fincrime-investigations),
  [FINOS AI Governance: Agent Decision Audit](https://air-governance-framework.finos.org/mitigations/mi-21_agent-decision-audit-and-explainability.html).
- KYC / ID verification prior art — [Veriff KYC docs](https://www.veriff.com/kyc/list-of-acceptable-kyc-documents),
  [Sumsub KYC guide](https://sumsub.com/blog/kyc-guide/),
  [KYC-Chain data verification](https://kyc-chain.com/data-verification-kyc-us/).
