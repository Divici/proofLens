// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";

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

function judgeBody(verdict: string) {
  return {
    id: "gen",
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
                name: "record_judgment",
                arguments: JSON.stringify({
                  verdict,
                  reason_code:
                    verdict === "equivalent" ? "case_only" : "different_entity",
                  rationale: "test rationale",
                }),
              },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 80, completion_tokens: 30, total_tokens: 110 },
  };
}

describe("POST /api/judge-field", () => {
  let restore = () => {};

  beforeEach(() => {
    vi.resetModules();
    restore = setEnv(VALID_ENV);
  });

  afterEach(() => {
    restore();
    // Clear the in-process cache between tests.
    void import("./route").then((m) => m.__resetCacheForTests());
  });

  it("returns the judge verdict on a happy path", async () => {
    server.use(
      http.post(
        "https://openrouter.ai/api/v1/chat/completions",
        () => HttpResponse.json(judgeBody("equivalent"), { status: 200 }),
      ),
    );

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/judge-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        extracted: "STONE'S THROW",
        expected: "Stone's Throw",
        fieldName: "brand",
      }),
    });

    const res = await POST(request);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verdict).toBe("equivalent");
    expect(body.reasoning).toMatch(/test rationale/);
  });

  it("caches identical (extracted, expected, fieldName) calls in-process", async () => {
    let openRouterCalls = 0;
    server.use(
      http.post(
        "https://openrouter.ai/api/v1/chat/completions",
        () => {
          openRouterCalls++;
          return HttpResponse.json(judgeBody("equivalent"), { status: 200 });
        },
      ),
    );

    const { POST } = await import("./route");

    const make = () =>
      new Request("http://localhost/api/judge-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extracted: "STONE'S THROW",
          expected: "Stone's Throw",
          fieldName: "brand",
        }),
      });

    const r1 = await POST(make());
    const r2 = await POST(make());
    const r3 = await POST(make());

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
    expect(openRouterCalls).toBe(1);
  });

  it("returns 400 when the body is missing required fields", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/judge-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extracted: "x" }),
    });
    const res = await POST(request);
    expect(res.status).toBe(400);
  });

  it("returns 502 when the upstream judge call fails", async () => {
    server.use(
      http.post(
        "https://openrouter.ai/api/v1/chat/completions",
        () => HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/judge-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        extracted: "X",
        expected: "Y",
        fieldName: "brand",
      }),
    });
    const res = await POST(request);
    expect(res.status).toBe(502);
  });
});
