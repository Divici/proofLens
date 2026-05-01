/**
 * proofLens Phase-7 eval runner.
 *
 * Two layers (per `~/.claude/skills/conductor/bundled/eval/SKILL.md`,
 * `PRESEARCH.md` §5):
 *
 *   - Layer 1 (DETERMINISTIC): drive `runVerificationPipeline` with a
 *     synthesised `ExtractedLabelData` + Tesseract word stream from each
 *     golden case. No LLM calls, no network. Validates: golden case
 *     schema, response shape contract, deterministic verdict assertions
 *     (overall + per-field), and the gov-warning 100 % recall hard rule.
 *
 *   - Layer 2 (GOLDEN SET): POST each case's image to a running
 *     `/api/extract-label`. Records actual output, latency from response,
 *     cost from `aiSpend`. Tabulates verdict accuracy, p50, p95, avg cost
 *     per label, and gov-warning recall.
 *
 * Run with Node 22.6+ for native TypeScript stripping (we rely on `node
 * eval/runner.ts` per the conductor skill spec). Layer 1 is free and
 * always works; Layer 2 expects `pnpm dev` running locally, or a deployed
 * `BASE_URL` env var.
 *
 *   node eval/runner.ts --layer=1     # deterministic, no API calls
 *   node eval/runner.ts --layer=2     # golden set against /api/extract-label
 *   node eval/runner.ts --dry-run     # parse cases + print, don't execute
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runVerificationPipeline } from "../lib/verify/pipeline.ts";
import {
  ApplicationDataSchema,
  ExtractedLabelDataSchema,
} from "../lib/ai/schema.ts";
import type { ApplicationData, ExtractedLabelData } from "../lib/ai/schema.ts";
import type { FieldStatus, OverallStatus, FieldResult } from "../lib/verify/types.ts";
import type { ImageQualityFlag } from "../lib/quality/types.ts";
import {
  overallMatches,
  quantile,
  statusMatches,
  wordsFromText,
} from "./helpers.ts";

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const layerArg = args.find((a) => a.startsWith("--layer="));
const layer: 1 | 2 = layerArg === "--layer=2" ? 2 : 1;
const dryRun = args.includes("--dry-run");
const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = pathResolve(__dirname, "..");
const GOLDEN_DIR = join(__dirname, "golden");
const RESULTS_PATH = join(REPO_ROOT, "eval-results.md");

// ── Golden case shape ────────────────────────────────────────────────────────
type FieldExpectation =
  | {
      field: string;
      status: FieldStatus | { oneOf: FieldStatus[] };
    };

interface GoldenCase {
  id: string;
  name: string;
  tags: string[];
  input: {
    labelImagePath: string;
    expectedData: ApplicationData;
  };
  mockExtraction: ExtractedLabelData;
  mockOcr: { rawText: string };
  expected: {
    overall: OverallStatus | { oneOf: OverallStatus[] };
    fieldExpectations: FieldExpectation[];
    imageQualityFlags: ImageQualityFlag[];
    /** Hard requirement: this case must produce overall=fail AND govwarn=fail. */
    mustReachGovWarningFail?: boolean;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function loadGolden(): GoldenCase[] {
  const files = readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const cases: GoldenCase[] = [];
  for (const f of files) {
    const raw = readFileSync(join(GOLDEN_DIR, f), "utf8");
    cases.push(JSON.parse(raw) as GoldenCase);
  }
  return cases;
}

interface CaseResult {
  id: string;
  name: string;
  tags: string[];
  ok: boolean;
  failures: string[];
  actualOverall?: OverallStatus;
  expectedOverall: OverallStatus | { oneOf: OverallStatus[] };
  fieldFailures: Array<{ field: string; actual: FieldStatus; expected: string }>;
  latencyMs?: number;
  costUsd?: number;
  govWarningFailReached?: boolean;
}

