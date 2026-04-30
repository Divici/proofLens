/**
 * OpenRouter / Anthropic vision pricing — per RESEARCH.md §2.1.
 *
 * All prices are USD per 1,000,000 tokens. Override via environment
 * variables when OpenRouter list-price changes:
 *
 *   OPENROUTER_PRICE_PRIMARY_INPUT_USD_PER_MTOK
 *   OPENROUTER_PRICE_PRIMARY_OUTPUT_USD_PER_MTOK
 *   OPENROUTER_PRICE_FALLBACK_INPUT_USD_PER_MTOK
 *   OPENROUTER_PRICE_FALLBACK_OUTPUT_USD_PER_MTOK
 *
 * Defaults match the values locked in research as of 2026-04-29.
 */

export interface ModelPrice {
  /** USD per 1,000,000 input tokens. */
  inputPerMTok: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMTok: number;
}

export const DEFAULT_PRIMARY_PRICE: ModelPrice = {
  inputPerMTok: 1, // Claude Haiku 4.5 — $1 / 1M in
  outputPerMTok: 5, // Claude Haiku 4.5 — $5 / 1M out
};

export const DEFAULT_FALLBACK_PRICE: ModelPrice = {
  inputPerMTok: 3, // Claude Sonnet 4.6 — $3 / 1M in
  outputPerMTok: 15, // Claude Sonnet 4.6 — $15 / 1M out
};

function readPriceFromEnv(
  envKey: string,
  fallback: number,
): number {
  const raw = process.env[envKey];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

/**
 * Resolve the active price for the primary extraction model. Reads env
 * overrides at call time so tests can flip pricing without a server
 * restart.
 */
export function getPrimaryPrice(): ModelPrice {
  return {
    inputPerMTok: readPriceFromEnv(
      "OPENROUTER_PRICE_PRIMARY_INPUT_USD_PER_MTOK",
      DEFAULT_PRIMARY_PRICE.inputPerMTok,
    ),
    outputPerMTok: readPriceFromEnv(
      "OPENROUTER_PRICE_PRIMARY_OUTPUT_USD_PER_MTOK",
      DEFAULT_PRIMARY_PRICE.outputPerMTok,
    ),
  };
}

export function getFallbackPrice(): ModelPrice {
  return {
    inputPerMTok: readPriceFromEnv(
      "OPENROUTER_PRICE_FALLBACK_INPUT_USD_PER_MTOK",
      DEFAULT_FALLBACK_PRICE.inputPerMTok,
    ),
    outputPerMTok: readPriceFromEnv(
      "OPENROUTER_PRICE_FALLBACK_OUTPUT_USD_PER_MTOK",
      DEFAULT_FALLBACK_PRICE.outputPerMTok,
    ),
  };
}

/**
 * Convert a usage tuple (input, output token counts) plus a price into a
 * USD cost. Token counts come from OpenRouter / OpenAI-compatible
 * `usage.prompt_tokens` and `usage.completion_tokens`.
 */
export function computeCostUsd(
  promptTokens: number,
  completionTokens: number,
  price: ModelPrice,
): number {
  const inputCost = (promptTokens / 1_000_000) * price.inputPerMTok;
  const outputCost = (completionTokens / 1_000_000) * price.outputPerMTok;
  return inputCost + outputCost;
}
