import convert from "convert-units";

/**
 * Net-contents strict matcher.
 *
 * Algorithm:
 *
 *   1. Tokenise the candidate via regex into `(numeric, unit)`.
 *   2. Convert to canonical millilitres via `convert-units`.
 *   3. Compare with relative tolerance ≤ 0.1%.
 *
 * Recognised unit aliases (case-insensitive): `ml`, `mL`, `ML`, `l`, `L`,
 * `cl`, `fl oz`, `fl. oz.`, `oz` (treated as fl oz on a beverage label —
 * the standard liquid measure).
 *
 * Slice 0003 ships the equality check; "must match an authorised standard
 * of fill" (§ 4.72 / § 5.203 fixed list) is wired in slice 0004 alongside
 * the beverage-aware rule router.
 */

export interface ParsedVolume {
  /** Numeric value as it appeared on the label. */
  amount: number;
  /** Original unit token (e.g. "mL", "fl oz"). */
  unit: string;
  /** Canonicalised to millilitres via `convert-units`. */
  canonicalMl: number;
}

export type NetContentsFailReason = "unparseable" | "volume_mismatch";

export interface NetContentsOutcome {
  status: "pass" | "fail";
  reason?: NetContentsFailReason;
  foundMl: number | null;
  expectedMl: number | null;
  /** Relative delta as a fraction (`|a - b| / max(a,b)`). */
  relativeDelta: number | null;
  /** Tolerance applied (default 0.001 = 0.1%). */
  tolerance: number;
}

/** Volume-equality tolerance used when comparing canonical mL values. */
export const VOLUME_RELATIVE_TOLERANCE = 0.001; // 0.1%

const UNIT_ALIAS_MAP: Record<string, "ml" | "l" | "cl" | "fl-oz"> = {
  ml: "ml",
  ML: "ml",
  l: "l",
  L: "l",
  cl: "cl",
  CL: "cl",
  "fl oz": "fl-oz",
  "fl. oz.": "fl-oz",
  "fl. oz": "fl-oz",
  "fl oz.": "fl-oz",
  floz: "fl-oz",
  // Bare "oz" on a beverage label means fluid ounce.
  oz: "fl-oz",
  "oz.": "fl-oz",
};

const VOLUME_PATTERN =
  /(\d+(?:\.\d+)?)\s*(ml|l|cl|fl\.?\s*oz\.?|floz|oz\.?)\b/i;

export function parseVolume(input: string): ParsedVolume | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const match = trimmed.match(VOLUME_PATTERN);
  if (!match || !match[1] || !match[2]) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // Normalise the unit token: lowercase, single-spaced, leading "fl" trimmed.
  const unitRaw = match[2].toLowerCase().replace(/\s+/g, " ").trim();
  const aliasKey = unitRaw in UNIT_ALIAS_MAP ? unitRaw : unitRaw.toLowerCase();
  const canonicalUnit = UNIT_ALIAS_MAP[aliasKey];
  if (!canonicalUnit) return null;

  let canonicalMl: number;
  try {
    canonicalMl = convert(amount).from(canonicalUnit).to("ml");
  } catch {
    return null;
  }

  return {
    amount,
    unit: match[2],
    canonicalMl,
  };
}

export interface NetContentsInput {
  extracted: string | null;
  expected: string;
  tolerance?: number;
}

export function netContentsMatch({
  extracted,
  expected,
  tolerance = VOLUME_RELATIVE_TOLERANCE,
}: NetContentsInput): NetContentsOutcome {
  const expectedParsed = parseVolume(expected);
  if (!expectedParsed) {
    return {
      status: "fail",
      reason: "unparseable",
      foundMl: null,
      expectedMl: null,
      relativeDelta: null,
      tolerance,
    };
  }

  if (typeof extracted !== "string") {
    return {
      status: "fail",
      reason: "unparseable",
      foundMl: null,
      expectedMl: expectedParsed.canonicalMl,
      relativeDelta: null,
      tolerance,
    };
  }

  const foundParsed = parseVolume(extracted);
  if (!foundParsed) {
    return {
      status: "fail",
      reason: "unparseable",
      foundMl: null,
      expectedMl: expectedParsed.canonicalMl,
      relativeDelta: null,
      tolerance,
    };
  }

  const max = Math.max(foundParsed.canonicalMl, expectedParsed.canonicalMl);
  const relativeDelta =
    Math.abs(foundParsed.canonicalMl - expectedParsed.canonicalMl) / max;

  if (relativeDelta <= tolerance + 1e-12) {
    return {
      status: "pass",
      foundMl: foundParsed.canonicalMl,
      expectedMl: expectedParsed.canonicalMl,
      relativeDelta,
      tolerance,
    };
  }

  return {
    status: "fail",
    reason: "volume_mismatch",
    foundMl: foundParsed.canonicalMl,
    expectedMl: expectedParsed.canonicalMl,
    relativeDelta,
    tolerance,
  };
}
