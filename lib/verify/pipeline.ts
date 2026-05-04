import type {
  ApplicationData,
  ExtractedField,
  ExtractedLabelData,
} from "@/lib/ai/schema";
import type { TesseractWord } from "@/lib/ocr/tesseract";
import { govWarningMatch } from "./strict/gov-warning";
import { abvMatch } from "./strict/abv";
import { netContentsMatch } from "./strict/net-contents";
import { isAuthorizedFillSize } from "./strict/standards-of-fill";
import {
  brandMatch,
  classTypeMatch,
  bottlerMatch,
  countryMatch,
  isUnitedStates,
} from "./nuanced/matchers";
import { bottlerAddressMatch } from "./nuanced/address";
import { findBottlerFunctionPhrase } from "./nuanced/bottler-function-phrase";
import {
  resolveStrictStatus,
  resolveNuancedStatus,
  rollUpOverall,
} from "./status-engine";
import {
  renderExplanation,
  suggestedActionFor,
} from "./explain/render";
import { locateBboxForQuote } from "@/lib/bbox/locate";
import type { CallJudgeFn, LadderOutcome } from "./nuanced/ladder";
import type {
  FieldResult,
  FieldStatus,
  OverallStatus,
  RuleOutcome,
} from "./types";
import {
  evaluateRule,
  type BeverageField,
  type ResolvedRequirement,
} from "./beverage-rules";
import type { ImageQualityFlag } from "@/lib/quality/types";

/**
 * High-level verification orchestrator.
 *
 * Inputs:
 *   - `extracted` : the LLM's structured field readings.
 *   - `expected`  : the reviewer-supplied application data.
 *   - `words`     : Tesseract word-level OCR for bbox lookups + the
 *                   gov-warning ground-truth check.
 *   - `rawText`   : Tesseract full-page text (used for gov-warning).
 *   - `imageDims` : preview image width/height for bbox scaling.
 *   - `callJudge` : optional callback for the nuanced gray-band judge.
 *
 * Returns a `FieldResult[]` (one per regulated field) plus the rolled-up
 * overall status. Stateless — no IO except the optional judge callback.
 *
 * Gray-band nuanced cases (similarity 0.78–0.92) call the LLM-judge
 * endpoint at /api/judge-field via the optional `callJudge` param.
 * On judge failure or absence of `callJudge`, the ladder gracefully
 * falls back to "manual-review". Strict fields (gov-warning, ABV,
 * net-contents) never call the judge.
 */

export interface PipelineImageQuality {
  /** True when at least one heuristic or LLM flag fired. */
  poor: boolean;
  /** Detected flag list (empty when `poor` is false). */
  flags: ReadonlyArray<ImageQualityFlag>;
}

export interface PipelineInput {
  extracted: ExtractedLabelData;
  expected: ApplicationData;
  words: ReadonlyArray<TesseractWord>;
  rawText: string;
  imageDims: { width: number; height: number };
  callJudge?: CallJudgeFn;
  /** Image-quality signals (slice 0004 R-011). Defaults to "no flags". */
  imageQuality?: PipelineImageQuality;
}

export interface PipelineOutput {
  fieldResults: FieldResult[];
  overall: OverallStatus;
  imageQuality: PipelineImageQuality;
}

function bboxFor(
  evidence: string | null,
  words: ReadonlyArray<TesseractWord>,
  imageDims: { width: number; height: number },
) {
  if (!evidence) return null;
  return locateBboxForQuote(evidence, words, {
    imageWidth: imageDims.width,
    imageHeight: imageDims.height,
  });
}

function ladderToStatus(
  outcome: LadderOutcome,
  aiConfidence: number,
  imageQualityPoor = false,
): {
  status: FieldStatus;
  ruleOutcome: RuleOutcome;
  matchValidated: boolean;
} {
  const status = resolveNuancedStatus({
    ladderKind: outcome.kind,
    aiConfidence,
    imageQualityPoor,
  });
  // The deterministic ladder validates the value when it lands on
  // `pass`, `pass-normalised`, or `likely-match` — every branch traces
  // back to a positive match (exact equality, normalisation/alias
  // equivalence, or judge-confirmed gray-band hit).
  const matchValidated =
    outcome.kind === "pass" ||
    outcome.kind === "pass-normalised" ||
    outcome.kind === "likely-match";

  let kind: RuleOutcome["kind"];
  switch (outcome.kind) {
    case "pass":
      kind = "nuanced_pass";
      break;
    case "pass-normalised":
      kind = "nuanced_pass_normalised";
      break;
    case "likely-match":
      kind = "nuanced_likely_match";
      break;
    case "manual-review":
      kind = "nuanced_manual_review";
      break;
    case "fail":
      kind = "nuanced_fail";
      break;
    case "missing":
      kind = "nuanced_missing";
      break;
  }

  return {
    status,
    matchValidated,
    ruleOutcome: {
      kind,
      detail: {
        similarity: outcome.similarity,
        normalisedFound: outcome.normalisedFound,
        normalisedExpected: outcome.normalisedExpected,
        judgeVerdict: outcome.judgeVerdict,
        reasoning: outcome.judgeReasoning,
      },
    },
  };
}

