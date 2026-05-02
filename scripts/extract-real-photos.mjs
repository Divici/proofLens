#!/usr/bin/env node
/**
 * One-off helper. POSTs every JPEG/JPG/PNG under public/demo-labels/real/
 * to the local /api/extract-label endpoint with a placeholder
 * application-data payload, then prints a manifest.json fragment built
 * from the LLM's extracted fields. The reviewer hand-tunes any rows
 * the vision pass got wrong before committing.
 *
 *   pnpm dev   # in another terminal
 *   node scripts/extract-real-photos.mjs > public/demo-labels/real/manifest.json
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, basename, extname } from "node:path";

const DIR = "public/demo-labels/real";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const SUPPORTED = /\.(jpe?g|png|webp)$/i;

function describeFromFilename(file) {
  // valley-oak-cab-FRONT.jpg -> "Front"
  const base = basename(file, extname(file));
  const variantMatch = base.match(/-([A-Z][A-Z-]+)$/);
  if (variantMatch) {
    const v = variantMatch[1].toLowerCase().replace(/-/g, " ");
    return v.charAt(0).toUpperCase() + v.slice(1);
  }
  return "Real bottle photo";
}

async function extract(filename) {
  const buf = readFileSync(join(DIR, filename));
  const blob = new Blob([buf], { type: "image/jpeg" });
  const fd = new FormData();
  fd.set("image", blob, filename);
  // Empty-ish placeholder application-data so the route accepts the
  // request. We don't care about the verification verdict — only the
  // extracted ApplicationData-shaped fields.
  fd.set(
    "expected",
    JSON.stringify({
      brand: "—",
      classType: "—",
      abv: 0,
      netContents: "—",
      bottlerName: "—",
      bottlerAddress: "—",
      countryOfOrigin: "—",
      govWarningRequired: true,
      applicationNotes: "",
      beverageType: "distilled-spirits",
    }),
  );

  const res = await fetch(`${BASE_URL}/api/extract-label`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} for ${filename}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.extracted;
}

function inferBeverageType(extracted, filename) {
  const ct = (extracted.classType?.value ?? "").toLowerCase();
  const fn = filename.toLowerCase();
  if (
    /wine|cabernet|chardonnay|merlot|pinot|sauvignon|riesling|rose|champagne/.test(
      ct,
    )
  )
    return "wine";
  if (/beer|ale|lager|stout|porter|ipa|pilsner|malt/.test(ct + fn))
    return "malt-beverage";
  if (/whiskey|whisky|vodka|gin|rum|tequila|bourbon|spirit|liqueur/.test(ct + fn))
    return "distilled-spirits";
  return "distilled-spirits";
}

function pick(field, fallback) {
  const v = field?.value;
  if (v === null || v === undefined || v === "") return fallback;
  return v;
}

function buildEntry(filename, extracted) {
  const beverageType = inferBeverageType(extracted, filename);
  const abvRaw = extracted.abvPercent?.value;
  const abv =
    typeof abvRaw === "number" ? abvRaw : abvRaw ? Number(abvRaw) || 0 : 0;
  return {
    filename,
    description: describeFromFilename(filename),
    applicationData: {
      brand: pick(extracted.brand, "Unknown"),
      classType: pick(extracted.classType, "Unknown"),
      abv,
      netContents: pick(extracted.netContents, "750 mL"),
      bottlerName: pick(extracted.bottlerName, "Unknown"),
      bottlerAddress: pick(extracted.bottlerAddress, "Unknown"),
      countryOfOrigin: pick(extracted.countryOfOrigin, "United States"),
      govWarningRequired: true,
      applicationNotes: "",
      beverageType,
    },
    _extractionMeta: {
      brandConfidence: extracted.brand?.confidence ?? null,
      classTypeConfidence: extracted.classType?.confidence ?? null,
      extractionConfidence: extracted.extractionConfidence ?? null,
    },
  };
}

const files = readdirSync(DIR)
  .filter((f) => SUPPORTED.test(f))
  .sort();

if (files.length === 0) {
  console.error(`[extract-real-photos] no images found under ${DIR}`);
  process.exit(0);
}

const manifest = [];
for (const file of files) {
  process.stderr.write(`[extract-real-photos] ${file} ... `);
  try {
    const extracted = await extract(file);
    manifest.push(buildEntry(file, extracted));
    process.stderr.write("ok\n");
  } catch (err) {
    process.stderr.write(`FAIL: ${err.message}\n`);
    manifest.push({
      filename: file,
      description: describeFromFilename(file),
      applicationData: {
        brand: "Unknown",
        classType: "Unknown",
        abv: 0,
        netContents: "750 mL",
        bottlerName: "Unknown",
        bottlerAddress: "Unknown",
        countryOfOrigin: "United States",
        govWarningRequired: true,
        applicationNotes: "",
        beverageType: "distilled-spirits",
      },
      _extractionError: err.message,
    });
  }
}

process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
