import type { ApplicationData } from "@/lib/ai/schema";
import { DEMO_SCENARIOS, type DemoScenario } from "@/lib/demo/scenarios";
import { REAL_SCENARIOS, type RealScenario } from "@/lib/demo/real-scenarios";

/**
 * Mock COLA queue rows. The brief (`PROJECT_BRIEF.md`, Sarah Chen) frames
 * the agent workflow as: "an agent pulls up an application, looks at the
 * label artwork, and checks that what's on the label matches what's in
 * the application." That assumes the work arrives in a list — Sarah's
 * "agents drowning in routine stuff" and Janet's "200, 300 applications
 * at once". This module synthesises that list deterministically from the
 * in-repo `DEMO_SCENARIOS` (placeholder artwork) and `REAL_SCENARIOS`
 * (real bottle photos including image-quality variants).
 *
 * Marcus's "we're not looking to integrate with COLA directly" keeps us
 * from wiring a real backend; the APP-IDs here are synthetic.
 */

export type ScenarioSource = "synthetic" | "real";

export interface QueuedApplication {
  /** Synthetic: APP-2026-NNNN  |  Real photo: APP-2026-RNNN. */
  applicationId: string;
  /** Matches DEMO_SCENARIOS or REAL_SCENARIOS entry id. */
  scenarioId: string;
  source: ScenarioSource;
  brand: string;
  /** Human-readable beverage label (e.g. "Distilled Spirits"). */
  beverageType: string;
  /** One-line description shown in the queue row. */
  description: string;
}

const BEVERAGE_TYPE_LABELS: Record<ApplicationData["beverageType"], string> = {
  "distilled-spirits": "Distilled Spirits",
  wine: "Wine",
  "malt-beverage": "Malt Beverage",
  unknown: "Unknown",
};

function syntheticAppId(index: number): string {
  return `APP-2026-${String(index + 1).padStart(4, "0")}`;
}

function realAppId(index: number): string {
  return `APP-2026-R${String(index + 1).padStart(3, "0")}`;
}

function mapSynthetic(s: DemoScenario, index: number): QueuedApplication {
  return {
    applicationId: syntheticAppId(index),
    scenarioId: s.id,
    source: "synthetic",
    brand: s.data.brand,
    beverageType: BEVERAGE_TYPE_LABELS[s.data.beverageType],
    description: s.name,
  };
}

function mapReal(s: RealScenario, index: number): QueuedApplication {
  return {
    applicationId: realAppId(index),
    scenarioId: s.id,
    source: "real",
    brand: s.data.brand,
    beverageType: BEVERAGE_TYPE_LABELS[s.data.beverageType],
    description: s.name,
  };
}

/**
 * Returns synthetic scenarios first (APP-2026-0001..NNNN) followed by
 * real-photo scenarios (APP-2026-R001..RNNN). Stable order so the
 * queue's row positions don't shuffle between page loads.
 */
export function listApplications(): QueuedApplication[] {
  return [
    ...DEMO_SCENARIOS.map((s, i) => mapSynthetic(s, i)),
    ...REAL_SCENARIOS.map((s, i) => mapReal(s, i)),
  ];
}