/**
 * Floor on the displayed confidence when a deterministic match
 * validated the value. The pill semantically reads "how confident are
 * we this field is correct?" — once the strict matcher (or nuanced
 * ladder) confirmed the extracted value matches expected, we are
 * effectively certain. We pin it at 0.95 (not 1.0) to leave a small
 * residual for image-quality demotion contexts where the ground truth
 * exists but the reviewer should still spot-check the artwork.
 */
const VALIDATED_CONFIDENCE_FLOOR = 0.95;

function buildFieldResult(args: {
  field: string;
  label: string;
  status: FieldStatus;
  value: ExtractedField["value"];
  expected: FieldResult["expected"];
  aiConfidence: number;
  outcomes: RuleOutcome[];
  evidenceQuote: string | null;
  bbox: FieldResult["bbox"];
  imageQualityPoor?: boolean;
  /**
   * True iff the deterministic check validated the extracted value
   * against the expected entry. When true the displayed confidence is
   * bumped to {@link VALIDATED_CONFIDENCE_FLOOR}, since the LLM's
   * self-doubt is moot — we have ground truth via the match logic.
   */
  matchValidated?: boolean;
}): FieldResult {
  const primary = args.outcomes[0] ?? {
    kind: "field_missing" as const,
    detail: {},
  };
  const explanation = renderExplanation(primary);
  const suggestedAction = suggestedActionFor(
    args.status,
    args.imageQualityPoor,
    args.matchValidated,
  );
  const displayedConfidence = args.matchValidated
    ? Math.max(args.aiConfidence, VALIDATED_CONFIDENCE_FLOOR)
    : args.aiConfidence;
  return {
    field: args.field,
    label: args.label,
    status: args.status,
    value: args.value,
    expected: args.expected,
    confidence: displayedConfidence,
    explanation,
    suggestedAction,
    evidenceQuote: args.evidenceQuote,
    bbox: args.bbox,
    outcomes: args.outcomes,
  };
}

/**
 * Build a per-field "not-required" row when the beverage-rules table
 * resolves the field to `not-applicable` (Other / Unknown beverage type)
 * or to `optional` with no value present.
 */
function notRequiredRow(args: {
  field: string;
  label: string;
  expected: FieldResult["expected"];
  reason: "not-applicable" | "optional-missing";
  extractedValue?: ExtractedField["value"];
  evidenceQuote?: string | null;
  bbox?: FieldResult["bbox"];
  aiConfidence?: number;
}): FieldResult {
  return buildFieldResult({
    field: args.field,
    label: args.label,
    status: "not-required",
    value: args.extractedValue ?? null,
    expected: args.expected,
    aiConfidence: args.aiConfidence ?? 1,
    outcomes: [{ kind: "field_not_required", detail: { reason: args.reason } }],
    evidenceQuote: args.evidenceQuote ?? null,
    bbox: args.bbox ?? null,
  });
}

