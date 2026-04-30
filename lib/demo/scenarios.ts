import type { ApplicationData } from "@/lib/ai/schema";

/**
 * Demo scenarios used by the "Load demo data" button on the single-label
 * review screen.
 *
 * Slice 0002 shipped Scenario 1 only.
 * Slice 0003 adds Scenario 3 (ABV mismatch) and Scenario 4 (Gov-warning
 * capitalization) to demonstrate the verification pipeline produces
 * Fail outcomes for both strict-fail paths.
 *
 * Scenarios 02 / 05 / 06 / 07 land in slices 0004 / 0009.
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
  name: "Old Tom Distillery — Bourbon (Pass)",
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

export const DEMO_SCENARIO_03: DemoScenario = {
  id: "03-abv-mismatch",
  name: "Cedar Ridge Vodka — ABV mismatch (Fail)",
  description:
    "Application says 40% ABV but the label prints 38% — strict ABV fail outside the spirits ±0.3 pp tolerance.",
  labelPath: "/demo-labels/03-abv-mismatch.jpg",
  data: {
    brand: "Cedar Ridge Vodka",
    classType: "Vodka",
    abv: 40,
    netContents: "750 mL",
    bottlerName: "Cedar Ridge Distilling Co.",
    bottlerAddress: "1500 Cedar Ridge Rd, Swisher, IA 52338",
    countryOfOrigin: "United States",
    govWarningRequired: true,
    applicationNotes: "TTB-2026-00003",
    beverageType: "distilled-spirits",
  },
};

export const DEMO_SCENARIO_04: DemoScenario = {
  id: "04-gov-warn-lowercase",
  name: "Lakeside Gin — Gov-warning lowercase (Fail)",
  description:
    "Government warning prefix is title-cased ('Government Warning:') instead of all-caps — strict gov-warning fail (PRD §19 Scenario 4).",
  labelPath: "/demo-labels/04-gov-warn-lowercase.jpg",
  data: {
    brand: "Lakeside Gin",
    classType: "London Dry Gin",
    abv: 47,
    netContents: "750 mL",
    bottlerName: "Lakeside Spirits, LLC",
    bottlerAddress: "200 Lakeside Drive, Traverse City, MI 49684",
    countryOfOrigin: "United States",
    govWarningRequired: true,
    applicationNotes: "TTB-2026-00004",
    beverageType: "distilled-spirits",
  },
};

export const DEMO_SCENARIOS: ReadonlyArray<DemoScenario> = [
  DEMO_SCENARIO_01,
  DEMO_SCENARIO_03,
  DEMO_SCENARIO_04,
];
