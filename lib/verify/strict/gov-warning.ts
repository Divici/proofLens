import { distance as damerauLevenshtein } from "fastest-levenshtein";
import removeMd from "remove-markdown";
import {
  GOV_WARNING_BODY,
  GOV_WARNING_CANONICAL,
  GOV_WARNING_PREFIX,
} from "./gov-warning-canonical";

/**
 * 27 CFR § 16.21 government-warning matcher — three-layer strict check.
 *
 * Layer 1 — Prefix (case-sensitive). The literal `GOVERNMENT WARNING:`
 *           must appear at the start of the candidate body (after
 *           whitespace trim). Title-case or lowercase variants fail
 *           with `prefix_capitalization`. Missing prefix fails with
 *           `prefix_missing`.
 *
 * Layer 2 — Body normalisation + exact compare. We normalise both the
 *           extracted body and the canonical body via:
 *
 *             1. NFKC unicode normalisation (folds compatibility forms,
 *                full-width punctuation, etc.).
 *             2. Smart-quote / smart-dash fold (a small explicit table —
 *                the rules are short and need to be auditable).
 *             3. Defensive Markdown / HTML strip (`<b>`, `**…**`).
 *             4. Whitespace canonicalisation: collapse all whitespace
 *                runs (including non-breaking, zero-width, line/paragraph
 *                separators) to a single ASCII space; trim ends.
 *
 *           After normalisation, byte-for-byte compare to the canonical
 *           body. Any diff → `wording_mismatch`.
 *
 * Layer 3 — Diagnostic. On a fail, we compute the Damerau-Levenshtein
 *           distance between the normalised candidate and the canonical
 *           body so the explanation can say "off by N characters." This
 *           layer never upgrades the verdict.
 *
 * Recall on this matcher must be 100% — see the CI mutation fuzz harness
 * in `gov-warning.test.ts`.
 */

export type GovWarningReason =
  | "prefix_missing"
  | "prefix_capitalization"
  | "wording_mismatch";

export interface GovWarningOutcome {
  status: "pass" | "fail";
  /** Set when status === 'fail'. */
  reason?: GovWarningReason;
  /** Whatever the matcher saw after Layer 2 normalisation. */
  normalised?: string;
  /** Damerau-Levenshtein distance to the canonical normalised body. */
  distance?: number;
  /** The full canonical string — handy when rendering diff explanations. */
  canonical: string;
}

/**
 * A small, hand-maintained smart-quote / smart-dash / ellipsis fold table.
 * Kept in code (not in a library) because the rules are short and need
 * line-by-line auditability for the strict-recall guarantee.
 */
const TYPOGRAPHIC_FOLDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[‘’‚‛′]/g, "'"], // ’ ‘ ‚ ‛ ′
  [/[“”„‟″]/g, '"'], // “ ” „ ‟ ″
  [/[–—‐‑‒−]/g, "-"], // – — ‐ ‑ ‒ −
  [/…/g, "..."], // …
  [/[  ]/g, " "], // non-breaking + narrow no-break space
  [/[​‌‍﻿]/g, ""], // zero-width / BOM
];

function applyTypographicFolds(text: string): string {
  let out = text;
  for (const [pattern, replacement] of TYPOGRAPHIC_FOLDS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Normalise a body string for Layer 2 comparison.
 *
 * Case is folded here: real TTB-approved labels render the warning in
 * either mixed case (matching the canonical printed in 27 CFR § 16.21)
 * or ALL CAPS, and both are widely accepted in the field. The
 * regulatory rule is on the *words*, not the typographic case. Layer 1
 * already enforces the all-caps prefix (per Jenny's interview note:
 * "the 'GOVERNMENT WARNING:' part has to be in all caps and bold");
 * the body's case is a stylistic choice.
 *
 * Case-folding here does NOT loosen the strict check — every mutation
 * in the CI fuzz harness changes WORDS (substitution, comma drops,
 * sentence reorders, etc.), not pure case. A pure-case-only mutation
 * would by construction be word-identical to the canonical, which is
 * exactly the case we want to accept.
 */
function normaliseBody(text: string): string {
  let out = text;
  out = out.normalize("NFKC");
  out = applyTypographicFolds(out);
  // Strip Markdown bold/italic etc.; `remove-markdown` is gentle enough
  // to leave plain prose untouched.
  try {
    out = removeMd(out);
  } catch {
    // remove-markdown can throw on weird input; fall through to the
    // unchanged string in that case.
  }
  // Strip residual HTML tags defensively.
  out = out.replace(/<[^>]+>/g, "");
  // Collapse whitespace runs to a single ASCII space, then trim.
  out = out.replace(/\s+/g, " ").trim();
  // Case-fold last so every other normalisation step sees the original
  // casing (some fold tables could be case-sensitive in future).
  out = out.toLowerCase();
  return out;
}

const NORMALISED_CANONICAL_BODY = normaliseBody(GOV_WARNING_BODY);

export function govWarningMatch(input: string): GovWarningOutcome {
  if (typeof input !== "string" || input.trim().length === 0) {
    return {
      status: "fail",
      reason: "prefix_missing",
      canonical: GOV_WARNING_CANONICAL,
    };
  }

  // Layer 1 — prefix check, case-sensitive.
  const trimmed = input.trim();
  if (!trimmed.startsWith(GOV_WARNING_PREFIX)) {
    // Distinguish "missing entirely" from "wrong case" so explanations
    // can be specific.
    if (trimmed.toUpperCase().startsWith(GOV_WARNING_PREFIX)) {
      return {
        status: "fail",
        reason: "prefix_capitalization",
        canonical: GOV_WARNING_CANONICAL,
      };
    }
    return {
      status: "fail",
      reason: "prefix_missing",
      canonical: GOV_WARNING_CANONICAL,
    };
  }

  // Layer 2 — body normalisation + exact compare.
  // Body = everything after the prefix (and any whitespace immediately
  // following it).
  const rawBody = trimmed.slice(GOV_WARNING_PREFIX.length).replace(/^\s+/, "");
  const normalised = normaliseBody(rawBody);

  if (normalised === NORMALISED_CANONICAL_BODY) {
    return {
      status: "pass",
      normalised,
      canonical: GOV_WARNING_CANONICAL,
      distance: 0,
    };
  }

  // Layer 3 — diagnostic distance for explanation prose.
  const distance = damerauLevenshtein(normalised, NORMALISED_CANONICAL_BODY);

  return {
    status: "fail",
    reason: "wording_mismatch",
    normalised,
    distance,
    canonical: GOV_WARNING_CANONICAL,
  };
}