export async function runVerificationPipeline({
  extracted,
  expected,
  words,
  rawText,
  imageDims,
  callJudge,
  imageQuality,
}: PipelineInput): Promise<PipelineOutput> {
  const fieldResults: FieldResult[] = [];
  const imageQualityPoor = imageQuality?.poor ?? false;

  /**
   * Resolve the per-beverage requirement for a field. Same context for
   * every field — the evaluators look up only the keys they need.
   *
   * Design note: `isImported` and `addedFlavorsContributeAlcohol` are
   * not surfaced by the application form, so country-of-origin and
   * malt-beverage ABV evaluators conservatively default to "optional".
   * Reviewers can override the per-field result manually. See
   * `decisions.md` (ADR 0002 — verification pipeline architecture) and
   * the Known Limitations section of the README.
   */
  // Auto-derive `isImported` from the application's countryOfOrigin —
  // the brief's "country of origin for imports" maps cleanly to "if
  // it isn't US, it's imported." Avoids adding a separate UI flag the
  // applicant has to remember to tick.
  const ruleContext = {
    expectedAbv: expected.abv,
    isImported: !isUnitedStates(expected.countryOfOrigin),
  };
  const requirement = (field: BeverageField): ResolvedRequirement =>
    evaluateRule(expected.beverageType, field, ruleContext);

  // ── BRAND ────────────────────────────────────────────────────────
  {
    if (requirement("brand") === "not-applicable") {
      fieldResults.push(
        notRequiredRow({
          field: "brand",
          label: "Brand name",
          expected: expected.brand,
          reason: "not-applicable",
        }),
      );
    } else {
      const f = extracted.brand;
      const ladder = await brandMatch({
        extracted: typeof f.value === "string" ? f.value : null,
        expected: expected.brand,
        callJudge,
      });
      const { status, ruleOutcome, matchValidated } = ladderToStatus(
        ladder,
        f.confidence,
        imageQualityPoor,
      );
      fieldResults.push(
        buildFieldResult({
          field: "brand",
          label: "Brand name",
          status,
          value: f.value,
          expected: expected.brand,
          aiConfidence: f.confidence,
          outcomes: [ruleOutcome],
          evidenceQuote: f.evidenceQuote,
          bbox: bboxFor(f.evidenceQuote, words, imageDims),
          imageQualityPoor,
          matchValidated,
        }),
      );
    }
  }

  // ── CLASS / TYPE ──────────────────────────────────────────────────
  {
    if (requirement("classType") === "not-applicable") {
      fieldResults.push(
        notRequiredRow({
          field: "classType",
          label: "Class / type",
          expected: expected.classType,
          reason: "not-applicable",
        }),
      );
    } else {
      const f = extracted.classType;
      const ladder = await classTypeMatch({
        extracted: typeof f.value === "string" ? f.value : null,
        expected: expected.classType,
        callJudge,
      });
      const { status, ruleOutcome, matchValidated } = ladderToStatus(
        ladder,
        f.confidence,
        imageQualityPoor,
      );
      fieldResults.push(
        buildFieldResult({
          field: "classType",
          label: "Class / type",
          status,
          value: f.value,
          expected: expected.classType,
          aiConfidence: f.confidence,
          outcomes: [ruleOutcome],
          evidenceQuote: f.evidenceQuote,
          bbox: bboxFor(f.evidenceQuote, words, imageDims),
          imageQualityPoor,
          matchValidated,
        }),
      );
    }
  }

  // ── ABV (strict, beverage-aware) ──────────────────────────────────
  {
    const abvReq = requirement("abv");
    const candidate =
      typeof extracted.alcoholContentText.value === "string"
        ? extracted.alcoholContentText.value
        : typeof extracted.abvPercent.value === "number"
          ? `${extracted.abvPercent.value}%`
          : null;

    if (abvReq === "not-applicable") {
      fieldResults.push(
        notRequiredRow({
          field: "abv",
          label: "Alcohol content (ABV)",
          expected: expected.abv,
          reason: "not-applicable",
          extractedValue: candidate,
        }),
      );
    } else if (abvReq === "optional" && candidate === null) {
      // Wine ≤ 14% / malt without flavors-contributing-alcohol — Optional;
      // a missing ABV statement isn't a defect.
      fieldResults.push(
        notRequiredRow({
          field: "abv",
          label: "Alcohol content (ABV)",
          expected: expected.abv,
          reason: "optional-missing",
          extractedValue: null,
        }),
      );
    } else {
      const aiConfidence = Math.max(
        extracted.alcoholContentText.confidence,
        extracted.abvPercent.confidence,
      );

      const outcome = abvMatch({
        extracted: candidate,
        expected: expected.abv,
        beverageType: expected.beverageType,
      });
      const status = resolveStrictStatus({
        matchPassed: outcome.status === "pass",
        aiConfidence,
        extractedNull: candidate === null,
        imageQualityPoor,
      });
      const ruleOutcomes: RuleOutcome[] = [];
      if (outcome.status === "pass") {
        ruleOutcomes.push({
          kind: "abv_pass",
          detail: { found: outcome.found, expected: outcome.expected },
        });
      } else if (outcome.reason === "unparseable") {
        ruleOutcomes.push({ kind: "abv_unparseable", detail: {} });
      } else if (outcome.reason === "internal_inconsistency") {
        ruleOutcomes.push({
          kind: "abv_internal_inconsistency",
          detail: { found: outcome.found },
        });
      } else {
        ruleOutcomes.push({
          kind: "abv_out_of_tolerance",
          detail: {
            found: outcome.found,
            expected: outcome.expected,
            delta: outcome.delta,
            tolerance: outcome.tolerance,
          },
        });
      }

      const evidenceQuote =
        extracted.alcoholContentText.evidenceQuote ??
        extracted.abvPercent.evidenceQuote;

      fieldResults.push(
        buildFieldResult({
          field: "abv",
          label: "Alcohol content (ABV)",
          status,
          value: candidate,
          expected: expected.abv,
          aiConfidence,
          outcomes: ruleOutcomes,
          evidenceQuote,
          bbox: bboxFor(evidenceQuote, words, imageDims),
          imageQualityPoor,
          matchValidated: outcome.status === "pass",
        }),
      );
    }
  }

  // ── NET CONTENTS (strict, universal) ──────────────────────────────
  {
    const f = extracted.netContents;
    const candidate = typeof f.value === "string" ? f.value : null;
    const outcome = netContentsMatch({
      extracted: candidate,
      expected: expected.netContents,
    });
    const status = resolveStrictStatus({
      matchPassed: outcome.status === "pass",
      aiConfidence: f.confidence,
      extractedNull: candidate === null,
      imageQualityPoor,
    });
    const ruleOutcomes: RuleOutcome[] = [];
    if (outcome.status === "pass") {
      ruleOutcomes.push({
        kind: "net_contents_pass",
        detail: {
          foundMl: outcome.foundMl,
          expectedMl: outcome.expectedMl,
        },
      });
    } else if (outcome.reason === "unparseable") {
      ruleOutcomes.push({ kind: "net_contents_unparseable", detail: {} });
    } else {
      ruleOutcomes.push({
        kind: "net_contents_volume_mismatch",
        detail: {
          foundMl: outcome.foundMl,
          expectedMl: outcome.expectedMl,
        },
      });
    }

    // Standards-of-fill warning overlay (TTB §§ 4.72 / 5.203). When the
    // value-match passes but the volume isn't on the authorized list,
    // demote pass → warning. The label and application agree; the
    // regulatory deviation is on the volume itself. Reviewer judgment.
    let netContentsStatus = status;
    if (
      outcome.status === "pass" &&
      outcome.foundMl !== null &&
      !isAuthorizedFillSize(outcome.foundMl, expected.beverageType)
    ) {
      netContentsStatus = "warning";
      ruleOutcomes.unshift({
        kind: "net_contents_non_standard_fill",
        detail: {
          foundMl: outcome.foundMl,
          beverageType: expected.beverageType,
          cfrSection:
            expected.beverageType === "wine" ? "§ 4.72" : "§ 5.203",
        },
      });
    }

    fieldResults.push(
      buildFieldResult({
        field: "netContents",
        label: "Net contents",
        status: netContentsStatus,
        value: f.value,
        expected: expected.netContents,
        aiConfidence: f.confidence,
        outcomes: ruleOutcomes,
        evidenceQuote: f.evidenceQuote,
        bbox: bboxFor(f.evidenceQuote, words, imageDims),
        imageQualityPoor,
        matchValidated: outcome.status === "pass",
      }),
    );
  }

  // ── BOTTLER NAME (nuanced) ────────────────────────────────────────
  {
    if (requirement("bottlerName") === "not-applicable") {
      fieldResults.push(
        notRequiredRow({
          field: "bottlerName",
          label: "Bottler / producer",
          expected: expected.bottlerName,
          reason: "not-applicable",
        }),
      );
    } else {
      const f = extracted.bottlerName;
      const ladder = await bottlerMatch({
        extracted: typeof f.value === "string" ? f.value : null,
        expected: expected.bottlerName,
        callJudge,
      });
      const { status, ruleOutcome, matchValidated } = ladderToStatus(
        ladder,
        f.confidence,
        imageQualityPoor,
      );

      // Function-describing-phrase warning overlay (TTB §§ 5.66 /
      // 4.35 / 7.66). When value-match passed but the OCR has no
      // approved verb near the bottler-name evidence, demote
      // pass / likely-match → warning. We scan the RAW OCR (not the
      // structured field) because the LLM strips verbs during
      // extraction. See ADR 0009 for the warning-vs-fail rationale.
      let bottlerNameStatus = status;
      const bottlerNameOutcomes: RuleOutcome[] = [ruleOutcome];
      if (status === "pass" || status === "likely-match") {
        const phrase = findBottlerFunctionPhrase(rawText, f.evidenceQuote);
        if (!phrase.found) {
          bottlerNameStatus = "warning";
          bottlerNameOutcomes.unshift({
            kind: "bottler_function_phrase_missing",
            detail: {},
          });
        }
      }

      fieldResults.push(
        buildFieldResult({
          field: "bottlerName",
          label: "Bottler / producer",
          status: bottlerNameStatus,
          value: f.value,
          expected: expected.bottlerName,
          aiConfidence: f.confidence,
          outcomes: bottlerNameOutcomes,
          evidenceQuote: f.evidenceQuote,
          bbox: bboxFor(f.evidenceQuote, words, imageDims),
          imageQualityPoor,
          matchValidated,
        }),
      );
    }
  }

  // ── BOTTLER ADDRESS (nuanced — token_set_ratio handles abbreviations) ─
  {
    if (requirement("bottlerAddress") === "not-applicable") {
      fieldResults.push(
        notRequiredRow({
          field: "bottlerAddress",
          label: "Bottler / producer address",
          expected: expected.bottlerAddress,
          reason: "not-applicable",
        }),
      );
    } else {
      const f = extracted.bottlerAddress;
      // Address-specific matcher (TTB §§ 5.66 / 4.35 / 7.66 — only
      // city + State are required on the label; street + ZIP are
      // optional). Strips ZIPs and aliases full state names to USPS
      // abbreviations before the standard ladder.
      const ladder = await bottlerAddressMatch({
        extracted: typeof f.value === "string" ? f.value : null,
        expected: expected.bottlerAddress,
        callJudge,
      });
      const { status, ruleOutcome, matchValidated } = ladderToStatus(
        ladder,
        f.confidence,
        imageQualityPoor,
      );
      fieldResults.push(
        buildFieldResult({
          field: "bottlerAddress",
          label: "Bottler / producer address",
          status,
          value: f.value,
          expected: expected.bottlerAddress,
          aiConfidence: f.confidence,
          outcomes: [ruleOutcome],
          evidenceQuote: f.evidenceQuote,
          bbox: bboxFor(f.evidenceQuote, words, imageDims),
          imageQualityPoor,
          matchValidated,
        }),
      );
    }
  }

  // ── COUNTRY OF ORIGIN (nuanced + alias table) ─────────────────────
  {
    const countryReq = requirement("countryOfOrigin");
    const countryCandidate =
      typeof extracted.countryOfOrigin.value === "string"
        ? extracted.countryOfOrigin.value
        : null;
    if (countryReq === "not-applicable") {
      fieldResults.push(
        notRequiredRow({
          field: "countryOfOrigin",
          label: "Country of origin",
          expected: expected.countryOfOrigin,
          reason: "not-applicable",
        }),
      );
    } else if (countryReq === "optional" && countryCandidate === null) {
      // Domestic product (US) with no country marking on the label —
      // the regulation doesn't require it, so this is not a defect.
      // Mirrors the ABV "optional-missing" branch.
      fieldResults.push(
        notRequiredRow({
          field: "countryOfOrigin",
          label: "Country of origin",
          expected: expected.countryOfOrigin,
          reason: "optional-missing",
          extractedValue: null,
        }),
      );
    } else {
      const f = extracted.countryOfOrigin;
      const ladder = await countryMatch({
        extracted: typeof f.value === "string" ? f.value : null,
        expected: expected.countryOfOrigin,
        callJudge,
      });
      const { status, ruleOutcome, matchValidated } = ladderToStatus(
        ladder,
        f.confidence,
        imageQualityPoor,
      );
      fieldResults.push(
        buildFieldResult({
          field: "countryOfOrigin",
          label: "Country of origin",
          status,
          value: f.value,
          expected: expected.countryOfOrigin,
          aiConfidence: f.confidence,
          outcomes: [ruleOutcome],
          evidenceQuote: f.evidenceQuote,
          bbox: bboxFor(f.evidenceQuote, words, imageDims),
          imageQualityPoor,
          matchValidated,
        }),
      );
    }
  }

  // ── GOVERNMENT WARNING (strict — Tesseract ground truth, universal) ──
  {
    if (!expected.govWarningRequired) {
      fieldResults.push(
        buildFieldResult({
          field: "governmentWarning",
          label: "Government warning",
          status: "not-required",
          value: extracted.governmentWarningText.value,
          expected: null,
          aiConfidence: extracted.governmentWarningText.confidence,
          outcomes: [{ kind: "field_not_required", detail: {} }],
          evidenceQuote: extracted.governmentWarningText.evidenceQuote,
          bbox: bboxFor(
            extracted.governmentWarningText.evidenceQuote,
            words,
            imageDims,
          ),
        }),
      );
    } else {
      // Ground-truth source: Tesseract `rawText`. The LLM extraction is
      // only a defensive cross-check.
      const candidate = pickGovWarningCandidate(rawText, extracted);
      const outcome = govWarningMatch(candidate);
      const ruleOutcomes: RuleOutcome[] = [];
      if (outcome.status === "pass") {
        ruleOutcomes.push({ kind: "gov_warning_pass", detail: {} });
      } else if (outcome.reason === "prefix_missing") {
        ruleOutcomes.push({
          kind: "gov_warning_prefix_missing",
          detail: {},
        });
      } else if (outcome.reason === "prefix_capitalization") {
        ruleOutcomes.push({
          kind: "gov_warning_prefix_capitalization",
          detail: {},
        });
      } else {
        ruleOutcomes.push({
          kind: "gov_warning_wording_mismatch",
          detail: { distance: outcome.distance },
        });
      }

      // For the gov-warning field we always treat "extracted is null" as
      // the strict-fail case (the warning is required and we couldn't read
      // it).
      const status = resolveStrictStatus({
        matchPassed: outcome.status === "pass",
        aiConfidence: extracted.governmentWarningText.confidence || 0.9,
        extractedNull: false,
        imageQualityPoor,
      });

      // For the gov-warning bbox we want the warning *paragraph*, not just
      // the prefix. Try the LLM's evidenceQuote first, then fall back to
      // the literal "GOVERNMENT WARNING" prefix in the OCR.
      const bbox =
        bboxFor(
          extracted.governmentWarningText.evidenceQuote,
          words,
          imageDims,
        ) ?? bboxFor("GOVERNMENT WARNING", words, imageDims);

      fieldResults.push(
        buildFieldResult({
          field: "governmentWarning",
          label: "Government warning",
          status,
          value: extracted.governmentWarningText.value,
          // Short label rather than the full ~321-char canonical body —
          // the long canonical would overflow narrow viewports inside
          // FieldRow's "Expected: ..." line, and the templated explanation
          // already covers the diff. The full canonical is still
          // available via `outcomes[0].detail`.
          expected: "27 CFR § 16.21 verbatim text",
          aiConfidence: extracted.governmentWarningText.confidence,
          outcomes: ruleOutcomes,
          evidenceQuote: extracted.governmentWarningText.evidenceQuote,
          bbox,
          imageQualityPoor,
          matchValidated: outcome.status === "pass",
        }),
      );
    }
  }

  const overall = rollUpOverall(fieldResults);
  return {
    fieldResults,
    overall,
    imageQuality: imageQuality ?? { poor: false, flags: [] },
  };
}

