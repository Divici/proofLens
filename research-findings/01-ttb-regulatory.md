# Loop 0 Research: TTB Regulatory

> Scope: Federal labeling rules that proofLens must encode for beer (malt beverages), wine, distilled spirits, and "other / unknown." All citations are to Title 27 of the Code of Federal Regulations (the "27 CFR"), as published on eCFR. Where the modernized 2022 regulations (T.D. TTB-176, 87 FR 7579) reorganized Parts 5 and 7, this document uses the *current* numbering. Wine Part 4 has not been modernized as of this writing and retains its 1960-vintage section numbers.

---

## Q1 — Canonical Government Warning Text (27 CFR § 16.21)

### Finding (the canonical string proofLens must exact-match against)

The Alcoholic Beverage Labeling Act of 1988 (ABLA), implemented by 27 CFR Part 16, requires the *exact* following statement on the brand label, separate front label, or a back/side label of every alcoholic beverage container bottled or imported for sale or distribution in the United States on or after **November 18, 1989** (27 CFR § 16.20).

Verbatim from 27 CFR § 16.21 (quoted directly from the eCFR HTML extract — note the regulation prints it as two paragraphs, with `(1)` ending one paragraph and `(2)` starting the next):

```
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
```

Character-level invariants that proofLens must enforce (these are the things a strict matcher must NOT silently normalize away):

- The literal prefix `GOVERNMENT WARNING:` — 19 characters, all-caps, ending in a colon, followed by a single ASCII space.
- `(1)` and `(2)` are parenthesized digits with no internal spaces; each is followed by a single space before the next word.
- A comma after `Surgeon General` — i.e., `Surgeon General, women`.
- A comma after `or operate machinery` — i.e., `operate machinery, and may cause health problems`.
- Sentence-final period after `birth defects.` and after `health problems.`
- US spelling throughout: `defects` (not `defects.`-with-British "ce"), `machinery` (no British alternative).
- No Oxford comma inside `to drive a car or operate machinery` (the comma there is the *clausal* comma before `and may cause`, not a list comma).

### Type-size, capitalization, contrast, and placement (27 CFR § 16.22)

Pulled verbatim from § 16.22:

- **Capitalization / weight (§ 16.22(a)(2)):** "The first two words of the statement required by § 16.21, *i.e.*, 'GOVERNMENT WARNING,' shall appear in capital letters and in bold type. The remainder of the warning statement may not appear in bold type."
- **Contrast (§ 16.22(a)(1)):** Statement "shall be on a contrasting background."
- **Compression (§ 16.22(a)(3)):** Letters/words may not be compressed such that the warning is not readily legible.
- **Maximum characters per inch (§ 16.22(a)(4)):**

  | Minimum required type size | Max characters per inch |
  |---|---|
  | 1 mm | 40 |
  | 2 mm | 25 |
  | 3 mm | 12 |

- **Minimum type size by container volume (§ 16.22(b)):**

  | Container size | Minimum type size |
  |---|---|
  | ≤ 237 mL (8 fl. oz.) | 1 mm |
  | > 237 mL up to 3 L (101 fl. oz.) | 2 mm |
  | > 3 L | 3 mm |

- **Placement (§ 16.21):** "On the brand label or separate front label, or on a back or side label, **separate and apart from all other information**."
- **Affixation (§ 16.22(c)):** Non-integral labels must be affixed so they cannot be removed without thorough application of water or other solvents.

### Sources

- Primary: eCFR, 27 CFR § 16.21 — https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16/subpart-C/section-16.21 (extracted verbatim from the HTML body 2026-04-29)
- Primary: eCFR, 27 CFR § 16.22 — https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16/subpart-C/section-16.22
- Primary: eCFR, 27 CFR § 16.20 (applicability) — https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16/subpart-C/section-16.20
- Primary: eCFR, 27 CFR § 16.10 (definitions) — https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16/subpart-A/section-16.10
- Statutory authority: 27 U.S.C. § 215 (Sec. 8001 of Pub. L. 100-690, 102 Stat. 4181)
- TTB topic page: https://www.ttb.gov/alcohol-labeling/health-warning-statement

### Key numbers

- Minimum type size (mL → mm): 237 → 1, 3000 → 2, >3000 → 3.
- Tolerance: none (the text is verbatim by statute).
- Threshold of applicability (§ 16.10 def. of "alcoholic beverage"): ≥ 0.5% alcohol by volume.

### Gotchas

- **There is no approved variation.** § 16.21 prescribes a single string; nothing in the regulation authorizes paraphrasing, reordering, or substitute language. State labeling laws (e.g., California Prop 65 cancer warnings) impose *additional* warnings but do not modify or replace the federal warning.
- **The two `(1)` / `(2)` numbered statements appear as separate paragraphs** in the eCFR rendering, but the canonical compliance position (per TTB practice and the BAM) is that they may be on a single line as long as the text is exact and `GOVERNMENT WARNING:` is bold. The intervening whitespace between `defects.` and `(2)` in our string is a single ASCII space when rendered inline — which is what most COLA-approved labels use.
- **No font face or family is mandated** — only size, bold weight on the first two words, and contrast.
- **"Government Warning" (mixed case) is non-compliant.** Both `G` and the rest of `OVERNMENT WARNING` must be capital letters.
- The regulation uses an *en-dash-like* hyphen and standard ASCII punctuation — but the eCFR HTML is published using straight ASCII quotes around `GOVERNMENT WARNING`. Smart-quotes / typographic quotes elsewhere in the warning are *not* mandated and are not present in the regulation.
- **Definition of "container" (§ 16.10):** "the innermost sealed container … in which an alcoholic beverage is placed by the bottler and in which such beverage is offered for sale to members of the general public." Outer cartons, sleeves, and shippers are not the regulated surface — the actual bottle/can is.
- **0.5% ABV threshold:** beverages below 0.5% ABV are not "alcoholic beverages" for ABLA purposes and the warning is not required (§ 16.10).

