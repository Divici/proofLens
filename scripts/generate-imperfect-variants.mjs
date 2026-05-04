#!/usr/bin/env node
/**
 * Generate imperfect-image variants of the existing real bottle photos
 * via sharp. Each variant exercises a specific image-quality heuristic
 * the verifier already understands (Laplacian-variance blur, exposure-
 * histogram glare, mean-luminance low-light) so the queue gets more
 * "Jenny Park" cases — angles, lighting, glare — without needing new
 * source photography.
 *
 * Idempotent: overwrites existing variants if they're already on disk.
 *
 * Usage:
 *   node scripts/generate-imperfect-variants.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const REAL_DIR = join(REPO_ROOT, "public", "demo-labels", "real");

/**
 * Each variant takes a source photo + a sharp pipeline + an output
 * filename. The pipeline returns a sharp instance ready to write.
 */
const variants = [
  {
    source: "bacardi-rasberry-FRONT.jpeg",
    output: "bacardi-rasberry-LOWLIGHT.jpeg",
    description:
      "Bacardi Raspberry — under-exposed (low-light heuristic test)",
    transform: (s) => s.modulate({ brightness: 0.35 }),
  },
  {
    source: "jack-daniels-ANGLE.jpeg",
    output: "jack-daniels-ANGLE-BLUR.jpeg",
    description:
      "Jack Daniel's — angled + heavy motion blur (Laplacian + angle test)",
    transform: (s) => s.blur(10),
  },
  {
    source: "ron-zacapa-FRONT.jpeg",
    output: "ron-zacapa-FRONT-DIM.jpeg",
    description:
      "Ron Zacapa — dim warehouse lighting (low-light + gov-warning recall stress)",
    transform: (s) => s.modulate({ brightness: 0.4, saturation: 0.85 }),
  },
  {
    source: "bacardi-rasberry-FRONT.jpeg",
    output: "bacardi-rasberry-OVEREXPOSED.jpeg",
    description:
      "Bacardi Raspberry — blown-out highlights (glare-style histogram test)",
    transform: (s) => s.modulate({ brightness: 1.7 }).gamma(2.4),
  },
  {
    source: "jack-daniels-ANGLE.jpeg",
    output: "jack-daniels-DIM-BLUR.jpeg",
    description:
      "Jack Daniel's — combined dim + soft blur (compound image-quality flags)",
    transform: (s) => s.modulate({ brightness: 0.45 }).blur(5),
  },
];

let failures = 0;
for (const v of variants) {
  const sourcePath = join(REAL_DIR, v.source);
  const outputPath = join(REAL_DIR, v.output);
  if (!existsSync(sourcePath)) {
    console.error(`✗ Source missing: ${v.source} — skipping ${v.output}`);
    failures += 1;
    continue;
  }
  try {
    const pipeline = v.transform(sharp(sourcePath));
    await pipeline.jpeg({ quality: 88, mozjpeg: true }).toFile(outputPath);
    console.log(`✓ ${v.output}`);
  } catch (cause) {
    console.error(`✗ Failed to produce ${v.output}:`, cause);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`\n${failures} variant(s) failed.`);
  process.exit(1);
}
console.log(
  `\nDone — ${variants.length} variants written to public/demo-labels/real/.`,
);
console.log(
  "Next: update public/demo-labels/real/manifest.json with the new entries.",
);
