// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import {
  extractLabel,
  OpenRouterExtractionError,
} from "./openrouter";

const VALID_ENV: Record<string, string> = {
  OPENROUTER_API_KEY: "sk-test-fixture",
  OPENROUTER_MODEL_PRIMARY: "anthropic/claude-haiku-4.5",
  OPENROUTER_MODEL_FALLBACK: "anthropic/claude-sonnet-4.6",
  OPENROUTER_MODEL_JUDGE: "anthropic/claude-haiku-4.5",
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
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
    evidenceQuote: "45% Alc./Vol. (90 Proof)",
    confidence: 0.93,
  },
  abvPercent: {
    value: 45,
    evidenceQuote: "45% Alc./Vol.",
    confidence: 0.92,
  },
  proof: { value: 90, evidenceQuote: "(90 Proof)", confidence: 0.9 },
  netContents: {
    value: "750 mL",
    evidenceQuote: "750 mL",
    confidence: 0.95,
  },
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

describe("extractLabel", () => {
  let restore: () => void = () => {};

  beforeEach(() => {
    restore = setEnv(VALID_ENV);
  });

  afterEach(() => {
    restore();
  });

  it("invokes OpenRouter chat completions with the strict tool schema and returns parsed data", async () => {
    let receivedBody: unknown = null;
    let receivedAuth: string | null = null;

    server.use(
      http.post(
        "https://openrouter.ai/api/v1/chat/completions",
        async ({ request }) => {
          receivedAuth = request.headers.get("authorization");
          receivedBody = await request.json();
          return HttpResponse.json(SUCCESS_BODY, { status: 200 });
        },
      ),
    );

    const buffer = Buffer.from("fake-jpeg-bytes");
    const result = await extractLabel(buffer, "anthropic/claude-haiku-4.5");

    expect(receivedAuth).toBe("Bearer sk-test-fixture");

    const body = receivedBody as Record<string, unknown>;
    expect(body.model).toBe("anthropic/claude-haiku-4.5");
    expect(body.tool_choice).toEqual({
      type: "function",
      function: { name: "record_label_fields" },
    });

    const tools = body.tools as Array<{
      type: string;
      function: {
        name: string;
        strict: boolean;
        parameters: {
          properties: Record<string, unknown>;
        };
      };
    }>;
    expect(tools[0]?.function.name).toBe("record_label_fields");
    expect(tools[0]?.function.strict).toBe(true);

    // Strict mode rejects multi-type unions (`type: ["string", "null"]`).
    // Verify the on-the-wire schema uses `anyOf` for nullable strings —
    // both at the per-field `evidenceQuote` level and at the top-level
    // `rawText` field.
    const properties = tools[0]?.function.parameters.properties ?? {};
    const brand = properties["brand"] as {
      properties: { evidenceQuote: Record<string, unknown> };
    };
    expect(brand.properties.evidenceQuote).toEqual(
      expect.objectContaining({
        anyOf: [{ type: "string" }, { type: "null" }],
      }),
    );
    expect("type" in brand.properties.evidenceQuote).toBe(false);

    const rawText = properties["rawText"] as Record<string, unknown>;
    expect(rawText).toEqual(
      expect.objectContaining({
        anyOf: [{ type: "string" }, { type: "null" }],
      }),
    );
    expect("type" in rawText).toBe(false);

    const messages = body.messages as Array<{
      role: string;
      content: unknown;
    }>;
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");

    // The user message must contain the image as a base64 data URL.
    const userParts = messages[1]?.content as Array<{
      type: string;
      image_url?: { url: string };
    }>;
    const imagePart = userParts.find((p) => p.type === "image_url");
    expect(imagePart?.image_url?.url).toMatch(/^data:image\/jpeg;base64,/);

    expect(result.data.brand.value).toBe("OLD TOM DISTILLERY");
    expect(result.data.extractionConfidence).toBe(0.91);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    // 1500 prompt × $1/1M + 300 completion × $5/1M = 0.0015 + 0.0015 = 0.003
    expect(result.costUsd).toBeCloseTo(0.003, 6);
  });

  it("uses fallback model pricing when the fallback model is requested", async () => {
    server.use(
      http.post(
        "https://openrouter.ai/api/v1/chat/completions",
        async () => HttpResponse.json(SUCCESS_BODY, { status: 200 }),
      ),
    );

    const result = await extractLabel(
      Buffer.from("img"),
      "anthropic/claude-sonnet-4.6",
    );

    // Sonnet pricing: 1500 × $3/1M + 300 × $15/1M = 0.0045 + 0.0045 = 0.009
    expect(result.costUsd).toBeCloseTo(0.009, 6);
  });

  it("throws OpenRouterExtractionError when the API responds with non-2xx", async () => {
    server.use(
      http.post(
        "https://openrouter.ai/api/v1/chat/completions",
        () => HttpResponse.json({ error: "boom" }, { status: 502 }),
      ),
    );

    await expect(
      extractLabel(Buffer.from("img"), "anthropic/claude-haiku-4.5"),
    ).rejects.toBeInstanceOf(OpenRouterExtractionError);
  });

  it("throws OpenRouterExtractionError when the model returns no tool call", async () => {
    server.use(
      http.post(
        "https://openrouter.ai/api/v1/chat/completions",
        () =>
          HttpResponse.json(
            {
              ...SUCCESS_BODY,
              choices: [
                {
                  index: 0,
                  finish_reason: "stop",
                  message: { role: "assistant", content: "no tool call" },
                },
              ],
            },
            { status: 200 },
          ),
      ),
    );

    await expect(
      extractLabel(Buffer.from("img"), "anthropic/claude-haiku-4.5"),
    ).rejects.toBeInstanceOf(OpenRouterExtractionError);
  });

  it("throws OpenRouterExtractionError when the tool arguments fail schema validation", async () => {
    const malformed = {
      ...SUCCESS_BODY,
      choices: [
        {
          ...SUCCESS_BODY.choices[0]!,
          message: {
            ...SUCCESS_BODY.choices[0]!.message,
            tool_calls: [
              {
                id: "call_x",
                type: "function",
                function: {
                  name: "record_label_fields",
                  arguments: JSON.stringify({ brand: { value: "x" } }),
                },
              },
            ],
          },
        },
      ],
    };

    server.use(
      http.post(
        "https://openrouter.ai/api/v1/chat/completions",
        () => HttpResponse.json(malformed, { status: 200 }),
      ),
    );

    await expect(
      extractLabel(Buffer.from("img"), "anthropic/claude-haiku-4.5"),
    ).rejects.toBeInstanceOf(OpenRouterExtractionError);
  });

  /**
   * Regression: Anthropic vision occasionally emits a bare scalar for a
   * per-field property — e.g. `brand: "OLD TOM"` instead of the full
   * `{ value, evidenceQuote, confidence }` object — even with strict
   * tool-use enabled. Phase-7 Layer-2 surfaced this on text-heavy
   * synthetic labels. We coerce bare scalars to the structured shape
   * with `confidence: 0` so the verification pipeline routes the field
   * to manual review, rather than 502'ing the whole request.
   */
  it("coerces bare-scalar per-field values to the structured shape", async () => {
    const partial = {
      ...TOOL_PAYLOAD,
      // The three fields that Phase-7 surfaced as bare strings in prod.
      brand: "OLD TOM DISTILLERY",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContentText: "45% Alc./Vol.",
    };
    const body = {
      ...SUCCESS_BODY,
      choices: [
        {
          ...SUCCESS_BODY.choices[0]!,
          message: {
            ...SUCCESS_BODY.choices[0]!.message,
            tool_calls: [
              {
                id: "call_partial",
                type: "function",
                function: {
                  name: "record_label_fields",
                  arguments: JSON.stringify(partial),
                },
              },
            ],
          },
        },
      ],
    };

    server.use(
      http.post(
        "https://openrouter.ai/api/v1/chat/completions",
        () => HttpResponse.json(body, { status: 200 }),
      ),
    );

    const result = await extractLabel(
      Buffer.from("img"),
      "anthropic/claude-haiku-4.5",
    );

    // Bare-string fields are wrapped as `{ value, evidenceQuote: null,
    // confidence: 0 }`. Confidence 0 ensures the matcher demotes the row.
    expect(result.data.brand).toEqual({
      value: "OLD TOM DISTILLERY",
      evidenceQuote: null,
      confidence: 0,
    });
    expect(result.data.classType).toEqual({
      value: "Kentucky Straight Bourbon Whiskey",
      evidenceQuote: null,
      confidence: 0,
    });
    expect(result.data.alcoholContentText).toEqual({
      value: "45% Alc./Vol.",
      evidenceQuote: null,
      confidence: 0,
    });
    // Properly-shaped fields pass through unchanged.
    expect(result.data.abvPercent).toEqual(TOOL_PAYLOAD.abvPercent);
  });

  it("coerces a bare numeric scalar to the structured shape", async () => {
    const partial = {
      ...TOOL_PAYLOAD,
      abvPercent: 45,
      proof: 90,
    };
    const body = {
      ...SUCCESS_BODY,
      choices: [
        {
          ...SUCCESS_BODY.choices[0]!,
          message: {
            ...SUCCESS_BODY.choices[0]!.message,
            tool_calls: [
              {
                id: "call_num",
                type: "function",
                function: {
                  name: "record_label_fields",
                  arguments: JSON.stringify(partial),
                },
              },
            ],
          },
        },
      ],
    };

    server.use(
      http.post(
        "https://openrouter.ai/api/v1/chat/completions",
        () => HttpResponse.json(body, { status: 200 }),
      ),
    );

    const result = await extractLabel(
      Buffer.from("img"),
      "anthropic/claude-haiku-4.5",
    );

    expect(result.data.abvPercent).toEqual({
      value: 45,
      evidenceQuote: null,
      confidence: 0,
    });
    expect(result.data.proof).toEqual({
      value: 90,
      evidenceQuote: null,
      confidence: 0,
    });
  });
});