### Confidence

**High.** Text was extracted directly from the eCFR HTML body of § 16.21 and cross-checked with the GovInfo XML of CFR-2023 Title 27 Vol 1 Part 16. Both sources agree character-for-character.

---

## Q2 — Per-Beverage Mandatory Fields

The mandatory fields fall into three regulatory regimes:

- **Wine — 27 CFR Part 4** (sections 4.32-4.39, 4.72). Not yet modernized; section numbers stable since 1960 with periodic amendments.
- **Distilled spirits — 27 CFR Part 5** (sections 5.61-5.74, 5.203). Modernized by T.D. TTB-176 (2022). Old § 5.32-style numbering is obsolete.
- **Malt beverages (beer) — 27 CFR Part 7** (sections 7.61-7.71). Modernized by T.D. TTB-176 (2022). Old § 7.22-style numbering is obsolete.

### Wine — § 4.32

On the brand label:

1. Brand name (§ 4.33).
2. Class, type, or other designation (§ 4.34).
3. *[Reserved]*
4. For blends of American + foreign wine, exact percentage by volume of foreign wine.

On any label affixed to the container:

1. Name and address (§ 4.35).
2. Net contents (§ 4.37). If non-standard fill, must be on a front label.
3. Alcohol content (§ 4.36) — required only for wines > 14% ABV (see Q4).

Other mandatory disclosures on any label (front, back, strip, or neck):

- FD&C Yellow No. 5 (if used) — bottled on/after Oct 6, 1984.
- Cochineal extract or carmine (if used) — removed on/after Apr 16, 2013.
- **Sulfites** — see Q3.
- Health warning per § 16.21.

### Distilled spirits — § 5.63

**Same field of vision** (§ 5.63(a) — "single side of a container; for cylindrical, 40% of the circumference; viewable simultaneously without turning"):

1. Brand name (§ 5.64).
2. Class, type, or other designation (subpart I — §§ 5.141-5.156).
3. Alcohol content (§ 5.65). Always required.

Anywhere on the container (§ 5.63(b)):

1. Name and address of bottler/distiller (§ 5.66) or importer (§§ 5.67/5.68).
2. Net contents (§ 5.70) — may be blown/embossed/molded.

Other disclosures (§ 5.63(c)):

- Neutral spirits + commodity name (§ 5.71) where applicable.
- Coloring or wood treatment (§§ 5.72, 5.73).
- Statement of age (§ 5.74) when required.
- State of distillation for whiskies in § 5.143(c)(2)-(7).
- FD&C Yellow No. 5.
- Cochineal extract or carmine.
- Sulfites (≥10 ppm SO₂).
- **Aspartame** — if present, must say `PHENYLKETONURICS: CONTAINS PHENYLALANINE.` in capital letters, separate and apart.
- Health warning per § 16.21.

### Malt beverages (beer) — § 7.63

On a label (§ 7.61(a)):

1. Brand name (§ 7.64).
2. Class, type, or other designation (subpart I).
3. Alcohol content (§ 7.65) — *only* required when the beverage contains alcohol derived from added nonbeverage flavors or other nonbeverage ingredients (other than hops extract). Otherwise optional unless mandated by State law.
4. Name and address of bottler or importer (§§ 7.66 / 7.67 / 7.68).
5. Net contents (§ 7.70).

Disclosure-only items (§ 7.63(b)): FD&C Yellow No. 5, cochineal extract/carmine, sulfites, aspartame (same `PHENYLKETONURICS: CONTAINS PHENYLALANINE.` rule). Plus health warning per § 16.21.

### "Other / unknown" beverage category

There is **no separate TTB regulatory regime** for "other / unknown" alcoholic beverages. Any beverage ≥ 0.5% ABV that contains distilled spirits is subject to Part 5; wine (defined in § 4.10) to Part 4; malt beverages (defined in § 7.1 — fermented from malted barley + hops) to Part 7. Hard seltzers, RTDs, FMBs, and similar products fall under Part 5 (if spirits-based), Part 4 (if wine-based), or Part 7 (if malt-based); the FAA Act has no fourth category. For the proofLens product, "other / unknown" should fall back to **the union of all checks across the three regimes plus the universal § 16.21 government warning**.

### Comparison table

