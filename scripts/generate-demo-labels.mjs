import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Programmatic placeholder generator for the slice 0002/0003 demo labels.
 *
 * These are NOT real TTB-quality artwork — they are pixel-rasterised SVG
 * placeholders the e2e tests + reviewer demos can rely on without
 * needing real bottle photography. Slice 0009 polishes the visuals.
 */

const WIDTH = 1024;
const HEIGHT = 1280;

function buildSvg({ heading, subheading, abvLine, volume, bottler, addressLines, govWarningLines, accent }) {
  const accentStop = accent ?? ["#f5e9c8", "#d9b676"];
  const TEXT_LINES = [
    { text: heading, y: 220, size: 56, weight: 700, color: "#1a1a1a" },
    { text: subheading, y: 320, size: 32, weight: 600, color: "#1a1a1a" },
    { text: abvLine, y: 420, size: 28, weight: 500, color: "#222" },
    { text: volume, y: 480, size: 28, weight: 500, color: "#222" },
    { text: bottler, y: 580, size: 22, weight: 500, color: "#333" },
  ];
  for (let i = 0; i < addressLines.length; i++) {
    TEXT_LINES.push({
      text: addressLines[i],
      y: 620 + i * 30,
      size: 22,
      weight: 500,
      color: "#333",
    });
  }
  return `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${accentStop[0]}"/>
      <stop offset="100%" stop-color="${accentStop[1]}"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect x="64" y="64" width="${WIDTH - 128}" height="${HEIGHT - 128}" fill="none" stroke="#1a1a1a" stroke-width="3"/>
  ${TEXT_LINES.map((l) => `<text x="50%" y="${l.y}" text-anchor="middle" font-family="Georgia, serif" font-weight="${l.weight}" font-size="${l.size}" fill="${l.color}">${l.text}</text>`).join("\n")}
  ${govWarningLines.map((line, i) => `<text x="50%" y="${980 + i * 30}" text-anchor="middle" font-family="Helvetica, sans-serif" font-weight="600" font-size="20" fill="#1a1a1a">${line}</text>`).join("\n")}
</svg>
`;
}