// ── Layer 1 — deterministic ─────────────────────────────────────────────────
async function runLayer1(cases: GoldenCase[]): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const c of cases) {
    const failures: string[] = [];
    const fieldFailures: CaseResult["fieldFailures"] = [];
    let actualOverall: OverallStatus | undefined;
    let govWarningFailReached: boolean | undefined;

    // Schema validation — guard against malformed cases before running the
    // pipeline (which would crash the runner instead of failing the case).
    const appParse = ApplicationDataSchema.safeParse(c.input.expectedData);
    if (!appParse.success) {
      failures.push(
        `case.input.expectedData failed ApplicationDataSchema: ${appParse.error.message}`,
      );
    }
    const extractedParse = ExtractedLabelDataSchema.safeParse(c.mockExtraction);
    if (!extractedParse.success) {
      failures.push(
        `case.mockExtraction failed ExtractedLabelDataSchema: ${extractedParse.error.message}`,
      );
    }

    if (failures.length === 0 && appParse.success && extractedParse.success) {
      try {
        const verification = await runVerificationPipeline({
          extracted: extractedParse.data,
          expected: appParse.data,
          words: wordsFromText(c.mockOcr.rawText),
          rawText: c.mockOcr.rawText,
          imageDims: { width: 1024, height: 1280 },
          imageQuality:
            c.expected.imageQualityFlags.length > 0
              ? { poor: true, flags: c.expected.imageQualityFlags }
              : undefined,
          // Layer 1 deliberately omits the judge — the deterministic pass
          // through the ladder degrades any gray-band fields to
          // manual-review (matches the case definitions' oneOf assertions).
        });

        actualOverall = verification.overall;
        if (!overallMatches(verification.overall, c.expected.overall)) {
          failures.push(
            `overall=${verification.overall}, expected=${JSON.stringify(c.expected.overall)}`,
          );
        }

        const fieldByName = new Map<string, FieldResult>();
        for (const fr of verification.fieldResults) {
          fieldByName.set(fr.field, fr);
        }
        for (const fe of c.expected.fieldExpectations) {
          const got = fieldByName.get(fe.field);
          if (!got) {
            failures.push(`field=${fe.field}: missing from pipeline output`);
            fieldFailures.push({
              field: fe.field,
              actual: "missing",
              expected: JSON.stringify(fe.status),
            });
            continue;
          }
          if (!statusMatches(got.status, fe.status)) {
            failures.push(
              `field=${fe.field}: status=${got.status}, expected=${JSON.stringify(fe.status)}`,
            );
            fieldFailures.push({
              field: fe.field,
              actual: got.status,
              expected: JSON.stringify(fe.status),
            });
          }
        }

        // Gov-warning recall — record a per-case verdict whenever the case
        // claims `mustReachGovWarningFail`.
        if (c.expected.mustReachGovWarningFail) {
          const gov = fieldByName.get("governmentWarning");
          govWarningFailReached =
            verification.overall === "fail" && gov?.status === "fail";
          if (!govWarningFailReached) {
            failures.push(
              `gov-warning recall MISS — overall=${verification.overall}, govStatus=${gov?.status ?? "missing"}`,
            );
          }
        }
      } catch (err) {
        failures.push(
          `pipeline threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    results.push({
      id: c.id,
      name: c.name,
      tags: c.tags,
      ok: failures.length === 0,
      failures,
      actualOverall,
      expectedOverall: c.expected.overall,
      fieldFailures,
      govWarningFailReached,
    });
  }
  return results;
}

// ── Layer 2 — golden set against the live server ────────────────────────────
async function runLayer2(cases: GoldenCase[]): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const c of cases) {
    const failures: string[] = [];
    const fieldFailures: CaseResult["fieldFailures"] = [];
    let actualOverall: OverallStatus | undefined;
    let latencyMs: number | undefined;
    let costUsd: number | undefined;
    let govWarningFailReached: boolean | undefined;

    const imagePath = join(REPO_ROOT, c.input.labelImagePath);
    if (!existsSync(imagePath)) {
      failures.push(`image not found at ${imagePath}`);
      results.push({
        id: c.id,
        name: c.name,
        tags: c.tags,
        ok: false,
        failures,
        expectedOverall: c.expected.overall,
        fieldFailures,
      });
      continue;
    }

    try {
      const buf = readFileSync(imagePath);
      const blob = new Blob([buf], { type: "image/jpeg" });
      const fd = new FormData();
      fd.set("image", blob, c.input.labelImagePath.split("/").pop() ?? "label.jpg");
      fd.set("expected", JSON.stringify(c.input.expectedData));

      const t0 = Date.now();
      const res = await fetch(`${baseUrl}/api/extract-label`, {
        method: "POST",
        body: fd,
      });
      const elapsed = Date.now() - t0;

      if (!res.ok) {
        const text = await res.text();
        failures.push(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        results.push({
          id: c.id,
          name: c.name,
          tags: c.tags,
          ok: false,
          failures,
          expectedOverall: c.expected.overall,
          fieldFailures,
          latencyMs: elapsed,
        });
        continue;
      }

      const json = (await res.json()) as {
        overall: OverallStatus;
        fieldResults: FieldResult[];
        processingTimeMs: number;
        aiSpend: { primaryUsd: number; fallbackUsd: number };
        imageQualityFlags: ImageQualityFlag[];
      };

      latencyMs = json.processingTimeMs ?? elapsed;
      costUsd =
        (json.aiSpend?.primaryUsd ?? 0) + (json.aiSpend?.fallbackUsd ?? 0);
      actualOverall = json.overall;

      if (!overallMatches(json.overall, c.expected.overall)) {
        failures.push(
          `overall=${json.overall}, expected=${JSON.stringify(c.expected.overall)}`,
        );
      }

      const fieldByName = new Map<string, FieldResult>();
      for (const fr of json.fieldResults) {
        fieldByName.set(fr.field, fr);
      }
      for (const fe of c.expected.fieldExpectations) {
        const got = fieldByName.get(fe.field);
        if (!got) {
          failures.push(`field=${fe.field}: missing from response`);
          continue;
        }
        if (!statusMatches(got.status, fe.status)) {
          failures.push(
            `field=${fe.field}: status=${got.status}, expected=${JSON.stringify(fe.status)}`,
          );
          fieldFailures.push({
            field: fe.field,
            actual: got.status,
            expected: JSON.stringify(fe.status),
          });
        }
      }

      if (c.expected.mustReachGovWarningFail) {
        const gov = fieldByName.get("governmentWarning");
        govWarningFailReached =
          json.overall === "fail" && gov?.status === "fail";
        if (!govWarningFailReached) {
          failures.push(
            `gov-warning recall MISS — overall=${json.overall}, govStatus=${gov?.status ?? "missing"}`,
          );
        }
      }
    } catch (err) {
      failures.push(
        `request threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    results.push({
      id: c.id,
      name: c.name,
      tags: c.tags,
      ok: failures.length === 0,
      failures,
      actualOverall,
      expectedOverall: c.expected.overall,
      fieldFailures,
      latencyMs,
      costUsd,
      govWarningFailReached,
    });
  }
  return results;
}

// ── Reporting ───────────────────────────────────────────────────────────────
interface LayerSummary {
  layer: 1 | 2;
  total: number;
  passed: number;
  failed: number;
  accuracy: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
  avgCostUsd?: number;
  totalCostUsd?: number;
  govWarningRecall: { total: number; passed: number; pct: number };
  results: CaseResult[];
}

function summarise(layerNum: 1 | 2, results: CaseResult[]): LayerSummary {
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = total - passed;
  const accuracy = total > 0 ? passed / total : 0;

  const latencies = results
    .filter((r) => typeof r.latencyMs === "number")
    .map((r) => r.latencyMs as number);
  const costs = results
    .filter((r) => typeof r.costUsd === "number")
    .map((r) => r.costUsd as number);

  const recallCases = results.filter(
    (r) => typeof r.govWarningFailReached === "boolean",
  );
  const recallPassed = recallCases.filter(
    (r) => r.govWarningFailReached,
  ).length;

  return {
    layer: layerNum,
    total,
    passed,
    failed,
    accuracy,
    p50LatencyMs: latencies.length > 0 ? quantile(latencies, 0.5) : undefined,
    p95LatencyMs: latencies.length > 0 ? quantile(latencies, 0.95) : undefined,
    avgCostUsd:
      costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : undefined,
    totalCostUsd:
      costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : undefined,
    govWarningRecall: {
      total: recallCases.length,
      passed: recallPassed,
      pct: recallCases.length > 0 ? recallPassed / recallCases.length : 0,
    },
    results,
  };
}

function getGitSha(): string {
  try {
    const { execSync } = require("node:child_process");
    return execSync("git rev-parse HEAD", { cwd: REPO_ROOT })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

function renderResults(
  layer1: LayerSummary | null,
  layer2: LayerSummary | null,
): string {
  const sha = getGitSha();
  const ts = new Date().toISOString();
  const lines: string[] = [];
  lines.push(`# Eval Results — ${ts.slice(0, 10)}`);
  lines.push("");
  lines.push(`**Git SHA:** \`${sha}\``);
  lines.push(`**Timestamp:** ${ts}`);
  lines.push(`**Conductor version:** Phase 7 eval (golden-set v1)`);
  lines.push(
    `**Total run cost:** ${
      layer2?.totalCostUsd !== undefined
        ? `$${layer2.totalCostUsd.toFixed(4)}`
        : "$0.0000 (Layer 1 only)"
    }`,
  );
  lines.push("");
  lines.push("## Locked targets");
  lines.push("");
  lines.push("| Metric | Target |");
  lines.push("|---|---|");
  lines.push("| Verdict accuracy | ≥ 95% on golden set |");
  lines.push("| p50 latency end-to-end | ≤ 5.0s |");
  lines.push("| p95 latency end-to-end | ≤ 8.0s |");
  lines.push("| Per-label AI cost | ≤ $0.05 (target ~$0.010 blended) |");
  lines.push("| Gov-warning recall on strict-fail cases | 100% (zero misses) |");
  lines.push("");

  if (layer1) {
    lines.push("## Layer 1 — Deterministic");
    lines.push("");
    lines.push(
      `**${layer1.passed}/${layer1.total} cases pass** (${(layer1.accuracy * 100).toFixed(1)}% accuracy).`,
    );
    lines.push("");
    lines.push(
      `**Gov-warning recall:** ${layer1.govWarningRecall.passed}/${layer1.govWarningRecall.total} strict-fail cases caught (${(layer1.govWarningRecall.pct * 100).toFixed(1)}%).`,
    );
    lines.push("");
    lines.push("| ID | Name | Tags | Expected → Actual | Status |");
    lines.push("|---|---|---|---|---|");
    for (const r of layer1.results) {
      const exp =
        typeof r.expectedOverall === "string"
          ? r.expectedOverall
          : `oneOf(${r.expectedOverall.oneOf.join("|")})`;
      lines.push(
        `| ${r.id} | ${r.name} | ${r.tags.slice(0, 3).join(", ")} | ${exp} → ${r.actualOverall ?? "—"} | ${r.ok ? "PASS" : "FAIL"} |`,
      );
    }
    lines.push("");
    if (layer1.failed > 0) {
      lines.push("### Layer 1 failures");
      lines.push("");
      for (const r of layer1.results.filter((x) => !x.ok)) {
        lines.push(`- **${r.id} ${r.name}**`);
        for (const f of r.failures) {
          lines.push(`  - ${f}`);
        }
      }
      lines.push("");
    }
  }

  if (layer2) {
    lines.push("## Layer 2 — Golden Set (live `/api/extract-label`)");
    lines.push("");
    lines.push("| Metric | Value | Target |");
    lines.push("|---|---|---|");
    lines.push(
      `| Verdict accuracy | ${layer2.passed}/${layer2.total} (${(layer2.accuracy * 100).toFixed(1)}%) | ≥ 95% |`,
    );
    lines.push(
      `| p50 latency | ${layer2.p50LatencyMs?.toFixed(0) ?? "—"} ms | ≤ 5000 ms |`,
    );
    lines.push(
      `| p95 latency | ${layer2.p95LatencyMs?.toFixed(0) ?? "—"} ms | ≤ 8000 ms |`,
    );
    lines.push(
      `| Avg cost / case | ${layer2.avgCostUsd !== undefined ? `$${layer2.avgCostUsd.toFixed(4)}` : "—"} | ≤ $0.05 |`,
    );
    lines.push(
      `| Total run cost | ${layer2.totalCostUsd !== undefined ? `$${layer2.totalCostUsd.toFixed(4)}` : "—"} | informational |`,
    );
    lines.push(
      `| Gov-warning recall | ${layer2.govWarningRecall.passed}/${layer2.govWarningRecall.total} (${(layer2.govWarningRecall.pct * 100).toFixed(1)}%) | 100% |`,
    );
    lines.push("");
    lines.push("### Per-case results");
    lines.push("");
    lines.push("| ID | Name | Latency (ms) | Cost ($) | Expected → Actual | Status |");
    lines.push("|---|---|---|---|---|---|");
    for (const r of layer2.results) {
      const exp =
        typeof r.expectedOverall === "string"
          ? r.expectedOverall
          : `oneOf(${r.expectedOverall.oneOf.join("|")})`;
      lines.push(
        `| ${r.id} | ${r.name} | ${r.latencyMs?.toFixed(0) ?? "—"} | ${r.costUsd?.toFixed(4) ?? "—"} | ${exp} → ${r.actualOverall ?? "—"} | ${r.ok ? "PASS" : "FAIL"} |`,
      );
    }
    lines.push("");
    if (layer2.failed > 0) {
      lines.push("### Layer 2 failures");
      lines.push("");
      for (const r of layer2.results.filter((x) => !x.ok)) {
        lines.push(`- **${r.id} ${r.name}**`);
        for (const f of r.failures) {
          lines.push(`  - ${f}`);
        }
      }
      lines.push("");
    }
  } else {
    lines.push("## Layer 2 — Golden Set (live `/api/extract-label`)");
    lines.push("");
    lines.push(
      "_Not run. Run `pnpm eval` with `OPENROUTER_API_KEY` set and `pnpm dev` running locally to populate this section._",
    );
    lines.push("");
    lines.push(
      "See `docs/eval.md` for full Layer 2 invocation instructions, including how to point the runner at a deployed Vercel URL via `BASE_URL`.",
    );
    lines.push("");
  }

  return lines.join("\n");
}

function printConsole(summary: LayerSummary): void {
  console.log("");
  console.log(`Layer ${summary.layer} — ${summary.passed}/${summary.total} passed (${(summary.accuracy * 100).toFixed(1)}%)`);
  if (summary.govWarningRecall.total > 0) {
    console.log(
      `  Gov-warning recall: ${summary.govWarningRecall.passed}/${summary.govWarningRecall.total} (${(summary.govWarningRecall.pct * 100).toFixed(1)}%)`,
    );
  }
  if (summary.p50LatencyMs !== undefined) {
    console.log(
      `  Latency: p50=${summary.p50LatencyMs.toFixed(0)}ms, p95=${summary.p95LatencyMs?.toFixed(0) ?? "—"}ms`,
    );
  }
  if (summary.avgCostUsd !== undefined) {
    console.log(
      `  Cost: avg=$${summary.avgCostUsd.toFixed(4)}/case, total=$${summary.totalCostUsd?.toFixed(4)}`,
    );
  }
  if (summary.failed > 0) {
    console.log("");
    console.log(`  Failures (${summary.failed}):`);
    for (const r of summary.results.filter((x) => !x.ok)) {
      console.log(`    - ${r.id} ${r.name}`);
      for (const f of r.failures) {
        console.log(`        ${f}`);
      }
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const cases = loadGolden();

  if (dryRun) {
    console.log(`Dry-run: ${cases.length} golden cases loaded.`);
    const tagCounts: Record<string, number> = {};
    for (const c of cases) {
      for (const t of c.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    }
    console.log("Tag breakdown:");
    for (const [tag, count] of Object.entries(tagCounts).sort()) {
      console.log(`  ${tag.padEnd(28)} ${count}`);
    }
    return;
  }

  let layer1Summary: LayerSummary | null = null;
  let layer2Summary: LayerSummary | null = null;

  // Always run Layer 1 — deterministic, free, fast.
  const layer1Results = await runLayer1(cases);
  layer1Summary = summarise(1, layer1Results);
  printConsole(layer1Summary);

  if (layer === 2) {
    console.log("");
    console.log(`Running Layer 2 against ${baseUrl} ...`);
    const layer2Results = await runLayer2(cases);
    layer2Summary = summarise(2, layer2Results);
    printConsole(layer2Summary);
  }

  const md = renderResults(layer1Summary, layer2Summary);
  writeFileSync(RESULTS_PATH, md, "utf8");
  console.log("");
  console.log(`Wrote ${RESULTS_PATH}`);

  // Exit code reflects worst layer outcome — Layer 1 must pass; Layer 2
  // accuracy must hit ≥ 95% AND gov-warning recall must be 100%.
  let exitCode = 0;
  if (layer1Summary.failed > 0) exitCode = 1;
  if (layer1Summary.govWarningRecall.total > 0 && layer1Summary.govWarningRecall.pct < 1) {
    exitCode = 1;
  }
  if (layer2Summary && layer2Summary.accuracy < 0.95) exitCode = 1;
  if (
    layer2Summary &&
    layer2Summary.govWarningRecall.total > 0 &&
    layer2Summary.govWarningRecall.pct < 1
  ) {
    exitCode = 1;
  }
  process.exit(exitCode);
}

void main().catch((err) => {
  console.error("Eval runner failed:", err);
  process.exit(1);
});
