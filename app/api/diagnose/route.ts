import { NextResponse } from "next/server";
import { tesseractExtract } from "@/lib/ocr/tesseract";
import { readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface DiagnoseBody {
  ok: boolean;
  step: string;
  durations: Record<string, number>;
  vercelUrl: string | null;
  cwd: string;
  bundledTraineddata: { exists: boolean; size: number | null; checkPath: string };
  bundleAudit: Record<string, boolean>;
  error?: string;
  ocrTextSnippet?: string;
}

/**
 * Temporary diagnostic endpoint for Phase-9 deploy debugging. Reports:
 *   - whether the bundled eng.traineddata is present in the function bundle
 *   - VERCEL_URL + cwd
 *   - per-step timing of a Tesseract init + OCR run on a 1-pixel image
 * Strip after deploy stabilises.
 */
export async function GET(): Promise<NextResponse<DiagnoseBody>> {
  const durations: Record<string, number> = {};
  const checkPath = path.join(process.cwd(), "public", "tessdata", "eng.traineddata");
  let bundled = { exists: false, size: null as number | null, checkPath };
  try {
    const buf = readFileSync(checkPath);
    bundled = { exists: true, size: buf.byteLength, checkPath };
  } catch {
    // Leave bundled as exists:false
  }

  // Audit which tesseract.js bundle files are actually present in the
  // /var/task tree. Helps diagnose why require('..') and require of the
  // wasm core files might fail at runtime.
  const cwd = process.cwd();
  const auditPaths = {
    "tesseract.js index.js":
      "node_modules/tesseract.js/src/index.js",
    "tesseract.js worker-script/index.js":
      "node_modules/tesseract.js/src/worker-script/index.js",
    "tesseract.js worker-script/node/index.js":
      "node_modules/tesseract.js/src/worker-script/node/index.js",
    "tesseract.js worker-script/node/getCore.js":
      "node_modules/tesseract.js/src/worker-script/node/getCore.js",
    "tesseract.js-core simd-lstm.wasm":
      "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm",
    "tesseract.js-core simd-lstm.wasm.js":
      "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
    "tesseract.js-core simd.wasm":
      "node_modules/tesseract.js-core/tesseract-core-simd.wasm",
    "wasm-feature-detect index.js":
      "node_modules/wasm-feature-detect/dist/cjs/index.js",
  };
  const bundleAudit: Record<string, boolean> = {};
  for (const [label, rel] of Object.entries(auditPaths)) {
    try {
      readFileSync(path.join(cwd, rel));
      bundleAudit[label] = true;
    } catch {
      bundleAudit[label] = false;
    }
  }

  // Tiny 1x1 white JPEG so the OCR call resolves quickly once init is done.
  const tinyJpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AAAH//Z",
    "base64",
  );

  const t0 = Date.now();
  const step = "tesseract-init";
  try {
    // tesseractExtract internally calls getWorker() which inits the
    // worker singleton on first invocation. Time the whole call.
    const result = await tesseractExtract(tinyJpeg);
    durations.tesseractTotal = Date.now() - t0;
    return NextResponse.json({
      ok: true,
      step,
      durations,
      vercelUrl: process.env.VERCEL_URL ?? null,
      cwd: process.cwd(),
      bundledTraineddata: bundled,
      bundleAudit,
      ocrTextSnippet: (result.text ?? "").slice(0, 80),
    });
  } catch (cause) {
    durations.tesseractTotal = Date.now() - t0;
    return NextResponse.json(
      {
        ok: false,
        step,
        durations,
        vercelUrl: process.env.VERCEL_URL ?? null,
        cwd: process.cwd(),
        bundledTraineddata: bundled,
        bundleAudit,
        error:
          cause instanceof Error
            ? `${cause.name}: ${cause.message}`
            : String(cause),
      },
      { status: 500 },
    );
  }
}
