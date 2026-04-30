import { NextResponse } from "next/server";
import sharp from "sharp";
import { ApplicationDataSchema, type ApplicationData } from "@/lib/ai/schema";
import {
  extractLabel,
  OpenRouterExtractionError,
} from "@/lib/ai/openrouter";
import { preprocess } from "@/lib/image/preprocess";
import { tesseractExtract } from "@/lib/ocr/tesseract";
import { runVerificationPipeline } from "@/lib/verify/pipeline";
import type { FieldResult, OverallStatus } from "@/lib/verify/types";
import { validateEnv } from "@/lib/env";

/**
 * POST /api/extract-label — stateless single-label extraction +
 * verification.
 *
 * Body: `multipart/form-data` with two parts —
 *   - `image`  : the label artwork (any sharp-readable format)
 *   - `expected`: JSON string conforming to `ApplicationData`
 *
 * Pipeline:
 *   1. Preprocess the image (sharp) — autorotate + downscale to ≤ 2 MP.
 *   2. Run Claude Haiku (LLM) and Tesseract.js (OCR) **in parallel**.
 *   3. Run the verification pipeline (`lib/verify/pipeline.ts`) over the
 *      merged result, locating bbox highlights via the OCR word stream.
 *   4. Return `{ extracted, expected, rawText, fieldResults, overall,
 *                processingTimeMs, aiSpend, ocrConfidence }`.
 *
 * No persistence — per Marcus IT note, the original buffer is dropped at
 * the end of the request.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

interface ExtractLabelSuccessBody {
  extracted: import("@/lib/ai/schema").ExtractedLabelData;
  expected: ApplicationData;
  rawText: string;
  fieldResults: FieldResult[];
  overall: OverallStatus;
  processingTimeMs: number;
  aiSpend: { primaryUsd: number };
  ocrConfidence: number;
  imageWidth: number;
  imageHeight: number;
}

interface ZodIssueShape {
  path: string;
  message: string;
}

interface ExtractLabelErrorBody {
  error: string;
  issues?: ZodIssueShape[];
}

export async function POST(
  request: Request,
): Promise<
  NextResponse<ExtractLabelSuccessBody | ExtractLabelErrorBody>
> {
  const start = Date.now();

  let env;
  try {
    env = validateEnv();
  } catch (err) {
    console.error("[extract-label] env validation failed", err);
    return NextResponse.json<ExtractLabelErrorBody>(
      {
        error:
          "The extraction service is temporarily unavailable. Please try again later.",
      },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json<ExtractLabelErrorBody>(
      { error: "Request must be multipart/form-data." },
      { status: 400 },
    );
  }

  const imageEntry = formData.get("image");
  const expectedEntry = formData.get("expected");

  if (!imageEntry || !(imageEntry instanceof Blob)) {
    return NextResponse.json<ExtractLabelErrorBody>(
      { error: "Missing required `image` part in form data." },
      { status: 400 },
    );
  }
  if (imageEntry.size === 0) {
    return NextResponse.json<ExtractLabelErrorBody>(
      { error: "Uploaded image is empty." },
      { status: 400 },
    );
  }
  if (imageEntry.size > MAX_IMAGE_BYTES) {
    return NextResponse.json<ExtractLabelErrorBody>(
      { error: "Image exceeds the 4 MB upload limit." },
      { status: 413 },
    );
  }

  if (typeof expectedEntry !== "string" || expectedEntry.trim() === "") {
    return NextResponse.json<ExtractLabelErrorBody>(
      { error: "Missing required `expected` JSON in form data." },
      { status: 400 },
    );
  }

  let parsedExpected: unknown;
  try {
    parsedExpected = JSON.parse(expectedEntry);
  } catch {
    return NextResponse.json<ExtractLabelErrorBody>(
      { error: "`expected` payload is not valid JSON." },
      { status: 400 },
    );
  }

  const applicationParse = ApplicationDataSchema.safeParse(parsedExpected);
  if (!applicationParse.success) {
    const issues: ZodIssueShape[] = applicationParse.error.issues.map((i) => ({
      path: i.path.join(".") || "(root)",
      message: i.message,
    }));
    return NextResponse.json<ExtractLabelErrorBody>(
      {
        error:
          "Some required fields in the expected application data are missing or invalid.",
        issues,
      },
      { status: 400 },
    );
  }

  const arrayBuffer = await imageEntry.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  let processedBuffer: Buffer;
  let imageWidth: number;
  let imageHeight: number;
  try {
    const preprocessed = await preprocess(inputBuffer);
    processedBuffer = preprocessed.buffer;
    // sharp metadata gives us the rendered dimensions for the bbox overlay.
    const meta = await sharp(processedBuffer).metadata();
    // BoundingBoxSchema requires positive dimensions and the SVG viewBox
    // breaks at width=0/height=0. Refuse the request rather than silently
    // shipping a broken overlay.
    if (
      typeof meta.width !== "number" ||
      typeof meta.height !== "number" ||
      meta.width <= 0 ||
      meta.height <= 0
    ) {
      console.error("[extract-label] image metadata missing dimensions", {
        width: meta.width,
        height: meta.height,
      });
      return NextResponse.json<ExtractLabelErrorBody>(
        {
          error:
            "Could not read image dimensions. Please try uploading the file again or pick a different image.",
        },
        { status: 400 },
      );
    }
    imageWidth = meta.width;
    imageHeight = meta.height;
  } catch (cause) {
    console.error("[extract-label] preprocess failed", cause);
    return NextResponse.json<ExtractLabelErrorBody>(
      {
        error:
          "We could not read that image. Try a clearer JPEG or PNG of the label.",
      },
      { status: 400 },
    );
  }

  let extraction: Awaited<ReturnType<typeof extractLabel>>;
  let ocr: Awaited<ReturnType<typeof tesseractExtract>>;
  try {
    [extraction, ocr] = await Promise.all([
      extractLabel(processedBuffer, env.OPENROUTER_MODEL_PRIMARY),
      tesseractExtract(processedBuffer),
    ]);
  } catch (cause) {
    if (cause instanceof OpenRouterExtractionError) {
      console.error("[extract-label] openrouter call failed", cause);
      return NextResponse.json<ExtractLabelErrorBody>(
        {
          error:
            "The vision provider could not extract this label. Please try again in a moment.",
        },
        { status: 502 },
      );
    }
    console.error("[extract-label] unexpected error", cause);
    return NextResponse.json<ExtractLabelErrorBody>(
      { error: "Unexpected server error during extraction." },
      { status: 500 },
    );
  }

  // Merge Tesseract rawText into the extraction payload (the schema field
  // exists since slice 0002).
  const mergedExtracted = {
    ...extraction.data,
    rawText: ocr.text,
  };

  const verification = await runVerificationPipeline({
    extracted: mergedExtracted,
    expected: applicationParse.data,
    words: ocr.words,
    rawText: ocr.text,
    imageDims: { width: imageWidth, height: imageHeight },
    // Note: the LLM-judge endpoint at /api/judge-field exists but is NOT
    // YET called from this pipeline; gray-band cases route to
    // "manual-review" status until production wiring lands. See
    // slice-3-detail.md track 5.
  });

  const processingTimeMs = Date.now() - start;

  return NextResponse.json<ExtractLabelSuccessBody>(
    {
      extracted: mergedExtracted,
      expected: applicationParse.data,
      rawText: ocr.text,
      fieldResults: verification.fieldResults,
      overall: verification.overall,
      processingTimeMs,
      aiSpend: { primaryUsd: extraction.costUsd },
      ocrConfidence: ocr.confidence,
      imageWidth,
      imageHeight,
    },
    { status: 200 },
  );
}
