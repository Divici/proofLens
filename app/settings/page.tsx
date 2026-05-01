"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import {
  ProviderStatusList,
  type ProviderStatusMap,
} from "@/components/ProviderStatusList";
import { CURRENT_RULES_VERSION } from "@/lib/storage/types";

/**
 * `/settings` — read-only display of the provider allow-list + ruleset
 * version (R-022 restricted-network posture).
 *
 * The page is intentionally read-only: provider routing is enforced via
 * environment variables; configuration changes require a redeploy. This
 * surface only confirms what the running deployment is talking to.
 */
interface HealthBody {
  ok: boolean;
  providers: { openrouter: boolean };
  ts: string;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<ProviderStatusMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function probe() {
      try {
        const res = await fetch("/api/health", {
          method: "GET",
          cache: "no-store",
        });
        // 200 → ok; 503 with valid body → providers map still trustworthy.
        const body = (await res.json().catch(() => null)) as HealthBody | null;
        if (cancelled) return;
        const openrouterReachable = !!body?.providers?.openrouter;
        setStatus({
          openrouter: openrouterReachable ? "reachable" : "unreachable",
          tesseract: "reachable",
          langfuse: "eval-only",
        });
      } catch {
        if (cancelled) return;
        setStatus({
          openrouter: "unreachable",
          tesseract: "reachable",
          langfuse: "eval-only",
        });
      }
    }
    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SiteNav />
      <main
        id="main"
        className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6"
      >
        <div className="flex flex-col gap-3">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Back to home
          </Link>
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">
              Settings
            </h1>
            <p className="text-muted-foreground text-sm max-w-2xl">
              Read-only view of the providers proofLens is configured to use
              and the ruleset version your deployment is enforcing.
              Configuration changes require a redeploy.
            </p>
          </div>
        </div>

        <section className="flex flex-col gap-3" aria-labelledby="providers-heading">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="providers-heading"
              className="text-foreground text-sm font-semibold"
            >
              Provider allow-list
            </h2>
            <span className="text-muted-foreground text-xs">
              Reachability sourced from <code className="font-mono">/api/health</code>
            </span>
          </div>
          <ProviderStatusList status={status} />
          <p className="text-muted-foreground text-xs">
            Restricted-network deployments should allow-list only OpenRouter. Tesseract.js
            runs in-process and never makes outbound calls. Langfuse is eval-time only.
          </p>
        </section>

        <section
          className="flex flex-col gap-2"
          aria-labelledby="ruleset-heading"
        >
          <h2
            id="ruleset-heading"
            className="text-foreground text-sm font-semibold"
          >
            Ruleset version
          </h2>
          <div className="border-border bg-card/40 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm">
            <Info
              className="text-muted-foreground mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <div className="flex flex-col gap-0.5">
              <code
                className="font-mono text-xs"
                aria-label="Current rules version"
                data-testid="rules-version"
              >
                {CURRENT_RULES_VERSION}
              </code>
              <p className="text-muted-foreground text-xs">
                Saved reviews record the exact ruleset string they were verified
                against, so an audit trail remains stable across deployments.
              </p>
            </div>
          </div>
        </section>

        <section
          className="flex flex-col gap-2"
          aria-labelledby="privacy-heading"
        >
          <h2
            id="privacy-heading"
            className="text-foreground text-sm font-semibold"
          >
            Data handling
          </h2>
          <ul className="text-muted-foreground space-y-1 text-xs">
            <li>Uploaded label images are processed in memory and discarded at the end of the request.</li>
            <li>Review history lives only in this browser via IndexedDB. Server endpoints are stateless.</li>
            <li>
              Per Marcus IT note: nothing sensitive is stored server-side for
              this exercise.
            </li>
          </ul>
        </section>
      </main>
    </>
  );
}
