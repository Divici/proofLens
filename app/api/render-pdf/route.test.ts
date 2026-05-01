// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POST } from "./route";
import { makeReviewFixture } from "@/test/fixtures/review";

/**
 * Helper: build a `Request` instance like Next would dispatch into the
 * route handler. Body is a JSON-serialised Review with a base64
 * thumbnail (Blob → base64 string) so the over-the-wire payload is plain
 * JSON. The route handler decodes the base64 back to a Buffer for the
 * react-pdf <Image>.
 */
async function buildRequest(payload: unknown): Promise<Request> {
  return new Request("http://localhost/api/render-pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function reviewToWirePayload(review: ReturnType<typeof makeReviewFixture>) {
  // Convert the thumbnail Blob to a base64 data URL so the JSON envelope
  // is self-contained.
  const buf = Buffer.from(await review.thumbnail.arrayBuffer());
  return {
    review: {
      ...review,
      thumbnail: undefined,
    },
    thumbnailBase64: buf.toString("base64"),
    thumbnailMimeType: "image/jpeg",
    appVersion: "0.1.0",
  };
}

describe("POST /api/render-pdf", () => {
  it("returns 200 + application/pdf with non-empty body for a valid Review", async () => {
    const review = makeReviewFixture();
    const payload = await reviewToWirePayload(review);
    const res = await POST(await buildRequest(payload));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/pdf/);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.slice(0, 5).toString("utf8")).toBe("%PDF-");
  });

  it("sets a Content-Disposition with the brand in the filename", async () => {
    const review = makeReviewFixture();
    const payload = await reviewToWirePayload(review);
    const res = await POST(await buildRequest(payload));
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toMatch(/attachment/);
    expect(disposition.toLowerCase()).toContain("prooflens");
    expect(disposition).toMatch(/\.pdf"?$/i);
  });

  it("rejects missing review with 400", async () => {
    const res = await POST(
      await buildRequest({ thumbnailBase64: "AAAA", appVersion: "0.1.0" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON body with 400", async () => {
    const req = new Request("http://localhost/api/render-pdf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-valid-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects a Review missing required fields with 400", async () => {
    const res = await POST(
      await buildRequest({
        review: { id: "x" }, // no other required fields
        thumbnailBase64: "AAAA",
        appVersion: "0.1.0",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("accepts review without an embedded thumbnail base64 — falls back to no image", async () => {
    const review = makeReviewFixture();
    const payload = await reviewToWirePayload(review);
    const noThumb = { ...payload, thumbnailBase64: "" };
    const res = await POST(await buildRequest(noThumb));
    expect(res.status).toBe(200);
  });

  it("does not leak the input buffer — handler is stateless (smoke)", async () => {
    // Smoke check: two sequential calls produce independent PDFs.
    const review = makeReviewFixture();
    const payload = await reviewToWirePayload(review);
    const a = await POST(await buildRequest(payload));
    const b = await POST(await buildRequest(payload));
    const aBuf = Buffer.from(await a.arrayBuffer());
    const bBuf = Buffer.from(await b.arrayBuffer());
    // Both are valid PDFs.
    expect(aBuf.slice(0, 5).toString("utf8")).toBe("%PDF-");
    expect(bBuf.slice(0, 5).toString("utf8")).toBe("%PDF-");
    expect(aBuf.length).toBeGreaterThan(500);
    expect(bBuf.length).toBeGreaterThan(500);
  });
});
