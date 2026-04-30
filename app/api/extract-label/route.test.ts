// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import sharp from "sharp";
import { server } from "@/test/msw/server";

// Mock Tesseract.js to keep the route test deterministic + fast.
// The verification pipeline still runs against a real word stream below.
vi.mock("@/lib/ocr/tesseract", () => ({
  tesseractExtract: vi.fn(async () => ({
    text:
      "OLD TOM DISTILLERY\nKentucky Straight Bourbon Whiskey\n45% Alc./Vol.\n750 mL\nGOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.",
    words: [
      {
        text: "OLD",
        confidence: 0.95,
        bbox: { x0: 100, y0: 100, x1: 140, y1: 130 },
      },
      {
        text: "TOM",
        confidence: 0.94,
        bbox: { x0: 150, y0: 100, x1: 200, y1: 130 },
      },
      {
        text: "DISTILLERY",
        confidence: 0.92,
        bbox: { x0: 210, y0: 100, x1: 360, y1: 130 },
      },
      {
        text: "GOVERNMENT",
        confidence: 0.95,
        bbox: { x0: 100, y0: 800, x1: 280, y1: 830 },
      },
      {
        text: "WARNING",
        confidence: 0.95,
        bbox: { x0: 290, y0: 800, x1: 420, y1: 830 },
      },
    ],
    confidence: 0.92,
  })),
  __resetWorkerForTests: vi.fn(async () => {}),
}));

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

  it("returns 200 with extracted data, fieldResults, overall, and telemetry on a happy path", async () => {
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

    // Verification pipeline output is now part of the response.
    expect(Array.isArray(body.fieldResults)).toBe(true);
    expect(body.fieldResults.length).toBeGreaterThan(0);
    expect(typeof body.overall).toBe("string");
    expect(typeof body.rawText).toBe("string");
    expect(body.rawText.length).toBeGreaterThan(0);
    expect(typeof body.ocrConfidence).toBe("number");
    expect(typeof body.imageWidth).toBe("number");
    expect(typeof body.imageHeight).toBe("number");

    // Every field result has a status drawn from the 8-state enum.
    const allowedStatuses = new Set([
      "pass",
      "likely-match",
      "warning",
      "fail",
      "missing",
      "low-confidence",
      "manual-review",
      "not-required",
    ]);
    for (const fr of body.fieldResults) {
      expect(allowedStatuses.has(fr.status)).toBe(true);
      expect(typeof fr.explanation).toBe("string");
      expect(fr.explanation.length).toBeGreaterThan(0);
    }

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

  it("returns 400 with a generic message and structured issues when ApplicationData validation fails", async () => {
    const blob = await makeJpegBlob();
    const request = await buildRequest(
      blob,
      JSON.stringify({ ...VALID_APPLICATION_DATA, abv: "not a number" }),
    );

    const { POST } = await import("./route");
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    // Generic, user-facing copy — must NOT leak internal Zod prose.
    expect(body.error).toMatch(/missing or invalid/i);
    expect(body.error).not.toMatch(/zod/i);
    // Structured issues live in their own key, not concatenated into `error`.
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    expect(body.issues[0]).toEqual(
      expect.objectContaining({
        path: expect.any(String),
        message: expect.any(String),
      }),
    );
    expect(body.issues.some((i: { path: string }) => i.path === "abv")).toBe(
      true,
    );
  });

  it("returns 500 with a generic message (no env-var names leaked) when env validation fails", async () => {
    // Wipe the env so validateEnv() throws.
    restore();
    const wipe = setEnv({});
    for (const k of Object.keys(VALID_ENV)) delete process.env[k];

    const blob = await makeJpegBlob();
    const request = await buildRequest(
      blob,
      JSON.stringify(VALID_APPLICATION_DATA),
    );

    const { POST } = await import("./route");
    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/temporarily unavailable/i);
    expect(body.error).not.toMatch(/openrouter/i);
    expect(body.error).not.toMatch(/env/i);

    wipe();
  });

  it("returns 413 when the image exceeds the 4 MB upload limit", async () => {
    // Allocate a 5 MB buffer so the route's size guard fires. We don't need
    // valid JPEG bytes — the size check runs before we hand the buffer to
    // sharp/preprocess.
    const oversize = new Uint8Array(5 * 1024 * 1024);
    const blob = new Blob([oversize], { type: "image/jpeg" });

    const formData = new FormData();
    formData.set("image", blob, "label.jpg");
    formData.set("expected", JSON.stringify(VALID_APPLICATION_DATA));
    const request = new Request("http://localhost/api/extract-label", {
      method: "POST",
      body: formData,
    });

    const { POST } = await import("./route");
    const response = await POST(request);

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toMatch(/4 ?MB/i);
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
