import type { BeverageType } from "@/lib/ai/schema";

/**
 * Per-beverage field-requirement table.
 *
 * Source-of-truth: 27 CFR Title 27 (TTB labeling regulations) extracted in
 * `research-findings/01-ttb-regulatory.md`. Each base requirement is cited
 * inline; conditional evaluators are documented at the call site.
 *
 * Requirement levels:
 *   - `required`        : the field MUST appear on the label.
 *   - `conditional`     : a per-beverage evaluator decides between
 *                         `required` and `optional` based on the actual
 *                         expected value (e.g. wine ABV > 14% → required).
 *   - `optional`        : the field MAY appear; absence is not a defect.
 *   - `not-applicable`  : the field has no meaning for this beverage class
 *                         (e.g. country-of-origin for an unknown beverage).
 *
 * "Other / Unknown" routes everything except brand, government warning,
 * and net contents to `not-applicable` — the three universal fields are
 * still verified, with the rest surfaced as Manual Review banners.
 */

export const REQUIREMENT_REQUIRED = "required" as const;
export const REQUIREMENT_CONDITIONAL = "conditional" as const;
export const REQUIREMENT_OPTIONAL = "optional" as const;
export const REQUIREMENT_NOT_APPLICABLE = "not-applicable" as const;

export type Requirement =
  | typeof REQUIREMENT_REQUIRED
  | typeof REQUIREMENT_CONDITIONAL
  | typeof REQUIREMENT_OPTIONAL
  | typeof REQUIREMENT_NOT_APPLICABLE;

/** Resolved requirement after evaluating any conditional logic. */
export type ResolvedRequirement = "required" | "optional" | "not-applicable";

export type BeverageField =
  | "brand"
  | "classType"
  | "abv"
  | "netContents"
  | "bottlerName"
  | "bottlerAddress"
  | "countryOfOrigin"
  | "governmentWarning";

/**
 * The three "universal" fields stay Required regardless of beverage type —
 * including for the "Other / Unknown" fallback. Brand and net-contents are
 * universal commercial-speech minimums; the gov warning is universal under
 * 27 CFR § 16.21 for every alcoholic beverage ≥ 0.5% ABV.
 */
const UNIVERSAL_FIELDS: ReadonlyArray<BeverageField> = [
  "brand",
  "netContents",
  "governmentWarning",
];

export function isUniversalField(field: BeverageField): boolean {
  return UNIVERSAL_FIELDS.includes(field);
}

/**
 * Base rule table — what the regulation says before any conditional
 * evaluator runs.
 */
const RULE_TABLE: Record<BeverageType, Record<BeverageField, Requirement>> = {
  // 27 CFR Part 5 — distilled spirits, modernized 2022.
  "distilled-spirits": {
    brand: REQUIREMENT_REQUIRED, // § 5.64
    classType: REQUIREMENT_REQUIRED, // Subpart I (§§ 5.141-5.156)
    abv: REQUIREMENT_REQUIRED, // § 5.65 — always required for spirits
    netContents: REQUIREMENT_REQUIRED, // § 5.70
    bottlerName: REQUIREMENT_REQUIRED, // § 5.66
    bottlerAddress: REQUIREMENT_REQUIRED, // § 5.66
    countryOfOrigin: REQUIREMENT_CONDITIONAL, // § 5.67/5.68 + 19 CFR 134 (imports only)
    governmentWarning: REQUIREMENT_REQUIRED, // § 16.21
  },

  // 27 CFR Part 4 — wine. Not yet modernized; section numbers stable since 1960.
  wine: {
    brand: REQUIREMENT_REQUIRED, // § 4.33
    classType: REQUIREMENT_REQUIRED, // § 4.34
    abv: REQUIREMENT_CONDITIONAL, // § 4.36 — required only for > 14% ABV
    netContents: REQUIREMENT_REQUIRED, // § 4.37
    bottlerName: REQUIREMENT_REQUIRED, // § 4.35
    bottlerAddress: REQUIREMENT_REQUIRED, // § 4.35
    countryOfOrigin: REQUIREMENT_CONDITIONAL, // § 4.35 + 19 CFR 134 (imports only)
    governmentWarning: REQUIREMENT_REQUIRED, // § 16.21
  },

  // 27 CFR Part 7 — malt beverages, modernized 2022.
  "malt-beverage": {
    brand: REQUIREMENT_REQUIRED, // § 7.64
    classType: REQUIREMENT_REQUIRED, // Subpart I
    abv: REQUIREMENT_CONDITIONAL, // § 7.65 — required only when added flavors contribute alcohol
    netContents: REQUIREMENT_REQUIRED, // § 7.70
    bottlerName: REQUIREMENT_REQUIRED, // § 7.66
    bottlerAddress: REQUIREMENT_REQUIRED, // § 7.66
    countryOfOrigin: REQUIREMENT_CONDITIONAL, // § 7.68 + 19 CFR 134 (imports only)
    governmentWarning: REQUIREMENT_REQUIRED, // § 16.21
  },

  // "Other / Unknown" — fall back to universal fields only. Everything
  // beverage-class-specific is Not-Applicable so the pipeline routes those
  // rows to a Manual Review banner ("Beverage type unknown — please
  // classify under TTB Part 4/5/7 for full verification.").
  unknown: {
    brand: REQUIREMENT_REQUIRED,
    classType: REQUIREMENT_NOT_APPLICABLE,
    abv: REQUIREMENT_NOT_APPLICABLE,
    netContents: REQUIREMENT_REQUIRED,
    bottlerName: REQUIREMENT_NOT_APPLICABLE,
    bottlerAddress: REQUIREMENT_NOT_APPLICABLE,
    countryOfOrigin: REQUIREMENT_NOT_APPLICABLE,
    governmentWarning: REQUIREMENT_REQUIRED,
  },
};

