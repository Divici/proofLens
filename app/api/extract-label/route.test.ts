// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import sharp from "sharp";
import { server } from "@/test/msw/server";

const VALID_ENV: Record<string, string> = {
  OPENROUTER_API_KEY: "sk-test-fixture",
  OPENROUTER_MODEL_PRIMARY: "anthropic/claude-haiku-4.5",
  OPENROUTER_MODEL_FALLBACK: "anthropic/claude-sonnet-4.6",
  OPENROUTER_MODEL_JUDGE: "anthropic/claude-haiku-4.5",
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
};

const VALID_APPLICATION_DATA = {
  brand: "Old Tom Distillery",
  classType: "Kentucky Straight Bourbon Whiskey",
  abv: 45,
  netContents: "750 mL",
  bottlerName: "Old Tom Distillery, LLC",
  bottlerAddress: "123 Bourbon Lane, Bardstown, KY 40004",
  countryOfOrigin: "United States",
  govWarningRequired: true,
  applicationNotes: "TTB-2026-00001",
  beverageType: "distilled-spirits",
};

const TOOL_PAYLOAD = {
  brand: {
    value: "OLD TOM DISTILLERY",
    evidenceQuote: "OLD TOM DISTILLERY",
    confidence: 0.96,
  },
  classType: {
    value: "Kentucky Straight Bourbon Whiskey",
    evidenceQuote: "KENTUCKY STRAIGHT BOURBON WHISKEY",
    confidence: 0.91,
  },
  alcoholContentText: {
    value: "45% Alc./Vol.",
    evidenceQuote: "45% Alc./Vol.",
    confidence: 0.93,
  },
  abvPercent: { value: 45, evidenceQuote: "45%", confidence: 0.92 },
  proof: { value: 90, evidenceQuote: "(90 Proof)", confidence: 0.9 },
  netContents: { value: "750 mL", evidenceQuote: "750 mL", confidence: 0.95 },
  bottlerName: {
    value: "Old Tom Distillery, LLC",
    evidenceQuote: "BOTTLED BY OLD TOM DISTILLERY, LLC",
    confidence: 0.88,
  },
  bottlerAddress: {
    value: "Bardstown, KY",
    evidenceQuote: "BARDSTOWN, KENTUCKY",
    confidence: 0.85,
  },
  countryOfOrigin: {
    value: "United States",
    evidenceQuote: "PRODUCT OF U.S.A.",
    confidence: 0.87,
  },
  governmentWarningText: {
    value: "GOVERNMENT WARNING: ...",
    evidenceQuote: "GOVERNMENT WARNING: ...",
    confidence: 0.94,
  },
  rawText: null,
  imageQualityNotes: [],
  extractionConfidence: 0.91,
};

const SUCCESS_BODY = {
  id: "gen-fixture",
  model: "anthropic/claude-haiku-4.5",
  choices: [
    {
      index: 0,
      finish_reason: "tool_calls",
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "record_label_fields",
              arguments: JSON.stringify(TOOL_PAYLOAD),
            },
          },
        ],
      },
    },
  ],
  usage: {
    prompt_tokens: 1500,
    completion_tokens: 300,
    total_tokens: 1800,
  },
};

function setEnv(env: Record<string, string>) {
  const previous: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    previous[k] = process.env[k];
    process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

async function makeJpegBlob(
  width = 800,
  height = 600,
): Promise<Blob> {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 220, g: 200, b: 160 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
  // Copy into a fresh ArrayBuffer-backed Uint8Array so the BlobPart type
  // matches even under the strict `noUncheckedIndexedAccess`/SAB-aware lib.
  const view = new Uint8Array(buffer.byteLength);
  view.set(buffer);
  return new Blob([view], { type: "image/jpeg" });
}

async function buildRequest(
  blob: Blob | null,
  expectedJson: string | null,
): Promise<Request> {
  const formData = new FormData();
  if (blob) formData.set("image", blob, "label.jpg");
  if (expectedJson !== null) formData.set("expected", expectedJson);
  return new Request("http://localhost/api/extract-label", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/extract-label", () => {
  let restore: () => void = () => {};

  beforeEach(() => {
    vi.resetModules();
    restore = setEnv(VALID_ENV);
  });

  afterEach(() => {
    restore();
  });

  it("returns 200 with extracted data, processingTimeMs, and aiSpend on a happy path", async () => {
    let receivedAuth: string | null = null;
    server.use(
      http.post(
        "https://openrouter.ai/api/v1/chat/completions",
        ({ request }) => {
          receivedAuth = request.headers.get("authorization");
          return HttpResponse.json(SUCCESS_BODY, { status: 200 });
        },
      ),
    );

    const blob = await makeJpegBlob(1200, 900);
    const request = await buildRequest(
      blob,
      JSON.stringify(VALID_APPLICATION_DATA),
    );

    const { POST } = await import("./route");
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.extracted.brand.value).toBe("OLD TOM DISTILLERY");
    expect(body.extracted.extractionConfidence).toBeCloseTo(0.91, 2);
    expect(body.expected.brand).toBe("Old Tom Distillery");
    expect(typeof body.processingTimeMs).toBe("number");
    expect(body.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(typeof body.aiSpend.primaryUsd).toBe("number");
    expect(body.aiSpend.primaryUsd).toBeGreaterThan(0);

    expect(receivedAuth).toBe("Bearer sk-test-fixture");
  });

  it("returns 400 when the image part is missing", async () => {
    const request = await buildRequest(
      null,
      JSON.stringify(VALID_APPLICATION_DATA),
    );

    const { POST } = await import("./route");
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/image/i);
  });

  it("returns 400 when the expected JSON is missing", async () => {
    const blob = await makeJpegBlob();
    const request = await buildRequest(blob, null);

    const { POST } = await import("./route");
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/expected/i);
  });

  it("returns 400 when the expected JSON is malformed", async () => {
    const blob = await makeJpegBlob();
    const request = await buildRequest(blob, "{not-json");

    const { POST } = await import("./route");
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 when the expected payload fails ApplicationData validation", async () => {
    const blob = await makeJpegBlob();
    const request = await buildRequest(
      blob,
      JSON.stringify({ ...VALID_APPLICATION_DATA, abv: "not a number" }),
    );

    const { POST } = await import("./route");
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/expected/i);
  });

  it("returns 502 when OpenRouter responds with an error", async () => {
    server.use(
      http.post(
        "https://openrouter.ai/api/v1/chat/completions",
        () => HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );

    const blob = await makeJpegBlob();
    const request = await buildRequest(
      blob,
      JSON.stringify(VALID_APPLICATION_DATA),
    );

    const { POST } = await import("./route");
    const response = await POST(request);

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toMatch(/extract|provider|upstream/i);
  });
});
