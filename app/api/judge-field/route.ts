import { NextResponse } from "next/server";
import { z } from "zod";
import { validateEnv } from "@/lib/env";
import {
  JUDGE_SYSTEM_PROMPT,
  JUDGE_TOOL_NAME,
  JUDGE_TOOL_SCHEMA,
  buildJudgeUserPrompt,
} from "@/lib/ai/prompts/judge-nuanced-match";

/**
 * POST /api/judge-field — stateless LLM-judge tie-breaker for the
 * nuanced ladder's gray band (0.78 ≤ similarity < 0.92).
 *
 * Note: the LLM-judge endpoint at /api/judge-field exists but is NOT YET
 * called from the verification pipeline; gray-band cases route to
 * "manual-review" status until production wiring lands. See
 * slice-3-detail.md track 5. The endpoint is reachable and tested
 * end-to-end so wiring it from `lib/verify/pipeline.ts` will be a small
 * change.
 *
 * Per Marcus IT note + slice 0003 spec:
 *
 *   - Stateless server endpoint — nothing persists across requests.
 *     The in-process cache below is per Vercel function instance and is
 *     a latency/cost optimisation, not a data store.
 *   - **Strict fields never reach this endpoint.** Routing happens in the
 *     verification pipeline.
 *   - Cache key: SHA-256 of `(extracted, expected, fieldName)` (kept in
 *     code below — `crypto.subtle.digest` is overkill for non-secret
 *     keys, so we just JSON.stringify the tuple).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const RequestBodySchema = z.object({
  extracted: z.string().min(1, "extracted is required"),
  expected: z.string().min(1, "expected is required"),
  fieldName: z.string().min(1).optional(),
});

const JudgeOutputSchema = z.object({
  verdict: z.enum(["equivalent", "not_equivalent", "uncertain"]),
  reason_code: z.enum([
    "case_only",
    "punctuation_only",
    "ocr_typo",
    "abbreviation",
    "different_entity",
    "ambiguous",
  ]),
  rationale: z.string(),
});

interface JudgeResponseBody {
  verdict: "equivalent" | "not_equivalent" | "uncertain";
  reasonCode: string;
  reasoning: string;
  cached: boolean;
}

interface ErrorBody {
  error: string;
  issues?: Array<{ path: string; message: string }>;
}

/**
 * Module-scoped cache per Vercel function instance. Keyed on JSON of the
 * normalized tuple. Bounded at 256 entries (LRU-ish — oldest dropped).
 */
const CACHE_MAX = 256;
const cache = new Map<string, Omit<JudgeResponseBody, "cached">>();

function cacheKey(input: z.infer<typeof RequestBodySchema>): string {
  return JSON.stringify({
    e: input.extracted,
    x: input.expected,
    f: input.fieldName ?? "",
  });
}

/** Test-only — clears the in-process cache between tests. */
export function __resetCacheForTests(): void {
  cache.clear();
}

const TIMEOUT_MS = 20_000;

export async function POST(
  request: Request,
): Promise<NextResponse<JudgeResponseBody | ErrorBody>> {
  let env;
  try {
    env = validateEnv();
  } catch (err) {
    console.error("[judge-field] env validation failed", err);
    return NextResponse.json<ErrorBody>(
      { error: "Judge service is temporarily unavailable." },
      { status: 500 },
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json<ErrorBody>(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const validation = RequestBodySchema.safeParse(parsedBody);
  if (!validation.success) {
    return NextResponse.json<ErrorBody>(
      {
        error: "Missing or invalid fields in request body.",
        issues: validation.error.issues.map((i) => ({
          path: i.path.join(".") || "(root)",
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const key = cacheKey(validation.data);
  const cached = cache.get(key);
  if (cached) {
    return NextResponse.json<JudgeResponseBody>(
      { ...cached, cached: true },
      { status: 200 },
    );
  }

  const requestBody = {
    model: env.OPENROUTER_MODEL_JUDGE,
    messages: [
      { role: "system", content: JUDGE_SYSTEM_PROMPT },
      {
        role: "user",
        content: buildJudgeUserPrompt(validation.data),
      },
    ],
    tools: [JUDGE_TOOL_SCHEMA],
    tool_choice: { type: "function", function: { name: JUDGE_TOOL_NAME } },
    temperature: 0,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://prooflens.app",
        "X-Title": "proofLens",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timer);
    console.error("[judge-field] upstream call failed", cause);
    return NextResponse.json<ErrorBody>(
      { error: "Judge upstream request failed." },
      { status: 502 },
    );
  }
  clearTimeout(timer);

  if (!response.ok) {
    return NextResponse.json<ErrorBody>(
      { error: `Judge upstream returned ${response.status}.` },
      { status: 502 },
    );
  }

  let json: OpenRouterChatResponse;
  try {
    json = (await response.json()) as OpenRouterChatResponse;
  } catch (cause) {
    console.error("[judge-field] response was not JSON", cause);
    return NextResponse.json<ErrorBody>(
      { error: "Judge upstream returned a non-JSON body." },
      { status: 502 },
    );
  }

  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
  if (
    !toolCall ||
    toolCall.function?.name !== JUDGE_TOOL_NAME ||
    !toolCall.function.arguments
  ) {
    return NextResponse.json<ErrorBody>(
      { error: "Judge upstream did not return the expected tool call." },
      { status: 502 },
    );
  }

  let parsedJudgePayload: unknown;
  try {
    parsedJudgePayload = JSON.parse(toolCall.function.arguments);
  } catch {
    return NextResponse.json<ErrorBody>(
      { error: "Judge upstream tool-call arguments were not valid JSON." },
      { status: 502 },
    );
  }

  const judgeValidation = JudgeOutputSchema.safeParse(parsedJudgePayload);
  if (!judgeValidation.success) {
    return NextResponse.json<ErrorBody>(
      { error: "Judge upstream returned an invalid verdict shape." },
      { status: 502 },
    );
  }

  const result: Omit<JudgeResponseBody, "cached"> = {
    verdict: judgeValidation.data.verdict,
    reasonCode: judgeValidation.data.reason_code,
    reasoning: judgeValidation.data.rationale,
  };

  // Bounded LRU-ish cache.
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, result);

  return NextResponse.json<JudgeResponseBody>(
    { ...result, cached: false },
    { status: 200 },
  );
}
