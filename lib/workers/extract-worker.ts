/**
 * Single-file extraction client for the batch pool.
 *
 * Each call posts the label image + expected `ApplicationData` JSON to
 * `/api/extract-label` (the same stateless endpoint the single-review
 * page uses) and returns the parsed response.
 *
 * The pool wraps this function as the `JobRunner` callback. Tests mock
 * `fetch` so we don't depend on the real route. Production use is
 * identical — the function lives in plain main-thread code today.
 *
 * Why "extract-worker" if it's not a Web Worker right now? The original
 * plan was to bundle this as a real Web Worker. In practice, the
 * extraction is I/O-bound (network + server compute), so off-thread
 * execution buys us nothing — the bottleneck is the route handler,
 * not main-thread JS. We keep the name for parity with the slice plan
 * and so the call-site shape stays stable if we ever do offload.
 */

import type { ApplicationData, ExtractedLabelData } from "@/lib/ai/schema";
import type { FieldResult, OverallStatus } from "@/lib/verify/types";
import type { ImageQualityFlag } from "@/lib/quality/types";

export interface ExtractLabelInput {
  file: File;
  expected: ApplicationData;
  signal?: AbortSignal;
}

export interface ExtractLabelResponseShape {
  extracted: ExtractedLabelData;
  expected: ApplicationData;
  rawText: string;
  fieldResults: FieldResult[];
  overall: OverallStatus;
  processingTimeMs: number;
  aiSpend: { primaryUsd: number; fallbackUsd: number };
  ocrConfidence: number;
  imageWidth: number;
  imageHeight: number;
  imageQualityFlags: ImageQualityFlag[];
  imageQualityPoor: boolean;
}

export class ExtractLabelError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ExtractLabelError";
    this.status = status;
  }
}

export async function extractLabelOnce(
  input: ExtractLabelInput,
): Promise<ExtractLabelResponseShape> {
  const fd = new FormData();
  fd.append("image", input.file);
  fd.append("expected", JSON.stringify(input.expected));

  let response: Response;
  try {
    response = await fetch("/api/extract-label", {
      method: "POST",
      body: fd,
      signal: input.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw new ExtractLabelError("Extraction was cancelled.", 0);
    }
    throw new ExtractLabelError(
      cause instanceof Error
        ? `Network error: ${cause.message}`
        : "Unknown network error.",
      0,
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new ExtractLabelError(
      "Server returned an unexpected (non-JSON) response.",
      response.status,
    );
  }

  if (!response.ok) {
    const message =
      typeof (payload as { error?: unknown })?.error === "string"
        ? (payload as { error: string }).error
        : `Extraction failed (HTTP ${response.status}).`;
    throw new ExtractLabelError(message, response.status);
  }

  return payload as ExtractLabelResponseShape;
}