| Item | Beer (Part 7) | Wine (Part 4) | Spirits (Part 5) | Reg cite |
|---|---|---|---|---|
| Brand name | Required | Required (brand label) | Required (same field of vision) | 4.33 / 5.64 / 7.64 |
| Class/type designation | Required | Required (brand label) | Required (same field of vision) | 4.34 / Subpart I / Subpart I |
| Alcohol content | Conditional (only if added nonbev flavors) | Conditional (only > 14% ABV; optional ≤ 14% if "table" or "light" appears) | **Always required** (same field of vision) | 4.36 / 5.65 / 7.65 |
| Name & address (bottler / importer) | Required | Required | Required | 4.35 / 5.66-5.68 / 7.66-7.68 |
| Net contents | Required (US customary; metric optional, same field of vision) | Required (metric only) | Required (metric only) | 4.37 / 5.70 / 7.70 |
| Government health warning (16.21) | Required | Required | Required | 16.21 |
| Sulfites (≥ 10 ppm) | Required if applicable | Required if applicable | Required if applicable | 4.32(e) / 5.63(c)(7) / 7.63(b)(3) |
| FD&C Yellow No. 5 | Required if used | Required if used | Required if used | 4.32(c) / 5.63(c)(5) / 7.63(b)(1) |
| Cochineal/carmine | Required if used | Required if used | Required if used | 4.32(d) / 5.63(c)(6) / 7.63(b)(2) |
| Aspartame (`PHENYLKETONURICS:…`) | Required if used | (Not in Part 4) | Required if used | 5.63(c)(8) / 7.63(b)(4) |
| Country of origin (imports) | Required (also 19 CFR 134) | Required (also 19 CFR 134) | Required (also 19 CFR 134) | 5.68 / 7.68 / 19 CFR 134 |
| State of distillation (whiskies) | n/a | n/a | Required for § 5.143(c)(2)-(7), (15), (16) whiskies | 5.66(f) |

### Confidence

**High** for spirits and malt (current text extracted from eCFR 2026-04-29, post-2022 modernization). **High** for wine.

### Sources

- 27 CFR § 4.32: https://www.ecfr.gov/current/title-27/section-4.32
- 27 CFR § 4.33-4.39, 4.72: https://www.ecfr.gov/current/title-27/section-4.33 (etc.)
- 27 CFR § 5.63: https://www.ecfr.gov/current/title-27/section-5.63
- 27 CFR § 5.65, 5.66, 5.67, 5.68, 5.70, 5.203: same domain
- 27 CFR § 7.63, 7.64, 7.65, 7.66, 7.68, 7.70: same domain
- TTB Distilled Spirits Mandatory Label Checklist: https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/ds-labeling-home/ds-checklist
- TTB Malt Beverage Labeling: https://www.ttb.gov/regulated-commodities/beverage-alcohol/beer/labeling

---

## Q3 — Sulfite Warning (Wine, and also Spirits & Malt Beverages)

### Finding

A **sulfite declaration is required when sulfur dioxide or any sulfiting agent is detected at ≥ 10 parts per million (ppm), measured as total SO₂.** This applies across all three beverage classes — not just wine — but the wine rule is the historically prominent one because of natural and added SO₂ in winemaking.

Acceptable statements (any one of):

- `Contains sulfites`
- `Contains (a) sulfiting agent(s)`
- A statement identifying the specific sulfiting agent (e.g., `Contains potassium metabisulfite`).
- Alternative spellings `sulphites` / `sulphiting` are explicitly permitted (Part 5 and Part 7).

### Wine-specific (§ 4.32(e))

Verbatim: "There shall be stated on a front label, back label, strip label or neck label, the statement 'Contains sulfites' or 'Contains (a) sulfiting agent(s)' or a statement identifying the specific sulfiting agent where sulfur dioxide or a sulfiting agent is detected at a level of 10 or more parts per million, measured as total sulfur dioxide."

Effective dates (still on the books): COLA issued ≥ Jan 9, 1987; wine bottled ≥ Jul 9, 1987; wine removed ≥ Jan 9, 1988.

### Spirits (§ 5.63(c)(7)) and malt (§ 7.63(b)(3))

Same 10-ppm trigger; same example phrases; explicit allowance of "sulphites"/"sulphiting" spelling variants.

### Gotchas

- The threshold is **10 ppm**, not 9, not 11. For proofLens this is a numeric comparison check, not a string one — but the *label declaration* is a string check.
- Capitalization is not strictly mandated by the regulation ("contains sulfites" / "Contains Sulfites" / "CONTAINS SULFITES" all comply), so this is a **nuanced match**, not a strict one.
- The phrase may appear on any of: front label, back label, strip label, neck label.
- For wine that is naturally low in SO₂ but still ≥ 10 ppm, the declaration is still required. There is no "no added sulfites" exemption from the disclosure rule — that's a marketing claim, not a regulatory exemption.

### Confidence

**High.**

### Sources

- 27 CFR § 4.32(e): https://www.ecfr.gov/current/title-27/section-4.32
- 27 CFR § 5.63(c)(7): https://www.ecfr.gov/current/title-27/section-5.63
- 27 CFR § 7.63(b)(3): https://www.ecfr.gov/current/title-27/section-7.63

---

## Q4 — ABV / Proof Equivalency and Presentation Rules

### Spirits (§ 5.65)

Always required. Format is heavily prescribed.

- The mandatory statement **must** be a percentage of alcohol by volume.
- **Proof** may *additionally* appear, but must be in the same field of vision as the mandatory ABV statement to count toward compliance. (Proof = 2 × ABV.)
- The ABV statement must be expressed in **one of these three formats**:
  - `Alcohol ____ percent by volume`
  - `____ percent alcohol by volume`
  - `Alcohol by volume ____ percent`
