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
import { analyzeImageQuality } from "@/lib/quality/heuristics";
import type { ImageQualityFlag } from "@/lib/quality/types";
import { callJudgeUpstream } from "@/lib/ai/judge-call";
import type { CallJudgeFn } from "@/lib/verify/nuanced/ladder";

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

// 8 MB — fits typical phone-camera bottle photos at native resolution.
// sharp downsizes anything >2 MP after upload, so this only gates the
// raw upload size; downstream Claude/OpenRouter sees a much smaller
// re-encoded JPEG. Originally 4 MB; bumped to support real-world
// reviewer photos (Phase-9 follow-up).
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface ExtractLabelSuccessBody {
  extracted: import("@/lib/ai/schema").ExtractedLabelData;
  expected: ApplicationData;
  rawText: string;
  fieldResults: FieldResult[];
  overall: OverallStatus;
  processingTimeMs: number;
  /**
   * Per-model AI spend. `fallbackUsd` is 0 today because the route only
   * calls the primary model — it's wired now so when the fallback path
   * lands the History record / cost panels don't silently drop the spend.
   */
  aiSpend: { primaryUsd: number; fallbackUsd: number };
  ocrConfidence: number;
  imageWidth: number;
  imageHeight: number;
  /**
   * Image-quality flags (slice 0004 R-011). Empty when the image is
   * clean — heuristic + LLM-notes combined.
   */
  imageQualityFlags: ImageQualityFlag[];
  /** True when at least one image-quality flag fired. */
  imageQualityPoor: boolean;
  /**
   * Which subsystem produced `rawText` and the bbox `words`:
   *   - `tesseract`     — full Tesseract.js OCR ran (local dev path).
   *   - `llm-fallback`  — Tesseract was skipped (Vercel deploy path).
   *                       `rawText` falls back to the LLM's verbatim
   *                       gov-warning capture, and bbox highlighting
   *                       degrades gracefully (empty word stream).
   * Documented in `decisions/0007-ocr-prod-vs-local.md`.
   */
  ocrSource: "tesseract" | "llm-fallback";
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
      { error: "Image exceeds the 8 MB upload limit." },
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

  // Vercel's experimental Rust-based bytecode runtime cannot resolve the
  // worker_threads CJS require chain that tesseract.js v5 produces (every
  // patch we tried — pnpm patch, packageManager pin, prebuild string
  // replace, file tracing — was silently overridden by Vercel's runtime).
  // On Vercel we therefore skip Tesseract entirely and use the LLM's own
  // verbatim gov-warning capture as the rawText source. The strict
  // matcher still runs server-side against the canonical 27 CFR § 16.21
  // text, so the 100 %-recall guarantee is empirically intact (Layer 2
  // against the deployed instance shows 11/11). Local dev still runs
  // Tesseract in parallel — see `decisions/0007-ocr-prod-vs-local.md`.
  const skipTesseract = !!process.env.VERCEL;
  const ocrSource: "tesseract" | "llm-fallback" = skipTesseract
    ? "llm-fallback"
    : "tesseract";

  let extraction: Awaited<ReturnType<typeof extractLabel>>;
  let ocr: Awaited<ReturnType<typeof tesseractExtract>>;
  try {
    if (skipTesseract) {
      extraction = await extractLabel(
        processedBuffer,
        env.OPENROUTER_MODEL_PRIMARY,
      );
      // Synthesize an empty OCR result. The LLM gov-warning text below
      // is what actually drives the strict matcher.
      ocr = { text: "", words: [], confidence: 0 };
    } else {
      [extraction, ocr] = await Promise.all([
        extractLabel(processedBuffer, env.OPENROUTER_MODEL_PRIMARY),
        tesseractExtract(processedBuffer),
      ]);
    }
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

  // On the Vercel/LLM-fallback path the Tesseract text is empty; use the
  // LLM's verbatim gov-warning capture as rawText so the strict matcher
  // has its expected input. The system prompt instructs the model to
  // preserve capitalization and punctuation exactly. The synthesized
  // rawText also surfaces in the UI's "Raw OCR Text" panel.
  const llmGovText = extraction.data.governmentWarningText.value;
  const fallbackRawText =
    typeof llmGovText === "string" && llmGovText.length > 0 ? llmGovText : "";
  const effectiveRawText = skipTesseract ? fallbackRawText : ocr.text;

  // Merge rawText into the extraction payload (the schema field exists
  // since slice 0002).
  const mergedExtracted = {
    ...extraction.data,
    rawText: effectiveRawText,
  };

  // Compute image-quality heuristics on the preprocessed buffer. Cheap
  // enough to run synchronously after extraction since both Tesseract
  // and the LLM call have already finished. We pass the LLM's
  // `imageQualityNotes` so the regex parser merges with the heuristic
  // signals.
  let imageQualityResult: Awaited<ReturnType<typeof analyzeImageQuality>>;
  try {
    imageQualityResult = await analyzeImageQuality(
      processedBuffer,
      mergedExtracted.imageQualityNotes,
    );
  } catch (cause) {
    // Quality analysis is non-fatal — we'd rather ship a verification
    // without the override than 500 the whole request.
    console.error("[extract-label] image-quality analysis failed", cause);
    imageQualityResult = {
      flags: [],
      poor: false,
      signals: {
        laplacianVariance: null,
        meanLuminance: null,
        extremeBinShare: null,
      },
      sources: [],
    };
  }

  // Per-request judge memoization. The pipeline may invoke the judge for
  // multiple gray-band fields (brand, classType, bottlerName, country),
  // and a single label often has the same brand text driving more than
  // one comparison. This memoization keeps a single failed judge call
  // from blocking the rest of the pipeline.
  const judgeCache = new Map<
    string,
    Awaited<ReturnType<typeof callJudgeUpstream>>
  >();
  const callJudge: CallJudgeFn = async ({ extracted, expected, fieldName }) => {
    const key = JSON.stringify({ e: extracted, x: expected, f: fieldName ?? "" });
    let result = judgeCache.get(key);
    if (!judgeCache.has(key)) {
      result = await callJudgeUpstream(
        { extracted, expected, fieldName },
        env,
      );
      judgeCache.set(key, result);
    }
    if (!result) {
      // Surface as an "uncertain" verdict so the ladder routes to
      // manual-review without throwing.
      return {
        verdict: "uncertain",
        reasoning: "Judge upstream unavailable; routing to manual review.",
      };
    }
    return { verdict: result.verdict, reasoning: result.reasoning };
  };

  const verification = await runVerificationPipeline({
    extracted: mergedExtracted,
    expected: applicationParse.data,
    words: ocr.words,
    rawText: effectiveRawText,
    imageDims: { width: imageWidth, height: imageHeight },
    imageQuality: {
      poor: imageQualityResult.poor,
      flags: imageQualityResult.flags,
    },
    // Slice 0009 — gray-band judge wiring. Strict fields cannot reach
    // here; only the nuanced ladder dispatches when 0.78 ≤ similarity <
    // 0.92.
    callJudge,
  });

  const processingTimeMs = Date.now() - start;

  return NextResponse.json<ExtractLabelSuccessBody>(
    {
      extracted: mergedExtracted,
      expected: applicationParse.data,
      rawText: effectiveRawText,
      fieldResults: verification.fieldResults,
      overall: verification.overall,
      processingTimeMs,
      // Fallback path isn't wired yet — see ExtractLabelSuccessBody.aiSpend
      // doc-comment. We still emit `fallbackUsd: 0` so persisted Review
      // records have a stable shape.
      aiSpend: { primaryUsd: extraction.costUsd, fallbackUsd: 0 },
      ocrConfidence: ocr.confidence,
      imageWidth,
      imageHeight,
      imageQualityFlags: imageQualityResult.flags,
      imageQualityPoor: imageQualityResult.poor,
      ocrSource,
    },
    { status: 200 },
  );
}
