"use client";

import { CircleCheck, CircleX, CircleDashed, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * `<ProviderStatusList>` — read-only display of the provider allow-list
 * for restricted-network deployments (R-022).
 *
 * proofLens talks to a fixed allow-list of upstream providers:
 *   - OpenRouter   — required at runtime (vision LLM gateway)
 *   - Tesseract.js — runs in-process, always reachable
 *   - Langfuse     — eval-time only; never called in production code path
 *
 * The component renders each provider with an icon + text label + colour
 * indicator. Per R-018 (no color-only status), the status name is also
 * spelled out next to every row.
 */

export type ProviderState =
  | "reachable"
  | "unreachable"
  | "eval-only"
  | "loading";

export interface ProviderStatusMap {
  openrouter: Exclude<ProviderState, "loading">;
  tesseract: Exclude<ProviderState, "loading">;
  langfuse: Exclude<ProviderState, "loading">;
}

interface ProviderStatusListProps {
  /** Map of provider → state, or null while the initial probe is in flight. */
  status: ProviderStatusMap | null;
}

interface ProviderRow {
  id: keyof ProviderStatusMap;
  label: string;
  description: string;
  required: boolean;
}

const ROWS: ReadonlyArray<ProviderRow> = [
  {
    id: "openrouter",
    label: "OpenRouter",
    description:
      "Vision LLM gateway. Claude Haiku 4.5 primary, Sonnet 4.6 fallback, Haiku judge.",
    required: true,
  },
  {
    id: "tesseract",
    label: "Tesseract.js (in-process)",
    description:
      "Government-warning ground-truth OCR. Runs inside the server function, no outbound network.",
    required: true,
  },
  {
    id: "langfuse",
    label: "Langfuse",
    description:
      "Evaluation-time observability only. Never called from production review/batch flows.",
    required: false,
  },
];

interface VisualState {
  label: string;
  iconClass: string;
  badgeClass: string;
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

const STATE_VISUAL: Record<ProviderState, VisualState> = {
  reachable: {
    label: "Reachable",
    iconClass: "text-emerald-600 dark:text-emerald-400",
    badgeClass:
      "bg-emerald-500/10 text-emerald-700 ring-emerald-600/30 dark:text-emerald-300",
    Icon: CircleCheck,
  },
  unreachable: {
    label: "Unreachable",
    iconClass: "text-rose-600 dark:text-rose-400",
    badgeClass:
      "bg-rose-500/10 text-rose-700 ring-rose-600/30 dark:text-rose-300",
    Icon: CircleX,
  },
  "eval-only": {
    label: "Eval-time only",
    iconClass: "text-zinc-500",
    badgeClass:
      "bg-zinc-500/10 text-zinc-700 ring-zinc-600/30 dark:text-zinc-300",
    Icon: CircleAlert,
  },
  loading: {
    label: "Checking…",
    iconClass: "text-muted-foreground animate-pulse",
    badgeClass:
      "bg-muted text-muted-foreground ring-border",
    Icon: CircleDashed,
  },
};

export function ProviderStatusList({ status }: ProviderStatusListProps) {
  return (
    <ul
      role="list"
      aria-label="Provider allow-list and reachability"
      className="border-border divide-border divide-y rounded-xl border"
    >
      {ROWS.map((row) => {
        const state: ProviderState =
          status === null ? "loading" : status[row.id];
        const visual = STATE_VISUAL[state];
        const { Icon } = visual;
        return (
          <li
            key={row.id}
            data-testid={`provider-row-${row.id}`}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-foreground text-sm font-medium">
                  {row.label}
                </span>
                {row.required ? (
                  <span className="border-border bg-muted text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                    Required
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs">{row.description}</p>
            </div>
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                visual.badgeClass,
              )}
            >
              <Icon
                className={cn("size-3.5", visual.iconClass)}
                aria-hidden={true}
                data-testid="status-icon"
              />
              <span>{visual.label}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
