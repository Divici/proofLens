import type { ApplicationData } from "@/lib/ai/schema";

/**
 * Demo scenarios used by the "Load demo data" button on the single-label
 * review screen. Slice 0002 ships only Scenario 1 (PRD §19); slices 0009
 * and onwards add the rest.
 *
 * Each entry pairs:
 *   - `labelPath`: a public-folder URL for the placeholder JPEG
 *   - `data`: a fully-populated `ApplicationData` to seed the form
 */

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  labelPath: string;
  data: ApplicationData;
}

export const DEMO_SCENARIO_01: DemoScenario = {
  id: "01-spirits-pass",
  name: "Old Tom Distillery — Bourbon",
  description: "Fully matching distilled-spirits label per PRD §19 Scenario 1.",
  labelPath: "/demo-labels/01-spirits-pass.jpg",
  data: {
    brand: "Old Tom Distillery",
    classType: "Kentucky Straight Bourbon Whiskey",
    abv: 45,
    netContents: "750 mL",
    bottlerName: "Old Tom Distillery, LLC",
    bottlerAddress: "123 Bourbon Lane, Bardstown, KY 40004",
    countryOfOrigin: "United States",
    govWarningRequired: true,
    applicationNotes: "TTB-2026-00001",
    beverageType: "distilled-spirits",
  },
};

export const DEMO_SCENARIOS: ReadonlyArray<DemoScenario> = [
  DEMO_SCENARIO_01,
];