const SCENARIOS = [
  {
    id: "01-spirits-pass",
    heading: "OLD TOM DISTILLERY",
    subheading: "KENTUCKY STRAIGHT BOURBON WHISKEY",
    abvLine: "45% Alc./Vol. (90 Proof)",
    volume: "750 mL",
    bottler: "BOTTLED BY OLD TOM DISTILLERY, LLC",
    addressLines: ["BARDSTOWN, KENTUCKY", "PRODUCT OF U.S.A."],
    govWarningLines: [
      "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON",
      "GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC",
      "BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK",
      "OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC",
      "BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR",
      "OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.",
    ],
    accent: ["#f5e9c8", "#d9b676"],
  },
  {
    id: "03-abv-mismatch",
    heading: "CEDAR RIDGE VODKA",
    subheading: "VODKA",
    // 38% on the label, 40% in the application — strict-fail.
    abvLine: "38% Alc./Vol. (76 Proof)",
    volume: "750 mL",
    bottler: "DISTILLED BY CEDAR RIDGE DISTILLING CO.",
    addressLines: ["SWISHER, IOWA", "PRODUCT OF U.S.A."],
    govWarningLines: [
      "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON",
      "GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC",
      "BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK",
      "OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC",
      "BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR",
      "OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.",
    ],
    accent: ["#e8f0ff", "#b8c6e6"],
  },
  {
    id: "04-gov-warn-lowercase",
    heading: "LAKESIDE GIN",
    subheading: "LONDON DRY GIN",
    abvLine: "47% Alc./Vol. (94 Proof)",
    volume: "750 mL",
    bottler: "BOTTLED BY LAKESIDE SPIRITS, LLC",
    addressLines: ["TRAVERSE CITY, MICHIGAN", "PRODUCT OF U.S.A."],
    // STRICT-FAIL: prefix is "Government Warning:" (title case) instead of all-caps.
    govWarningLines: [
      "Government Warning: (1) According to the Surgeon",
      "General, women should not drink alcoholic",
      "beverages during pregnancy because of the risk",
      "of birth defects. (2) Consumption of alcoholic",
      "beverages impairs your ability to drive a car or",
      "operate machinery, and may cause health problems.",
    ],
    accent: ["#e6f4ec", "#a8d3b5"],
  },
  // Slice 0004 additions:
  {
    // 02 — Stone's Throw nuanced brand match.
    // Application says "Stone's Throw" (mixed-case with a smart apostrophe);
    // the label shows "STONE'S THROW" all-caps. Should produce a Likely
    // Match via the nuanced ladder rather than a strict Fail.
    id: "02-stones-throw-caps",
    heading: "STONE'S THROW",
    subheading: "AMERICAN AMBER LAGER",
    abvLine: "5.2% Alc./Vol.",
    volume: "12 fl oz (355 mL)",
    bottler: "BREWED AND BOTTLED BY STONE'S THROW BREWING CO.",
    addressLines: ["BEND, OREGON", "PRODUCT OF U.S.A."],
    govWarningLines: [
      "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON",
      "GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC",
      "BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK",
      "OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC",
      "BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR",
      "OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.",
    ],
    accent: ["#f0e8e0", "#c9a78a"],
  },
  {
    // 05 — Incomplete government warning.
    // The warning text is truncated mid-sentence — strict Fail with the
    // "wording_mismatch" diagnostic.
    id: "05-warn-incomplete",
    heading: "RIVERFRONT VINEYARDS",
    subheading: "ESTATE CHARDONNAY",
    abvLine: "13.5% Alc./Vol.",
    volume: "750 mL",
    bottler: "VINTED AND BOTTLED BY RIVERFRONT VINEYARDS",
    addressLines: ["NAPA, CALIFORNIA", "PRODUCT OF U.S.A."],
    govWarningLines: [
      "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON",
      "GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC",
      "BEVERAGES DURING PREGNANCY...",
      // The warning ends here — second numbered statement is missing
      // entirely (truncated by the printer). Strict Fail.
    ],
    accent: ["#fbeaea", "#dcb1b1"],
  },
  {
    // 06 — Glare / blur image. Same artwork as 01 (Old Tom Distillery)
    // pre-rendered; we apply a Gaussian blur after generation so the
    // image-quality heuristics fire and demote any non-Fail cell to
    // Manual Review with the "Request Better Image" suggested action.
    id: "06-glare-blur",
    heading: "OLD TOM DISTILLERY",
    subheading: "KENTUCKY STRAIGHT BOURBON WHISKEY",
    abvLine: "45% Alc./Vol. (90 Proof)",
    volume: "750 mL",
    bottler: "BOTTLED BY OLD TOM DISTILLERY, LLC",
    addressLines: ["BARDSTOWN, KENTUCKY", "PRODUCT OF U.S.A."],
    govWarningLines: [
      "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON",
      "GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC",
      "BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK",
      "OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC",
      "BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR",
      "OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.",
    ],
    accent: ["#f5e9c8", "#d9b676"],
    // Marker — the generator applies a bright glare overlay AND a heavy blur
    // post-render so BOTH signals fire:
    //   1. `glare` — the bright rectangle pushes the exposure histogram's
    //      top-bin share above the GLARE_TOP_BIN threshold for that region.
    //   2. `blur`  — the Gaussian blur drops Laplacian variance below the
    //      LAPLACIAN_BLUR_THRESHOLD.
    // When slice 0009 swaps the e2e fixtures over to real Tesseract +
    // heuristics output, the demo will faithfully demonstrate "two flags
    // can co-occur" rather than a single signal masquerading as both.
    glareOverlay: true,
    blur: 12,
  },
];

const outputDir = path.resolve(process.cwd(), "public/demo-labels");

/**
 * Build a fully-opaque white-rectangle SVG overlay sized for the canvas.
 * Used by scenario 06 to inject a bright glare hot-spot region. Composited
 * AFTER the blur step so blur doesn't wash the bright pixels back into
 * the mid-tone band — the overlay stays at saturation (≥ 248) on enough
 * of the frame to push `extremeBinShare` over EXPOSURE_EXTREME_BIN_SHARE.
 *
 * Sized so that area / totalPixels ≈ 0.45, comfortably above the 0.4
 * threshold even after JPEG compression nudges some pixels off pure white.
 */
function buildGlareOverlaySvg() {
  // Cover ~50% of the image area as a saturated white blob.
  const x = Math.round(WIDTH * 0.05);
  const y = Math.round(HEIGHT * 0.05);
  const w = Math.round(WIDTH * 0.9);
  const h = Math.round(HEIGHT * 0.5);
  return `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>
</svg>
`;
}

for (const scenario of SCENARIOS) {
  const svg = buildSvg(scenario);
  let pipeline = sharp(Buffer.from(svg));
  if (typeof scenario.blur === "number" && scenario.blur > 0) {
    pipeline = pipeline.blur(scenario.blur);
  }
  if (scenario.glareOverlay) {
    // Composite the glare overlay AFTER blur — blur softens hard edges so
    // a pre-blur overlay loses its saturated pixels. Post-blur compositing
    // keeps the bright region at full saturation, which is what a real
    // camera flash hot-spot looks like in a final photo.
    pipeline = sharp(
      await pipeline
        .composite([{ input: Buffer.from(buildGlareOverlaySvg()), top: 0, left: 0 }])
        .png()
        .toBuffer(),
    );
  }
  const buffer = await pipeline.jpeg({ quality: 90 }).toBuffer();
  const out = path.join(outputDir, `${scenario.id}.jpg`);
  await writeFile(out, buffer);
  console.info(`wrote ${out} (${buffer.byteLength} bytes, ${WIDTH}x${HEIGHT})`);
}