/**
 * Find the best candidate string for the gov-warning matcher.
 *
 * 1. Locate "GOVERNMENT WARNING:" in `rawText` (Tesseract ground truth).
 * 2. If present, return the substring from that prefix to the end (or up
 *    to a reasonable length cap so trailing label noise doesn't matter
 *    — the matcher only consumes the warning paragraph).
 * 3. Otherwise fall back to the LLM's `governmentWarningText.value` so
 *    the matcher can still produce a useful explanation.
 */
function pickGovWarningCandidate(
  rawText: string,
  extracted: ExtractedLabelData,
): string {
  if (typeof rawText === "string" && rawText.length > 0) {
    const idx = rawText.indexOf("GOVERNMENT WARNING:");
    if (idx >= 0) {
      // Capture up to ~600 chars or end-of-text, whichever comes first.
      // The canonical warning is ~321 chars; padding catches OCR noise.
      return rawText.slice(idx, idx + 600).trim();
    }
    // Case-insensitive fallback so the matcher can produce a
    // prefix_capitalization fail with a real string.
    const lowerIdx = rawText.toUpperCase().indexOf("GOVERNMENT WARNING");
    if (lowerIdx >= 0) {
      return rawText.slice(lowerIdx, lowerIdx + 600).trim();
    }
  }
  if (typeof extracted.governmentWarningText.value === "string") {
    return extracted.governmentWarningText.value;
  }
  return "";
}