/**
 * Look up the static (pre-conditional) requirement for a (beverage, field).
 *
 * For Conditional rules, callers must run `evaluateRule` to resolve to a
 * concrete `required` / `optional` / `not-applicable`.
 */
export function ruleFor(
  beverage: BeverageType,
  field: BeverageField,
): Requirement {
  return RULE_TABLE[beverage][field];
}

/**
 * Optional context that drives Conditional evaluators. Each evaluator
 * accepts only the keys it needs — see comments below.
 */
export interface RuleContext {
  /** Reviewer-supplied expected ABV; drives the wine > 14% rule. */
  expectedAbv?: number;
  /**
   * Some malt beverages contain added nonbeverage flavors that themselves
   * contribute alcohol; in that case § 7.65 forces ABV onto the label.
   * Without an explicit signal we conservatively default to Optional —
   * the spec calls this out as the documented conservative choice for
   * slice 0004.
   */
  addedFlavorsContributeAlcohol?: boolean;
  /**
   * Imported product flag. Country-of-origin is required for imports per
   * 19 CFR Part 134 (cross-referenced from § 5.67/5.68/7.68/4.35).
   * Defaults to false; reviewers can opt in once the form exposes it.
   */
  isImported?: boolean;
}

/**
 * Resolve a (beverage, field) requirement to a concrete level by applying
 * the per-field conditional evaluator.
 */
export function evaluateRule(
  beverage: BeverageType,
  field: BeverageField,
  context: RuleContext,
): ResolvedRequirement {
  const base = ruleFor(beverage, field);

  if (base !== REQUIREMENT_CONDITIONAL) {
    // Static rules pass through unchanged.
    return base as ResolvedRequirement;
  }

  // ── Wine ABV — § 4.36(a) ────────────────────────────────────────────
  // Required if ABV > 14%, otherwise Optional (the "table"/"light"
  // designation route is treated as optional for slice 0004; slice 0009
  // can refine if explicit class signals appear).
  if (beverage === "wine" && field === "abv") {
    if (typeof context.expectedAbv === "number" && context.expectedAbv > 14) {
      return "required";
    }
    return "optional";
  }

  // ── Malt ABV — § 7.65 ───────────────────────────────────────────────
  // Optional unless added nonbeverage flavors (other than hops extract)
  // contribute alcohol; conservative default is Optional when the
  // applicant has not flagged the product as such.
  if (beverage === "malt-beverage" && field === "abv") {
    return context.addedFlavorsContributeAlcohol ? "required" : "optional";
  }

  // ── Country of origin — 19 CFR Part 134 ────────────────────────────
  // Required when the beverage is imported. Defaults to Optional
  // pending an explicit `isImported` flag from the application form.
  if (field === "countryOfOrigin") {
    return context.isImported ? "required" : "optional";
  }

  // Fallback for any unrecognised conditional combo: treat as Optional
  // so the pipeline doesn't accidentally Fail a row.
  return "optional";
}

/**
 * Build a per-field requirement map for a beverage type. Useful for the
 * UI (e.g. show "(Optional)" badge next to Conditional+resolved=optional
 * fields).
 */
export function fieldRequirementsFor(
  beverage: BeverageType,
  context: RuleContext,
): Record<BeverageField, ResolvedRequirement> {
  const fields: BeverageField[] = [
    "brand",
    "classType",
    "abv",
    "netContents",
    "bottlerName",
    "bottlerAddress",
    "countryOfOrigin",
    "governmentWarning",
  ];
  const out: Partial<Record<BeverageField, ResolvedRequirement>> = {};
  for (const f of fields) {
    out[f] = evaluateRule(beverage, f, context);
  }
  return out as Record<BeverageField, ResolvedRequirement>;
}

/**
 * Banner copy for the "Other / Unknown" beverage type. Surfaced on the
 * verification detail screen above the field results.
 */
export const UNKNOWN_BEVERAGE_BANNER =
  "Beverage type unknown — only universal fields verified. Please classify under TTB Part 4/5/7 for full verification.";
