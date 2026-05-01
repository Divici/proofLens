import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { z } from "zod";
import { ReviewReport } from "@/lib/export/pdf/template";
import { ReviewWirePayloadSchema } from "@/lib/export/pdf/wire";

/**
 * POST /api/render-pdf — stateless PDF rendering.
 *
 * Accepts a JSON envelope containing a serialised Review, a base64-encoded
 * thumbnail blob, and the app version. The handler reconstructs the data
 * URL and renders `<ReviewReport>` to a PDF buffer via
 * `@react-pdf/renderer#renderToBuffer`. Nothing persists server-side —
 * per Marcus's IT note ("not storing anything sensitive for this
 * exercise"), the request body is dropped at the end of the call.
 *
 * Why JSON over multipart: Reviews live in the browser's IndexedDB. The
 * client serialises them once and POSTs the envelope. Keeps the contract
 * simple and the handler easy to unit-test.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeFilename(brand: string): string {
  const slug = brand
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60);
  return `prooflens-review-${slug || "label"}.pdf`;
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = ReviewWirePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid render-pdf payload.",
        issues: parsed.error.issues.map((i: z.ZodIssue) => ({
          path: i.path.join(".") || "(root)",
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const { review, thumbnailBase64, thumbnailMimeType, appVersion } =
    parsed.data;

  // The thumbnail is optional on the wire — the PDF still renders without
  // an image, with a small "(thumbnail unavailable)" gap in the layout.
  const thumbnailDataUrl = thumbnailBase64
    ? `data:${thumbnailMimeType ?? "image/jpeg"};base64,${thumbnailBase64}`
    : "";

  // The wire schema is intentionally loose on `rulesVersion` (string)
  // vs. the canonical `RulesVersion` literal. ReviewReport only reads
  // it as a display value, so cast through `unknown` here. We attach a
  // placeholder Blob so the type matches even though the renderer only
  // reads the thumbnail data URL we pass separately.
  const reviewWithBlob = {
    ...review,
    thumbnail: new Blob([], { type: thumbnailMimeType ?? "image/jpeg" }),
  } as unknown as import("@/lib/storage/types").Review;

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(
      ReviewReport({
        review: reviewWithBlob,
        thumbnailDataUrl,
        appVersion,
      }),
    );
  } catch (cause) {
    console.error("[render-pdf] PDF render failed", cause);
    return NextResponse.json(
      { error: "Could not render the PDF." },
      { status: 500 },
    );
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${safeFilename(review.brand)}"`,
      // No-store: this is dynamic per-request output. Vercel honours it.
      "cache-control": "no-store",
    },
  });
}
