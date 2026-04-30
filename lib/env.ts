import "server-only";
import { z } from "zod";

/**
 * Server-only environment validation.
 *
 * Throws on missing/invalid required vars with a descriptive error
 * naming every offending variable. This module must never be imported
 * from client code — the `server-only` import guards against that.
 */

const EnvSchema = z.object({
  OPENROUTER_API_KEY: z
    .string({ required_error: "OPENROUTER_API_KEY is required" })
    .min(1, "OPENROUTER_API_KEY must not be empty"),
  OPENROUTER_MODEL_PRIMARY: z
    .string({ required_error: "OPENROUTER_MODEL_PRIMARY is required" })
    .min(1, "OPENROUTER_MODEL_PRIMARY must not be empty"),
  OPENROUTER_MODEL_FALLBACK: z
    .string({ required_error: "OPENROUTER_MODEL_FALLBACK is required" })
    .min(1, "OPENROUTER_MODEL_FALLBACK must not be empty"),
  OPENROUTER_MODEL_JUDGE: z
    .string({ required_error: "OPENROUTER_MODEL_JUDGE is required" })
    .min(1, "OPENROUTER_MODEL_JUDGE must not be empty"),
  OPENROUTER_BASE_URL: z
    .string({ required_error: "OPENROUTER_BASE_URL is required" })
    .url("OPENROUTER_BASE_URL must be a valid URL")
    .transform((v) => v.replace(/\/$/, "")),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/**
 * Validate `process.env` against the schema. Returns a frozen, typed
 * config object. Throws a single Error whose message lists every
 * offending variable name + reason.
 */
export function validateEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join(".") || "(root)";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }

  cached = Object.freeze(parsed.data);
  return cached;
}

/**
 * Test-only helper to clear the validation cache between tests.
 * Not exported via the package entry; importable directly from this file.
 */
export function __resetEnvCacheForTests(): void {
  cached = null;
}
