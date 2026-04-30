import { NextResponse } from "next/server";
import { ApplicationDataSchema, type ApplicationData } from "@/lib/ai/schema";
import {
  extractLabel,
  OpenRouterExtractionError,
} from "@/lib/ai/openrouter";
import { preprocess } from "@/lib/image/preprocess";
import { validateEnv } from "@/lib/env";

/**
 * POST /api/extract-label — stateless single-label extraction.
 *
 * Body: `multipart/form-data` with two parts —
 *   - `image`  : the label artwork (any sharp-readable format)
 *   - `expected`: JSON string conforming to `ApplicationData`
 *
 * The handler preprocesses the image in-memory, sends it through the
 * vision LLM (Claude Haiku 4.5 by default), and returns the raw
 * `ExtractedLabelData` plus latency + cost telemetry. No persistence —
 * per Marcus IT note, the original buffer is dropped at the end of the
 * request.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB upload ceiling

interface ExtractLabelSuccessBody {
  extracted: import("@/lib/ai/schema").ExtractedLabelData;
  expected: ApplicationData;
  processingTimeMs: number;
  aiSpend: { primaryUsd: number };
}

interface ExtractLabelErrorBody {
  error: string;
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
  } catch {
    return NextResponse.json<ExtractLabelErrorBody>(
      { error: "Server is misconfigured. Check OPENROUTER_* variables." },
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
      { error: "Image exceeds the 15 MB upload limit." },
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
    const detail = applicationParse.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return NextResponse.json<ExtractLabelErrorBody>(
      { error: `\`expected\` payload failed validation: ${detail}` },
      { status: 400 },
    );
  }

  const arrayBuffer = await imageEntry.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  let processedBuffer: Buffer;
  try {
    const preprocessed = await preprocess(inputBuffer);
    processedBuffer = preprocessed.buffer;
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
  try {
    extraction = await extractLabel(
      processedBuffer,
      env.OPENROUTER_MODEL_PRIMARY,
    );
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

  const processingTimeMs = Date.now() - start;

  return NextResponse.json<ExtractLabelSuccessBody>(
    {
      extracted: extraction.data,
      expected: applicationParse.data,
      processingTimeMs,
      aiSpend: { primaryUsd: extraction.costUsd },
    },
    { status: 200 },
  );
}