- Authorized abbreviations:
  - `Alcohol` → `alc` (with or without period)
  - `percent` → `%`
  - `by` → `/` (slash)
  - `volume` → `vol` (with or without period)
- The regulation gives these worked examples as compliant (§ 5.65(b)(4)):
  - `40% alc/vol`
  - `Alc. 40 percent by vol.`
  - `Alc 40% by vol`
  - `40% Alcohol by Volume.`
- **Tolerance: ± 0.3 percentage points.**

### Wine (§ 4.36)

- Required only if > 14% ABV; optional for ≤ 14% if the brand label says "table" or "light" wine.
- Must be a percentage of alcohol by volume — *not otherwise*.
- Two acceptable formats:
  - Direct: `Alcohol __% by volume` (or similar).
  - Range: `Alcohol __% to __% by volume` — range may not exceed 2 pp for > 14% wine, 3 pp for ≤ 14% wine.
- Abbreviations: `alcohol` → `alc.` / `alc`; `volume` → `vol.` / `vol`.
- Tolerances: ± 1 pp (> 14% ABV); ± 1.5 pp (≤ 14% ABV); but tolerances may not span the 14% taxable-grade boundary.

### Malt beverages (§ 7.65)

- Optional unless required by State law or unless containing added nonbeverage flavors/ingredients (other than hops extract) that contribute alcohol.
- Same three-format rule as spirits (`Alcohol percent by volume`, `percent alcohol by volume`, `Alcohol by volume: percent`).
- Same abbreviations (`alc`, `%`, `/`, `vol`).
- Tolerance ± 0.3 pp for malt beverages ≥ 0.5% ABV.
- **`Low alcohol` / `reduced alcohol`:** only on labels for malt beverages **< 2.5% ABV**.
- **`Non-alcoholic`:** only with the adjacent statement `contains less than 0.5 percent (or .5%) alcohol by volume` on a contrasting background.
- **`Alcohol free`:** only for products with **no alcohol** (zero tolerance).
- Worked examples (§ 7.65(b)(5)): `4.2% alc/vol`, `Alc. 4.0 percent by vol.`, `Alc 4% by vol`, `5.9% Alcohol by Volume.`

### Equivalency rule for nuanced matching

For proofLens nuanced ABV matching, the canonical equivalency set is:

```
"40% alc/vol"  ≡  "40% ALC/VOL"  ≡  "Alc. 40% by vol."  ≡  "Alc 40 percent by vol"
            ≡  "40% Alcohol by Volume"  ≡  "Alcohol 40% by volume"  ≡  "40 percent alcohol by volume"
            ≡  "80 proof"  (spirits only, when 2×ABV)
```

A nuanced matcher should:

1. Normalize whitespace and casing (except where regulation requires bold/caps — only § 16.21 / aspartame).
2. Treat `%` ≡ `percent`.
3. Treat `/` ≡ `by`.
4. Treat `alc.` ≡ `alc` ≡ `alcohol`.
5. Treat `vol.` ≡ `vol` ≡ `volume`.
6. For spirits only: treat `proof` value as 2× the ABV value (with ± 0.3 pp tolerance on ABV side).
7. Within the regulatory tolerance band, accept slight numeric drift (spirits ± 0.3; wine ± 1.0 / ± 1.5; malt ± 0.3).

### Gotchas

- "Bottled at __ percent alcohol by volume" is required for spirits products with significant solid-fruit content that may absorb spirits post-bottling.
- For wine, alcohol content **may not** be expressed in proof — proof is spirits-only. A wine showing "70 proof" is non-compliant.
- For malt, an explicit ABV of 0.0% is only allowed if the product is also labeled `alcohol free`.
- The "same field of vision" rule is *only* for spirits (§ 5.63(a)). Wine and malt do not require co-location of brand + class + ABV.

### Confidence

**High.**

### Sources

- 27 CFR § 4.36: https://www.ecfr.gov/current/title-27/section-4.36
- 27 CFR § 5.65: https://www.ecfr.gov/current/title-27/section-5.65
- 27 CFR § 7.65: https://www.ecfr.gov/current/title-27/section-7.65
- TTB DS Alcohol Content guidance: https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/ds-labeling-home/ds-alcohol-content

---

## Q5 — Net-Contents Standards of Fill

### Wine (§ 4.72)

**Authorized metric standards of fill (current, as amended 2025-01-10 and 2025-01-20 by T.D. TTB-200):**

3 L · 2.25 L · 1.8 L · 1.5 L · 1 L · 750 mL · 720 mL · 700 mL · 620 mL · 600 mL · 568 mL · 550 mL · 500 mL · 473 mL · 375 mL · 360 mL · 355 mL · 330 mL · 300 mL · 250 mL · 200 mL · 187 mL · 180 mL · 100 mL · 50 mL.

Sizes larger than 3 L are also authorized **if filled in even liter increments** (4 L, 5 L, 6 L, etc.).

- Required statement: `__ L` or `__ mL` per § 4.37. Above 1 L → liters with 2-decimal precision; below 1 L → mL.
- Optional US-customary equivalents are listed in a regulation table (e.g., `750 mL (25.4 fl. oz.)`, `1 L (33.8 fl. oz.)`, `375 mL (12.7 fl. oz.)`, `187 mL (6.3 fl. oz.)`).
- Net contents may be embossed/blown/etched into the bottle in lieu of a printed label.

