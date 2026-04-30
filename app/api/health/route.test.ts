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

describe("GET /api/health", () => {
  let restore: () => void = () => {};

  beforeEach(() => {
    vi.resetModules();
    restore = setEnv(VALID_ENV);
  });

  afterEach(() => {
    restore();
  });

  it("returns 200 with ok:true when OpenRouter is reachable", async () => {
    server.use(
      http.get("https://openrouter.ai/api/v1/models", () =>
        HttpResponse.json({ data: [] }, { status: 200 }),
      ),
    );

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.providers.openrouter).toBe(true);
    expect(typeof body.ts).toBe("string");
    expect(() => new Date(body.ts)).not.toThrow();
  });

  it("returns 503 with ok:false when OpenRouter is unreachable", async () => {
    server.use(
      http.get("https://openrouter.ai/api/v1/models", () =>
        HttpResponse.error(),
      ),
    );

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.providers.openrouter).toBe(false);
  });

  it("returns 503 when OpenRouter responds with an error status", async () => {
    server.use(
      http.get("https://openrouter.ai/api/v1/models", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.providers.openrouter).toBe(false);
  });
});
