import "server-only";
import { z } from "zod";
import {
  JUDGE_SYSTEM_PROMPT,
  JUDGE_TOOL_NAME,
  JUDGE_TOOL_SCHEMA,
  buildJudgeUserPrompt,
} from "@/lib/ai/prompts/judge-nuanced-match";

/**
 * Server-side helper that invokes the OpenRouter judge model and returns
 * a structured verdict. Shared between `/api/judge-field` (HTTP entry
 * point — kept for client-callable parity + caching) and
 * `/api/extract-label` (in-process invocation from the verification
 * pipeline's gray-band path).
 *
 * Same error semantics as the route: returns `null` on any upstream
 * failure so the caller can fall back to manual-review without throwing.
 *
 * Stateless — no caching here. The route handler keeps its own
 * module-scoped cache; the in-process pipeline call already runs inside
 * a single request lifetime, so per-request memoization is sufficient.
 */

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

export interface JudgeCallEnv {
  OPENROUTER_BASE_URL: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL_JUDGE: string;
}

export interface JudgeCallInput {
  extracted: string;
  expected: string;
  fieldName?: string;
}

export interface JudgeCallResult {
  verdict: "equivalent" | "not_equivalent" | "uncertain";
  reasonCode: string;
  reasoning: string;
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
}

const TIMEOUT_MS = 20_000;

export async function callJudgeUpstream(
  input: JudgeCallInput,
  env: JudgeCallEnv,
): Promise<JudgeCallResult | null> {
  const requestBody = {
    model: env.OPENROUTER_MODEL_JUDGE,
    messages: [
      { role: "system", content: JUDGE_SYSTEM_PROMPT },
      { role: "user", content: buildJudgeUserPrompt(input) },
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
    console.error("[judge-call] upstream call failed", cause);
    return null;
  }
  clearTimeout(timer);

  if (!response.ok) {
    console.error(`[judge-call] upstream returned ${response.status}`);
    return null;
  }

  let json: OpenRouterChatResponse;
  try {
    json = (await response.json()) as OpenRouterChatResponse;
  } catch (cause) {
    console.error("[judge-call] response was not JSON", cause);
    return null;
  }

  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
  if (
    !toolCall ||
    toolCall.function?.name !== JUDGE_TOOL_NAME ||
    !toolCall.function.arguments
  ) {
    console.error("[judge-call] upstream did not return the expected tool call");
    return null;
  }

  let parsedJudgePayload: unknown;
  try {
    parsedJudgePayload = JSON.parse(toolCall.function.arguments);
  } catch {
    console.error("[judge-call] tool-call arguments were not valid JSON");
    return null;
  }

  const judgeValidation = JudgeOutputSchema.safeParse(parsedJudgePayload);
  if (!judgeValidation.success) {
    console.error(
      "[judge-call] upstream returned an invalid verdict shape",
      judgeValidation.error.issues,
    );
    return null;
  }

  return {
    verdict: judgeValidation.data.verdict,
    reasonCode: judgeValidation.data.reason_code,
    reasoning: judgeValidation.data.rationale,
  };
}