### Distilled spirits (§ 5.203, as amended 2025-01-10 by T.D. TTB-200)

**Authorized metric standards of fill:** 3.75 L · 3 L · 2 L · 1.8 L · 1.75 L · 1.5 L · 1.00 L · 945 mL · 900 mL · 750 mL · 720 mL · 710 mL · 700 mL · 570 mL · 500 mL · 475 mL · 375 mL · 355 mL · 350 mL · 331 mL · 250 mL · 200 mL · 187 mL · 100 mL · 50 mL.

(Note: the 2024 final rule TTB-T.D.-199 / 2025 TTB-200 *eliminated* the prior fixed-only list and added new sizes, including 700 mL, 720 mL, 945 mL, 1.8 L, 2 L, 2.25 L, 3 L, 3.75 L for spirits — meaning standards of fill for spirits are now substantially harmonized with what wine has long permitted.)

### Malt beverages (§ 7.70)

**No fixed list of standards of fill.** Required units are US customary:

- < 1 pint → fluid ounces or fractions of a pint.
- = 1 pint, 1 quart, 1 gallon → so stated.
- > 1 pint < 1 quart → fractions of a quart, or pints + fluid ounces.
- > 1 quart < 1 gallon → fractions of a gallon, or quarts + pints + fluid ounces.
- > 1 gallon → gallons + fractions.
- All fractions in lowest denomination.
- Metric is optional and *additive only* (not in lieu of US customary), and must be in the same field of vision as the customary statement.

### Gotchas

- A `730 mL` wine bottle is **non-compliant** — it's not on the wine list. Same for a `680 mL` spirits bottle.
- A `1 L` wine and a `1.00 L` spirits both pass — but `1 L` for spirits also passes (the 5.203 list says `1.00 L` but the form `1 L` is permitted per § 5.70 statement-of-net-contents rules).
- The 2025 amendments added `355 mL` (the standard "12 oz." can size) to *both* wine and spirits — meaning canned wine and canned spirits products can now use this size. Earlier listings did not include 355 mL for spirits.
- For wine, US-equivalents are **optional**; if shown they must follow the table at § 4.37(b)(1) (e.g., `750 mL (25.4 fl. oz.)`, with one-tenth precision under 100 fl. oz. and whole-ounce precision at/above 100 fl. oz.).
- For malt, metric is only legal *in addition to* US customary — never as the sole net-contents statement.
- **Embossed / blown / molded** net contents satisfy the rule for all three classes.

### Confidence

**High** — extracted directly from current eCFR text including the very recent 2025 amendments.

### Sources

- 27 CFR § 4.37: https://www.ecfr.gov/current/title-27/section-4.37
- 27 CFR § 4.72: https://www.ecfr.gov/current/title-27/section-4.72
- 27 CFR § 5.203: https://www.ecfr.gov/current/title-27/section-5.203
- 27 CFR § 7.70: https://www.ecfr.gov/current/title-27/section-7.70
- T.D. TTB-200, 90 FR 1875 (Jan 10/20, 2025) — https://www.federalregister.gov/citation/90-FR-1875

---

## Q6 — Bottler / Producer / Importer Designation Rules (Who Must Appear on the Label)

### Spirits (§§ 5.66 / 5.67 / 5.68)

- The bottler, distiller, or processor must be identified by **a function-describing phrase**, e.g.:
  - Bottler: `bottled by`, `canned by`, `packed by`, `filled by`.
  - Processor: `blended by`, `made by`, `prepared by`, `produced by`, `manufactured by`. Note: for spirits, `produced by` specifically means a *processing* operation (formerly "rectification") that changes class/type.
  - Distiller: `distilled by`. If bottled for the distiller, `distilled by and bottled for` or `bottled for`.
