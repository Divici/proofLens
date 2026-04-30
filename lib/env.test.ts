import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REQUIRED_KEYS = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL_PRIMARY",
  "OPENROUTER_MODEL_FALLBACK",
  "OPENROUTER_MODEL_JUDGE",
  "OPENROUTER_BASE_URL",
] as const;

function withEnv(overrides: Record<string, string | undefined>) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

const VALID_ENV: Record<string, string> = {
  OPENROUTER_API_KEY: "sk-test-fixture",
  OPENROUTER_MODEL_PRIMARY: "anthropic/claude-haiku-4.5",
  OPENROUTER_MODEL_FALLBACK: "anthropic/claude-sonnet-4.6",
  OPENROUTER_MODEL_JUDGE: "anthropic/claude-haiku-4.5",
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
};

let restore: () => void = () => {};

describe("validateEnv", () => {
  beforeEach(async () => {
    // Reset module cache so each test re-imports with the current process.env.
    const vitest = await import("vitest");
    vitest.vi.resetModules();
  });

  afterEach(() => {
    restore();
  });

  it("returns the parsed config when every required var is present", async () => {
    restore = withEnv(VALID_ENV);
    const { validateEnv } = await import("./env");

    const config = validateEnv();

    expect(config).toEqual(VALID_ENV);
  });

  it("throws a descriptive error when OPENROUTER_API_KEY is empty", async () => {
    restore = withEnv({ ...VALID_ENV, OPENROUTER_API_KEY: "" });
    const { validateEnv } = await import("./env");

    expect(() => validateEnv()).toThrowError(/OPENROUTER_API_KEY/);
  });

  it("throws a descriptive error when OPENROUTER_API_KEY is missing", async () => {
    restore = withEnv({ ...VALID_ENV, OPENROUTER_API_KEY: undefined });
    const { validateEnv } = await import("./env");

    expect(() => validateEnv()).toThrowError(/OPENROUTER_API_KEY/);
  });

  it("throws when any single required var is missing", async () => {
    for (const key of REQUIRED_KEYS) {
      restore = withEnv({ ...VALID_ENV, [key]: undefined });
      const vitest = await import("vitest");
      vitest.vi.resetModules();
      const { validateEnv } = await import("./env");
      expect(() => validateEnv(), `missing ${key} should throw`).toThrowError(
        new RegExp(key),
      );
      restore();
    }
  });

  it("rejects an OPENROUTER_BASE_URL that is not a URL", async () => {
    restore = withEnv({ ...VALID_ENV, OPENROUTER_BASE_URL: "not-a-url" });
    const { validateEnv } = await import("./env");

    expect(() => validateEnv()).toThrowError(/OPENROUTER_BASE_URL/);
  });

  it("strips a trailing slash from OPENROUTER_BASE_URL", async () => {
    restore = withEnv({
      ...VALID_ENV,
      OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1/",
    });
    const { validateEnv } = await import("./env");

    const config = validateEnv();

    expect(config.OPENROUTER_BASE_URL).toBe("https://openrouter.ai/api/v1");
  });
});
