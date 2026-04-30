/**
 * Generate the slice-0002 placeholder demo label image.
 *
 * Usage: `pnpm tsx scripts/generate-demo-labels.ts` — but more typically
 * we just run this once and check the output JPEG into git. Slice 0009
 * replaces these placeholders with the final demo bundle.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const WIDTH = 1024;
const HEIGHT = 1280;

const TEXT_LINES: Array<{
  text: string;
  y: number;
  size: number;
  weight: number;
  color: string;
}> = [
  {
    text: "OLD TOM DISTILLERY",
    y: 220,
    size: 56,
    weight: 700,
    color: "#1a1a1a",
  },
  {
    text: "KENTUCKY STRAIGHT BOURBON WHISKEY",
    y: 320,
    size: 32,
    weight: 600,
    color: "#1a1a1a",
  },
  {
    text: "45% Alc./Vol. (90 Proof)",
    y: 420,
    size: 28,
    weight: 500,
    color: "#222",
  },
  { text: "750 mL", y: 480, size: 28, weight: 500, color: "#222" },
  {
    text: "BOTTLED BY OLD TOM DISTILLERY, LLC",
    y: 580,
    size: 22,
    weight: 500,
    color: "#333",
  },
  {
    text: "BARDSTOWN, KENTUCKY",
    y: 620,
    size: 22,
    weight: 500,
    color: "#333",
  },
  {
    text: "PRODUCT OF U.S.A.",
    y: 680,
    size: 22,
    weight: 500,
    color: "#333",
  },
];

const GOV_WARNING_LINES = [
  "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON",
  "GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC",
  "BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK",
  "OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC",
  "BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR",
  "OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.",
];

async function main() {
  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f5e9c8"/>
          <stop offset="100%" stop-color="#d9b676"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
      <rect x="64" y="64" width="${WIDTH - 128}" height="${HEIGHT - 128}" fill="none" stroke="#1a1a1a" stroke-width="3"/>
      ${TEXT_LINES.map(
        (l) =>
          `<text x="50%" y="${l.y}" text-anchor="middle" font-family="Georgia, serif" font-weight="${l.weight}" font-size="${l.size}" fill="${l.color}">${l.text}</text>`,
      ).join("\n")}
      ${GOV_WARNING_LINES.map(
        (line, i) =>
          `<text x="50%" y="${980 + i * 30}" text-anchor="middle" font-family="Helvetica, sans-serif" font-weight="600" font-size="20" fill="#1a1a1a">${line}</text>`,
      ).join("\n")}
    </svg>
  `;

  const outputPath = path.resolve(
    process.cwd(),
    "public/demo-labels/01-spirits-pass.jpg",
  );

  const buffer = await sharp(Buffer.from(svg))
    .jpeg({ quality: 90 })
    .toBuffer();
  await writeFile(outputPath, buffer);
  console.info(
    `wrote ${outputPath} (${buffer.byteLength} bytes, ${WIDTH}x${HEIGHT})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