- Address = city + State (postal abbreviation OK). Must match the basic permit. Street, county, ZIP, phone, website are *optional*.
- A "principal place of business" address may stand in for the actual bottling location, but the actual location must then be on the container via printing/coding/markings.
- For spirits **bottled after importation in the US** (§ 5.67), labels must say one of:
  - `bottled by` (or canned/packed/filled) + bottler info; OR
  - `imported by and bottled (canned, packed, or filled) in the United States for ____` (with importer's principal place of business); OR
  - `imported by and bottled (canned, packed, or filled) in the United States by ____`.
- For spirits **imported already in containers** (§ 5.68), label must state `imported by` (or similar) + importer name and city + State of principal place of business.
- For "straight whiskies" combined from multiple distillers (§ 5.66(e)), special multi-distiller listing rules apply.
- **State of distillation** (§ 5.66(f)) must appear on the label of any whisky type defined in § 5.143(c)(2)-(7), (15), (16) distilled in the US, in one of four ways including `Distilled in [State]` or by being shown in the `bottled by` or `distilled by` address.

### Wine (§ 4.35 — referenced from § 4.32)

- Name and address of bottler/packer required. Wine has analogous (but pre-2022-modernization-style) phrasing rules: `bottled by`, `produced by`, `made by`, `cellared and bottled by`, `vinted and bottled by`, etc., each with regulated meaning at § 4.35.
- Importer info per § 4.35 if imported.

### Malt beverages (§§ 7.66 / 7.67 / 7.68)

- Bottler's name + city + State, consistent with the brewer's notice (Part 25). Optional descriptors: `bottled by`, `canned by`, `packed by`, `filled by`, `brewed and bottled by`.
- For multiple breweries under same ownership, may list the bottling location alone or the full set of locations (no de-emphasis).
- For malt **bottled in the US after import** (§ 7.67), `imported by and bottled in the United States for/by ____` patterns apply.
- For malt **imported in containers** (§ 7.68), `imported by` + importer's principal place of business (city + State).

### Gotchas

- The label can show *more than one* function for the same person ("brewed and bottled by XYZ Brewery") — but cannot give the misleading impression that different functions were performed by the same entity when they weren't.
- Trade names are OK if listed on the basic permit / brewer's notice.
- The `bottled for ____` pattern is allowed in addition to (never in lieu of) the actual bottler's name & address.
- Postal abbreviation of State is allowed (CA, NY, etc.). ZIP, street, phone, website are optional decoration.
- The "principal place of business" exception to the operation-location rule means the *coded* location info (e.g., a tiny `B-ABC123` stamp) might be on the bottle itself rather than the label — proofLens reviewers should note this when reconciling.

### Confidence

**High** for spirits and malt (post-2022 modernization). **High** for wine (Part 4 stable).

### Sources

- 27 CFR § 5.66: https://www.ecfr.gov/current/title-27/section-5.66
- 27 CFR § 5.67: https://www.ecfr.gov/current/title-27/section-5.67
- 27 CFR § 5.68: https://www.ecfr.gov/current/title-27/section-5.68
- 27 CFR § 7.66: https://www.ecfr.gov/current/title-27/section-7.66
- 27 CFR § 7.68: https://www.ecfr.gov/current/title-27/section-7.68
- 27 CFR § 4.35: https://www.ecfr.gov/current/title-27/section-4.35

---

## Q7 — Country-of-Origin Rules for Imports

### Finding

Country-of-origin marking for imported alcoholic beverages is governed primarily by **U.S. Customs and Border Protection regulations at 19 CFR Parts 102 and 134**, *not* by TTB. TTB's labeling regulations (§§ 5.67, 5.68, 7.67, 7.68, 4.35) explicitly *cross-reference* these CBP rules:

> "See 19 CFR parts 102 and 134 for U.S. Customs and Border Protection country of origin marking requirements." — § 5.67(a), § 5.68(a), § 7.68(a)

### Key CBP requirements (19 CFR Part 134)

- Every imported article must be marked with the **English name of the country of origin** in a conspicuous place, legibly, indelibly, and permanently as the article will permit.
- Acceptable phrasing: `Product of [Country]`, `Made in [Country]`, `Imported from [Country]`, or simply the country name.
- The country-of-origin marking may appear anywhere on the container so long as it is conspicuous to the ultimate purchaser at the time of purchase.
- 19 CFR Part 102 contains the substantive rules for *what* the country of origin actually *is* (i.e., where substantial transformation occurs).

### TTB-specific overlays

- For *spirits bottled after importation* in the US (§ 5.67), the label may state both `imported by ____` and the foreign producer's name and address (optional), but the country-of-origin marking under 19 CFR 134 still applies.
- For *spirits imported in containers* (§ 5.68), label must say `imported by [name + city + State]`.
- For wine, similar rules under § 4.35 require the importer name and address; the country-of-origin marking is supplied by 19 CFR 134.
- For malt, § 7.68 requires `imported by` + city + State of importer's principal place of business.

### Gotchas

- TTB does *not* itself police country-of-origin marking — that's CBP. But a missing or wrong country-of-origin marking is still a labeling defect for the reviewer.
- "Imported by" alone is not country-of-origin marking. The regulations require the name of the country (e.g., `Product of France`, `Imported from Mexico`).
- Substantial transformation rules (19 CFR Part 102): if a wine is bottled in the US from imported bulk wine, the country of origin is generally the country where the wine was made, not where it was bottled.
- For multi-source blends, marking gets complex — the proofLens reviewer should flag, not auto-fail, ambiguous cases.

### Confidence

**Medium-High.** TTB cross-references are clear and unambiguous. CBP rules are extensive (we paraphrased the well-known core); a deep-dive into 19 CFR Part 102's substantial-transformation rules is out of scope for this loop.

### Sources

- 27 CFR § 5.67(a), § 5.68(a), § 7.68(a) — see Q6 sources above.
- 19 CFR Part 134 (Country-of-origin marking): https://www.ecfr.gov/current/title-19/chapter-I/part-134
- 19 CFR Part 102 (Rules of origin): https://www.ecfr.gov/current/title-19/chapter-I/part-102

---

## Q8 — Public Examples and Reference Material

### TTB Public COLA Registry

**URL:** https://www.ttbonline.gov/colasonline/publicSearchColasBasic.do

This is the official, public-facing search interface for TTB's database of approved Certificates of Label Approval (COLAs). It is **the single best source of real-world reference labels** for proofLens — every approved label since 1999 (and most paper COLAs back to 1999) is searchable here.

- **No registration required.**
- Searchable fields: TTB ID, brand name, fanciful name, class/type, fanciful designation, plant number, applicant name, COLA approval date range.
- Each result shows the printable label image as approved by TTB (typically a PDF or image attachment). Image previews are *generally available 48 hours after approval*.
- COLA statuses: approved, expired, surrendered, revoked.
- Data also available as CSV via Data.gov: https://catalog.data.gov/dataset/ttb-public-cola-registry-view-the-details-of-a-specific-certificate-of-label-approval-cola-35e4b

### TTB Beverage Alcohol Manuals (BAM)

These are TTB's internal (but published) guides to mandatory labeling, with *worked examples and annotated label images*:

- **Distilled Spirits BAM (PDF):** https://www.ttb.gov/system/files/images/pdfs/wine_bam/complete-distilled-spirit-beverage-alcohol-manual.pdf
- **Wine BAM (PDF, 2018):** https://www.ttb.gov/system/files/images/pdfs/wine_bam/complete-wine-beverage-alcohol-manual.pdf — note: TTB has flagged that this Wine BAM is *not yet updated* to reflect modern wine labeling guidance.
- **Distilled Spirits Mandatory Label Checklist:** https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/ds-labeling-home/ds-checklist
- **TTB G 2021-4** (the live distilled spirits guidance memo) is referenced from that page.
- **Malt Beverage Labeling landing page:** https://www.ttb.gov/regulated-commodities/beverage-alcohol/beer/labeling
- **Distilled Spirits Labeling landing page:** https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/labeling

### COLA Registry usage tips

- A search for `class/type = "BOURBON WHISKY"` will yield thousands of approved spirits labels — a great test corpus for proofLens.
- The `Display COLA Detail` PDF tutorial from TTB: https://www.ttb.gov/system/files/images/pdfs/labeling_colas-docs/display-cola-detail-through-public-cola-registry.pdf
- Each COLA includes the application's submitted product type, brand name, fanciful name, formula number (if applicable), net contents, ABV, and the actual label artwork — all of which can be cross-referenced against proofLens's expected-application-data input.

### Confidence

**High.**

### Sources

- See URLs above. TTB Online Customer Page: https://www.ttb.gov/online-services/ttb-online-homepage

---

## Q9 — 2024-2026 Regulatory Changes (Forward-Looking)

### TTB Notice No. 237 — Alcohol Facts Statements (Federal Register 2025-00957)

**Published:** January 17, 2025. **Comment period closed:** August 15, 2025 (extended from original deadline). **Status as of Apr 2026:** comments under review; final rule not yet issued.

**Proposed scope:**

- Mandatory "Alcohol Facts" panel — analogous to FDA's Nutrition Facts panel — on all wines, distilled spirits, and malt beverages subject to TTB's FAA Act authority.
- Required disclosure per serving:
  - Serving size.
  - Servings per container.
  - Alcohol content as % ABV.
  - Fluid ounces of pure ethyl alcohol per serving.
  - Calories per serving.
  - Carbohydrates (g per serving).
  - Fat (g per serving).
  - Protein (g per serving).
- **Mandatory ABV** for *all* wine ≥ 7% ABV (plugging the existing wine-ABV gap), *all* distilled spirits (already required), and *all* malt beverages (closing the existing § 7.65 conditional rule).
- Compliance date: 5 years from final rule publication.

### TTB Notice No. 238 — Major Food Allergen Labeling (Federal Register 2025-00955)

**Published:** January 17, 2025. **Comment period closed:** August 15, 2025. **Status:** under review.

**Proposed scope:**

- Mandatory disclosure on every alcoholic beverage label of any of the **9 major food allergens** present:
  - Milk, eggs, fish, Crustacean shellfish, tree nuts, wheat, peanuts, soybeans, sesame.
- Includes ingredients containing protein derived from those foods.
- Format and exemptions to be specified in final rule.

### Ingredient Labeling NPRM (separate, still under OMB review)

- A third proposed rule covering full ingredient labeling (analogous to FDA's "Ingredients:" line on food packages) is reportedly under review at the White House Office of Management and Budget but has *not* yet been published in the Federal Register as of April 2026.

### Implications for proofLens

- These rules are *proposed*, not final. They impose a forward-looking design constraint: proofLens's verification engine should leave headroom for an "Alcohol Facts" rectangular panel and an allergen disclosure block.
- The 5-year compliance window means production labels will not contain Alcohol Facts panels for several more years even after final rules issue. proofLens should not strict-fail labels missing an Alcohol Facts panel today.
- Once final, these rules will turn ABV from "conditional" (wine ≤ 14%, malt no-flavor) into "mandatory" — meaning the proofLens beverage-class branching can collapse on this dimension.

### Confidence

**High** on the existence and scope of the NPRMs. **Low** on which specific provisions will survive into the final rule given heavy industry pushback (Brewers Association, Wine Institute, DISCUS, etc., all submitted comments).

### Sources

- Federal Register Notice 237 (Alcohol Facts): https://www.federalregister.gov/documents/2025/01/17/2025-00957/alcohol-facts-statements-in-the-labeling-of-wines-distilled-spirits-and-malt-beverages
- Federal Register Notice 238 (Allergens): https://www.federalregister.gov/documents/2025/01/17/2025-00955/major-food-allergen-labeling-for-wines-distilled-spirits-and-malt-beverages
- Comment Period Extension: https://www.federalregister.gov/documents/2025/04/07/2025-05920/alcohol-facts-statements-in-the-labeling-of-wines-distilled-spirits-and-malt-beverages-and-major
- TTB rulemaking index: https://www.ttb.gov/laws-regulations-and-public-guidance/laws-and-regulations/all-rulemaking
- Brewers Association coverage: https://www.brewersassociation.org/government-affairs-updates/ttb-proposes-sweeping-new-regulations/
- Morgan Lewis client alert: https://www.morganlewis.com/blogs/welldone/2025/04/proposed-nutrition-and-allergen-labeling-changes-for-alcoholic-beverages-key-takeaways

---

## Summary Table — What proofLens Must Enforce

| Field | Beer (Malt, Part 7) | Wine (Part 4) | Spirits (Part 5) | Other / Unknown | Strictness |
|---|---|---|---|---|---|
| § 16.21 government health warning text (verbatim) | Required | Required | Required | Required | **strict** (zero-tolerance exact match) |
| `GOVERNMENT WARNING:` prefix capitalization | Required | Required | Required | Required | **strict** |
| § 16.22 type-size minimums (1mm/2mm/3mm by container size) | Required | Required | Required | Required | **strict** (numeric) |
| § 16.22 bold weight on `GOVERNMENT WARNING` | Required | Required | Required | Required | **strict** (visual) |
| § 16.22 contrasting background | Required | Required | Required | Required | nuanced |
| § 16.21 placement: separate and apart from other info | Required | Required | Required | Required | nuanced |
| Brand name | Required | Required (brand label) | Required (same field of vision) | Required | nuanced (capitalization/whitespace) |
| Class / type designation | Required | Required (brand label) | Required (same field of vision) | Required | nuanced |
| Alcohol content (ABV) | Conditional | Conditional (>14% only, or table/light optional ≤14%) | **Always** (same field of vision) | Required | nuanced (`%` ≡ `percent`, `/` ≡ `by`, `alc.` ≡ `alc` ≡ `alcohol`) |
| Proof statement (spirits only, optional) | n/a | n/a | Optional in same field of vision; additional elsewhere | n/a | nuanced (proof = 2× ABV, ± 0.3 pp) |
| Name & address (bottler / distiller / brewer / importer) | Required | Required | Required | Required | nuanced (city + State; postal abbrev OK) |
| Net contents | Required (US customary; metric optional same FOV) | Required (metric primary; US optional per table) | Required (metric primary) | Required | nuanced (volume-unit equivalence) |
| Net contents must match an authorized standard of fill | n/a (no list) | **strict** (§ 4.72 list) | **strict** (§ 5.203 list, post 2025-01-10 amendment) | strict if applicable | strict (numeric/list) |
| Country of origin (imports) | Required (also 19 CFR 134) | Required (also 19 CFR 134) | Required (also 19 CFR 134) | Required if imported | nuanced |
| Sulfite declaration (≥ 10 ppm) | Required if applicable | Required if applicable | Required if applicable | Required if applicable | nuanced (case-insensitive; `sulphites` accepted) |
| FD&C Yellow No. 5 declaration | Required if used | Required if used | Required if used | Required if used | nuanced |
| Cochineal extract / carmine declaration | Required if used | (Not in Part 4) — Required if used | Required if used | Required if used | nuanced |
| Aspartame declaration (`PHENYLKETONURICS: CONTAINS PHENYLALANINE.`) | Required if used | (Not in Part 4) | Required if used | Required if used | **strict** (capital letters required by reg) |
| State of distillation (whiskies in § 5.143(c)(2)-(7), (15), (16)) | n/a | n/a | Required | n/a if not whisky | strict (presence) |
| Health-related claims rules (§ 4.39(h), § 5.42-style) | Apply | Apply | Apply | Apply | nuanced |

### Strict-fail (zero-recall-loss) checklist for proofLens

1. **Government warning text is character-for-character identical to the § 16.21 string.** This is the most important check in the whole product.
2. **`GOVERNMENT WARNING:` literal substring** (all caps, ending in colon-space) is present at the start of the warning block.
3. **Aspartame statement, if present, is `PHENYLKETONURICS: CONTAINS PHENYLALANINE.`** in capital letters, separate and apart.
4. **Spirits net contents match the § 5.203 fixed list** (or the § 5.203(b) pre-1980 grandfather).
5. **Wine net contents match the § 4.72 fixed list** (or the > 3 L even-liter rule).
6. **Type-size minimums (1mm/2mm/3mm)** are met for the warning given container volume — when proofLens has measured DPI / pixel-per-mm context.

### Nuanced / scoring checks

Everything else — brand name capitalization, ABV format equivalence, address punctuation, whitespace differences in the warning's body (so long as the text is verbatim) — should be scored on a similarity scale and flagged-but-not-strict-failed.

---

## Notes on data source quality

- All primary-regulation text was extracted directly from the eCFR HTML body on 2026-04-29 (https://www.ecfr.gov/), with cross-validation against the GovInfo CFR XML build for Title 27.
- The eCFR was reachable via direct HTTP with a standard browser User-Agent; programmatic clients (e.g., the WebFetch tool) initially redirected to https://unblock.federalregister.gov/, but raw `curl` with a `Mozilla/5.0` UA succeeded.
- Modernized Part 5 and Part 7 sections cite T.D. TTB-176 (87 FR 7579, Feb 9, 2022) as their source. The 2025 standards-of-fill amendment (T.D. TTB-200, 90 FR 1875) is reflected in the current text.
- Part 4 (wine) has *not* been modernized; section numbering is original, but content has been amended — most recently by T.D. TTB-200 (2025) for the wine standards of fill.

