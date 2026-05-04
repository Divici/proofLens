#!/usr/bin/env node
/**
 * One-shot helper that concatenates every ADR under `decisions/` into a
 * single `decisions.md` at the repo root. Demotes each ADR's title by
 * one heading level so the consolidated file has a single h1 followed
 * by per-ADR h2 sections + a TOC.
 *
 * Idempotent — overwrites decisions.md on every run. Re-run after adding
 * a new ADR file under decisions/.
 *
 * After consolidation the decisions/ folder is no longer the source of
 * truth (decisions.md is). Keep this script for repeatable rebuilds.
 *
 * Usage: node scripts/consolidate-decisions.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const ADR_DIR = join(REPO_ROOT, "decisions");

if (!existsSync(ADR_DIR)) {
  console.error(`No decisions/ folder at ${ADR_DIR} — nothing to consolidate.`);
  process.exit(1);
}

const files = readdirSync(ADR_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort();

if (files.length === 0) {
  console.error("decisions/ is empty — nothing to consolidate.");
  process.exit(1);
}

const out = [];
out.push("# proofLens — Decision Log");
out.push("");
out.push(
  "> Consolidated architecture decision records. Every architectural",
);
out.push(
  "> turn the project took — Phase 0 bootstrap through the post-Phase-9",
);
out.push(
  "> finalization plan — lives here. Earlier versions kept one file per",
);
out.push(
  "> ADR under `decisions/`; consolidated into this single doc on",
);
out.push("> 2026-05-04. Re-run `scripts/consolidate-decisions.mjs` if new");
out.push("> ADRs land.");
out.push("");
out.push("## Table of contents");
out.push("");

const entries = [];
for (const f of files) {
  const body = readFileSync(join(ADR_DIR, f), "utf8");
  const titleLine = body.split(/\n/).find((l) => l.startsWith("# ")) ?? "";
  const title = titleLine.replace(/^#\s+/, "").trim();
  // GitHub-style slugger: lowercase, alphanumerics + dashes, collapse runs.
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  entries.push({ file: f, title, slug });
  out.push(`- [${title}](#${slug})`);
}
out.push("");
out.push("---");
out.push("");

for (const { file } of entries) {
  const body = readFileSync(join(ADR_DIR, file), "utf8").trimEnd();
  // Demote every heading by one level so each ADR title becomes h2 and
  // its subsections shift accordingly.
  const demoted = body.replace(/^(#{1,5}) /gm, (_, hashes) => hashes + "# ");
  out.push(demoted);
  out.push("");
  out.push("---");
  out.push("");
}
// Trim trailing separators so the file ends cleanly.
while (out.length && (out[out.length - 1] === "---" || out[out.length - 1] === "")) {
  out.pop();
}

writeFileSync(join(REPO_ROOT, "decisions.md"), out.join("\n") + "\n");
console.log(
  `Wrote decisions.md — ${out.length} lines, ${entries.length} ADRs consolidated.`,
);
