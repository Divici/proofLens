#!/usr/bin/env node
/**
 * Phase-9 deploy patch for tesseract.js@5.1.1.
 *
 * Vercel's experimental Rust-based bytecode runtime (`/opt/rust/bytecode.js`)
 * cannot resolve `require('..')` from inside a worker_thread. The bare
 * parent-shorthand fails with `MODULE_NOT_FOUND` even when the parent
 * directory's `index.js` is present in the deployment bundle. Standard
 * Node CJS resolution handles `'..'` fine, so this only manifests on
 * Vercel.
 *
 * The pnpm patch system silently no-ops on certain Vercel install paths
 * (different pnpm version, frozen-lockfile + patch ordering, etc.), so
 * we apply the fix directly and idempotently here. Runs before
 * `next build` via a `prebuild` script in package.json.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

// Always compare with forward slashes — works on both Linux (Vercel) and
// Windows (local dev) once we normalise the candidate path.
const TARGET_FILE_REL = "tesseract.js/src/worker-script/node/index.js";

function endsWithTarget(p) {
  return p.split(path.sep).join("/").endsWith(TARGET_FILE_REL);
}
const NEEDLE = "const worker = require('..');";
const REPLACEMENT = "const worker = require('../index.js');";

function findTargets(rootDir) {
  const targets = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          dir.endsWith("node_modules") ||
          dir.includes(".pnpm") ||
          entry.name === ".pnpm" ||
          entry.name.startsWith("tesseract.js")
        ) {
          stack.push(full);
        }
      } else if (entry.isFile() && endsWithTarget(full)) {
        targets.push(full);
      }
    }
  }
  return targets;
}

function patchFile(file) {
  const before = readFileSync(file, "utf8");
  if (before.includes(REPLACEMENT)) {
    return { file, status: "already-patched" };
  }
  if (!before.includes(NEEDLE)) {
    return { file, status: "no-needle" };
  }
  const after = before.replace(NEEDLE, REPLACEMENT);
  writeFileSync(file, after, "utf8");
  return { file, status: "patched" };
}

const root = path.join(process.cwd(), "node_modules");
try {
  statSync(root);
} catch {
  console.log(`[patch-tesseract] no node_modules at ${root}, skipping`);
  process.exit(0);
}

const targets = findTargets(root);
if (targets.length === 0) {
  console.log(
    "[patch-tesseract] no tesseract.js worker-script/node/index.js found",
  );
  process.exit(0);
}

let patched = 0;
let skipped = 0;
for (const t of targets) {
  const result = patchFile(t);
  if (result.status === "patched") {
    patched += 1;
    console.log(`[patch-tesseract] patched: ${result.file}`);
  } else {
    skipped += 1;
    console.log(`[patch-tesseract] ${result.status}: ${result.file}`);
  }
}
console.log(
  `[patch-tesseract] done: ${patched} patched, ${skipped} skipped (of ${targets.length} targets)`,
);
