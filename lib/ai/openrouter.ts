import "server-only";
import {
  ExtractedLabelDataSchema,
  type ExtractedLabelData,
} from "./schema";
import {
  computeCostUsd,
  getFallbackPrice,
  getPrimaryPrice,
  type ModelPrice,
} from "./pricing";
import {
  EXTRACT_FIELDS_SYSTEM_PROMPT,
  EXTRACT_FIELDS_TOOL_NAME,
  EXTRACT_FIELDS_TOOL_SCHEMA,
  EXTRACT_FIELDS_USER_PROMPT,
} from "./prompts/extract-fields";
import { validateEnv } from "@/lib/env";

/**
 * OpenRouter wrapper for vision-LLM label extraction.
 *
 * We hand-roll a `fetch` call rather than using the `openai` SDK because:
 *   - The OpenRouter chat-completions schema is OpenAI-compatible but
 *     forwards every property; using `fetch` makes the on-the-wire body
 *     trivially testable with MSW.
 *   - Tool-use schemas (with `strict: true`) need to round-trip 1:1; the
 *     SDK silently rewrites some fields.
 *   - We control timeout + abort semantics.
 */

export class OpenRouterExtractionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OpenRouterExtractionError";
  }
}

export interface ExtractLabelResult {
  data: ExtractedLabelData;
  costUsd: number;
  latencyMs: number;
}

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenRouterToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenRouterChoice {
  index?: number;
  finish_reason?: string;
  message?: {
    role?: string;
    content?: string | null;
    tool_calls?: OpenRouterToolCall[];
  };
}

interface OpenRouterChatResponse {
  id?: string;
  model?: string;
  choices?: OpenRouterChoice[];
  usage?: OpenRouterUsage;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Choose a price table for the given model name. We resolve by *role*
 * (primary vs fallback) rather than by string match, so swapping
 * models in env vars doesn't require code changes here.
 */
function resolvePriceForModel(model: string): ModelPrice {
  const env = validateEnv();
  if (model === env.OPENROUTER_MODEL_FALLBACK) return getFallbackPrice();
  return getPrimaryPrice();
}

/**
 * Convert an in-memory image buffer to a JPEG data URL. The chat API
 * accepts data URLs in `image_url.url`. We assume preprocessing has
 * already produced JPEG bytes (slice 0002 — `lib/image/preprocess.ts`).
 */
function bufferToJpegDataUrl(buffer: Buffer): string {
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

/**
 * Run vision-LLM extraction against a single label image.
 *
 * The image is encoded inline as a base64 data URL — we never write it to
 * disk, in line with the stateless-server rule (Marcus IT note).
 */
export async function extractLabel(
  imageBuffer: Buffer,
  model: string,
  options: { timeoutMs?: number } = {},
): Promise<ExtractLabelResult> {
  const env = validateEnv();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();

  const requestBody = {
    model,
    messages: [
      { role: "system", content: EXTRACT_FIELDS_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: EXTRACT_FIELDS_USER_PROMPT },
          {
            type: "image_url",
            image_url: { url: bufferToJpegDataUrl(imageBuffer) },
          },
        ],
      },
    ],
    tools: [EXTRACT_FIELDS_TOOL_SCHEMA],
    tool_choice: {
      type: "function",
      function: { name: EXTRACT_FIELDS_TOOL_NAME },
    },
    temperature: 0,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        // Optional but recommended OpenRouter attribution headers.
        "HTTP-Referer": "https://prooflens.app",
        "X-Title": "proofLens",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timer);
    throw new OpenRouterExtractionError(
      "OpenRouter request failed before reaching the server",
      cause,
    );
  }
  clearTimeout(timer);

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      // ignore — best-effort error context
    }
    throw new OpenRouterExtractionError(
      `OpenRouter returned ${response.status}: ${detail.slice(0, 200)}`,
    );
  }

  let json: OpenRouterChatResponse;
  try {
    json = (await response.json()) as OpenRouterChatResponse;
  } catch (cause) {
    throw new OpenRouterExtractionError(
      "OpenRouter response was not valid JSON",
      cause,
    );
  }

  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
  if (
    !toolCall ||
    toolCall.function?.name !== EXTRACT_FIELDS_TOOL_NAME ||
    !toolCall.function.arguments
  ) {
    throw new OpenRouterExtractionError(
      "OpenRouter response did not include the expected tool call",
    );
  }

  let parsedArguments: unknown;
  try {
    parsedArguments = JSON.parse(toolCall.function.arguments);
  } catch (cause) {
    throw new OpenRouterExtractionError(
      "Tool call arguments were not valid JSON",
      cause,
    );
  }

  const validation = ExtractedLabelDataSchema.safeParse(parsedArguments);
  if (!validation.success) {
    throw new OpenRouterExtractionError(
      `Tool call payload failed schema validation: ${validation.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
  }

  const promptTokens = json.usage?.prompt_tokens ?? 0;
  const completionTokens = json.usage?.completion_tokens ?? 0;
  const costUsd = computeCostUsd(
    promptTokens,
    completionTokens,
    resolvePriceForModel(model),
  );
  const latencyMs = Date.now() - start;

  return {
    data: validation.data,
    costUsd,
    latencyMs,
  };
}
