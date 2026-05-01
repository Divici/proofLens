"use client";

import { useEffect, useState } from "react";
import { CircleX } from "lucide-react";

/**
 * `<ProviderHealthBanner>` — surfaces an alert at the top of `/review`
 * and `/batch` when OpenRouter is unreachable. Honest about what still
 * works (history + exports) so reviewers don't think the whole app is
 * dead.
 *
 * Implementation note: probes `/api/health` once on mount and then every
 * 60 s. Failures (network or 503 with `providers.openrouter === false`)
 * flip the banner on; recovery flips it off without a page reload.
 */
const POLL_INTERVAL_MS = 60_000;

interface HealthBody {
  ok: boolean;
  providers: { openrouter: boolean };
  ts: string;
}

export function ProviderHealthBanner() {
  const [unreachable, setUnreachable] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function probe() {
      try {
        const res = await fetch("/api/health", {
          method: "GET",
          cache: "no-store",
        });
        const body = (await res.json().catch(() => null)) as
          | HealthBody
          | null;
        if (cancelled) return;
        // Treat any branch of "we couldn't confirm openrouter" as unreachable.
        setUnreachable(!body || body.providers?.openrouter === false);
      } catch {
        if (!cancelled) setUnreachable(true);
      }
    }

    void probe();
    timer = setInterval(probe, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  if (!unreachable) return null;

  return (
    <div
      role="alert"
      aria-label="Provider unreachable"
      className="border-rose-600/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm"
    >
      <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">AI extraction is unavailable.</span>
        <span className="text-rose-700/90 dark:text-rose-300/80 text-xs">
          OpenRouter is unreachable from this deployment. Saved review history
          and exports still work. New extractions will fail until the provider
          is reachable again.
        </span>
      </div>
    </div>
  );
}
