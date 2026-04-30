import "server-only";
import { LAPLACIAN_BLUR_THRESHOLD, laplacianVariance } from "./laplacian";
import { exposureSignals } from "./exposure";
import type { ImageQualityFlag, ImageQualityResult } from "./types";

/**
 * Image-quality orchestrator.
 *
 * Combines two signal sources into a single deduped `ImageQualityResult`:
 *
 *   1. **Heuristics** (server-side, deterministic):
 *      - Laplacian variance → `blur`
 *      - Mean luminance / extreme-bin share → `low-light`, `glare`
 *
 *   2. **LLM imageQualityNotes** (model-supplied prose, regex-parsed):
 *      Cheap, well-bounded substring matching against a fixed keyword
 *      table — `parseLlmQualityNotes`. Catches perspective skew, cropping,
 *      obstruction, low-resolution, multiple-labels — concerns the model
 *      can describe but a pixel-level heuristic cannot.
 *
 * Source attribution is preserved so the audit log can show which signal
 * fired each flag.
 */

/**
 * Substring → flag map for the LLM-notes parser. Keys are matched case-
 * insensitively against the joined notes text. Order is irrelevant since
 * the result is deduped.
 */
const LLM_KEYWORD_MAP: Array<{ pattern: RegExp; flag: ImageQualityFlag }> = [
  { pattern: /\bblur(?:ry|red|s)?\b/i, flag: "blur" },
  { pattern: /\bglare\b/i, flag: "glare" },
  { pattern: /\b(?:hot[- ]?spot|reflection|specular)\b/i, flag: "glare" },
  { pattern: /\b(?:low[- ]?light|dim|shadow(?:y|ed)?|underexposed)\b/i, flag: "low-light" },
  { pattern: /\b(?:skew(?:ed)?|tilt(?:ed)?|perspective|angled?)\b/i, flag: "skew" },
  { pattern: /\b(?:crop(?:ped|ping)?|cut[- ]?off|truncated)\b/i, flag: "cropping" },
  { pattern: /\b(?:low[- ]?res(?:olution)?|pixelated|fuzzy)\b/i, flag: "low-resolution" },
  // "obstruction" is matched in two complementary ways:
  //   1. The explicit verb forms (obstruct/obstructed/obstruction/obstructing)
  //      and finger-/hand-related coverings — but only when they co-occur
  //      with an action verb. Bare `\bhand\b` falsely tripped on phrases
  //      like "right-hand corner" or "handsome label", so we require a
  //      following action verb (on/over/cover/block/partially/etc).
  //   2. Generic "covered" / "blocked" / "occluded" mentions of the label.
  { pattern: /\bobstruct(?:ed|ion|ing)?\b/i, flag: "obstruction" },
  {
    pattern:
      /\b(?:hand(?:s)?|finger(?:s)?|thumb(?:s)?)\s+(?:on|over|across|covering|covers?|cover|block(?:ing|s)?|blocks?|obscur(?:ing|es?)|partially|partly)\b/i,
    flag: "obstruction",
  },
  { pattern: /\b(?:covered|blocked|occluded|obscured)\b/i, flag: "obstruction" },
  { pattern: /\bmultiple labels?\b/i, flag: "multiple-labels" },
  { pattern: /\b(?:two|several) labels?\b/i, flag: "multiple-labels" },
];

export function parseLlmQualityNotes(
  notes: ReadonlyArray<string>,
): ImageQualityFlag[] {
  if (!Array.isArray(notes) || notes.length === 0) return [];
  const joined = notes.join(" ");
  const seen = new Set<ImageQualityFlag>();
  const out: ImageQualityFlag[] = [];
  for (const { pattern, flag } of LLM_KEYWORD_MAP) {
    if (seen.has(flag)) continue;
    if (pattern.test(joined)) {
      seen.add(flag);
      out.push(flag);
    }
  }
  return out;
}

export interface AnalyzeOptions {
  /** Skip heuristics (useful for unit tests that drive only the LLM path). */
  skipHeuristics?: boolean;
}

export async function analyzeImageQuality(
  input: Buffer,
  llmNotes: ReadonlyArray<string>,
  opts: AnalyzeOptions = {},
): Promise<ImageQualityResult> {
  const heuristicFlags: ImageQualityFlag[] = [];
  let laplacian: number | null = null;
  let meanLuminance: number | null = null;
  let extremeBinShare: number | null = null;

  if (!opts.skipHeuristics) {
    // Run the two heuristics sequentially — both stream the same buffer
    // through sharp, and parallelism here doesn't help since both are
    // already fast on the preprocessed (≤ 1568 px longest-edge) buffer.
    laplacian = await laplacianVariance(input);
    if (laplacian < LAPLACIAN_BLUR_THRESHOLD) {
      heuristicFlags.push("blur");
    }

    const exposure = await exposureSignals(input);
    meanLuminance = exposure.meanLuminance;
    extremeBinShare = exposure.extremeBinShare;
    for (const f of exposure.flags) heuristicFlags.push(f);
  }

  const llmFlags = parseLlmQualityNotes(llmNotes);

  // Merge with source attribution. Heuristics take precedence for a
  // shared flag (the heuristic is the deterministic / measured signal).
  const seen = new Set<ImageQualityFlag>();
  const flags: ImageQualityFlag[] = [];
  const sources: ImageQualityResult["sources"] = [];

  for (const f of heuristicFlags) {
    if (seen.has(f)) continue;
    seen.add(f);
    flags.push(f);
    sources.push({ flag: f, source: "heuristic" });
  }
  for (const f of llmFlags) {
    if (seen.has(f)) continue;
    seen.add(f);
    flags.push(f);
    sources.push({ flag: f, source: "llm-notes" });
  }

  return {
    flags,
    poor: flags.length > 0,
    signals: {
      laplacianVariance: laplacian,
      meanLuminance,
      extremeBinShare,
    },
    sources,
  };
}
