import { NextResponse } from "next/server";
import { validateEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROBE_TIMEOUT_MS = 5_000;

interface HealthBody {
  ok: boolean;
  providers: {
    openrouter: boolean;
  };
  ts: string;
}

async function pingOpenRouter(
  baseUrl: string,
  apiKey: string,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(): Promise<NextResponse<HealthBody>> {
  // Env validation is part of the health contract: a misconfigured server
  // is unhealthy, not a 500. Swallow the error message (it can name env
  // var values via Zod) and return the documented 503 body shape.
  let env;
  try {
    env = validateEnv();
  } catch {
    const body: HealthBody = {
      ok: false,
      providers: { openrouter: false },
      ts: new Date().toISOString(),
    };
    return NextResponse.json(body, { status: 503 });
  }

  const openrouterReachable = await pingOpenRouter(
    env.OPENROUTER_BASE_URL,
    env.OPENROUTER_API_KEY,
  );
  const ok = openrouterReachable;
  const body: HealthBody = {
    ok,
    providers: { openrouter: openrouterReachable },
    ts: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: ok ? 200 : 503 });
}
