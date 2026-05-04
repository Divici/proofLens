#!/usr/bin/env node
/**
 * stub-batch — generate a stress-test bundle for /batch.
 *
 * The brief (Janet Park, Phase 9 audit notes): "we get 200, 300 label
 * applications at once." The /batch UI's UX-under-load isn't really
 * tested by the 6-row demo bundle — soft confirm at 50, hard cap at
 * 250, worker-pool pacing at scale, and the import-time CSV parser are
 * only meaningfully exercised by a paired-import in the brief's range.
 *
 * This script emits N copies of a known-good demo label under
 * `app-001.jpg ... app-NNN.jpg` plus a paired CSV that points each
 * filename at the same expected `ApplicationData` row. Drop the entire
 * output folder onto /batch + select the CSV — Pair-by-filename
 * (`lib/batch/pair.ts`) matches each image to its row, the run starts,
 * and the soft-confirm / hard-cap modals exercise themselves at the
 * right thresholds.
 *
 * Usage:
 *   node scripts/stub-batch.mjs [count] [outDir]
 *   node scripts/stub-batch.mjs            # default: count=300, outDir=tmp/batch-300
 *   node scripts/stub-batch.mjs 50         # soft-confirm modal
 *   node scripts/stub-batch.mjs 251        # hard-cap "Trim to 250" modal
 *   node scripts/stub-batch.mjs 300 tmp/janet
 *
 * The output directory is gitignored under `tmp/`.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const argCount = Number(process.argv[2] ?? 300);
const argOutDir = process.argv[3] ?? `tmp/batch-${argCount}`;

if (!Number.isFinite(argCount) || argCount <= 0) {
  console.error(`Invalid count: ${process.argv[2]}. Pass a positive integer.`);
  process.exit(1);
}

const SOURCE_LABEL = join(
  REPO_ROOT,
  "public",
  "demo-labels",
  "01-spirits-pass.jpg",
);
const OUT_DIR = join(REPO_ROOT, argOutDir);

if (!existsSync(SOURCE_LABEL)) {
  console.error(`Source label not found: ${SOURCE_LABEL}`);
  console.error("Run from the repo root, or update SOURCE_LABEL in this script.");
  process.exit(1);
}

if (existsSync(OUT_DIR)) {
  rmSync(OUT_DIR, { recursive: true, force: true });
}
mkdirSync(OUT_DIR, { recursive: true });

// Header order MUST match `CSV_TEMPLATE_HEADERS` in `lib/batch/csv.ts`
// — the parser is column-position-strict.
const HEADER_ROW = [
  "filename",
  "brand",
  "classType",
  "abv",
  "netContents",
  "bottlerName",
  "bottlerAddress",
  "countryOfOrigin",
  "govWarningRequired",
  "applicationNotes",
  "beverageType",
].join(",");

const padWidth = Math.max(3, String(argCount).length);
const pad = (n) => String(n).padStart(padWidth, "0");

// Single canonical row reused for every image — the verify result is
// stable so the only thing scaling here is the UI/IndexedDB write path.
// The brief's "200-300 at once" is throughput + UX-under-load, not
// 200 unique label designs.
const CANONICAL_ROW = [
  "Old Tom Distillery",
  "Kentucky Straight Bourbon Whiskey",
  "45",
  "750 mL",
  "Old Tom Distillery LLC",
  "123 Bourbon Lane Bardstown KY 40004",
  "United States",
  "true",
  // applicationNotes is filled per-row below so persisted records carry
  // a unique TTB-2026-NNN tag — useful when scanning the saved batch in
  // /history.
  null,
  "distilled-spirits",
];

const csvLines = [HEADER_ROW];
for (let i = 1; i <= argCount; i++) {
  const filename = `app-${pad(i)}.jpg`;
  copyFileSync(SOURCE_LABEL, join(OUT_DIR, filename));
  const cells = [filename, ...CANONICAL_ROW];
  cells[9] = `TTB-2026-${pad(i)}`; // applicationNotes
  csvLines.push(cells.join(","));
}

const CSV_PATH = join(OUT_DIR, "prooflens-batch.csv");
writeFileSync(CSV_PATH, csvLines.join("\n") + "\n");

console.log(`✓ Wrote ${argCount} images + 1 CSV → ${argOutDir}`);
console.log("");
console.log("Next:");
console.log("  1. Open /batch in the browser.");
console.log(`  2. Drop every *.jpg from ${argOutDir} into the file picker.`);
console.log(`  3. Select ${argOutDir}/prooflens-batch.csv as the paired CSV.`);
console.log("  4. Watch the live queue + click Save when done.");
console.log("");
if (argCount >= 250) {
  console.log(
    `Note: ${argCount} > 250 — the UI will surface the hard-cap "Trim to 250" modal first.`,
  );
} else if (argCount >= 50) {
  console.log(
    `Note: ${argCount} ≥ 50 — the soft-confirm modal (cost + ETA estimate) will appear before processing starts.`,
  );
}
