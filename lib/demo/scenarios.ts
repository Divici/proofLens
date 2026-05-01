import type { ApplicationData } from "@/lib/ai/schema";

/**
 * Demo scenarios used by the "Load demo data" button on the single-label
 * review screen.
 *
 * Slice 0002 shipped Scenario 1.
 * Slice 0003 added Scenario 3 (ABV mismatch) and Scenario 4 (Gov-warning
 * capitalization) to demonstrate the verification pipeline produces Fail
 * outcomes for both strict-fail paths.
 * Slice 0004 adds Scenario 2 (nuanced brand match), Scenario 5 (incomplete
 * gov warning) and Scenario 6 (glare/blur image-quality demotion).
 * Scenario 07 lands in slice 0009.
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

export const DEMO_SCENARIO_02: DemoScenario = {
  id: "02-stones-throw-caps",
  name: "Stone's Throw Lager — nuanced brand (Likely Match)",
  description:
    "Application brand 'Stone's Throw' renders as 'STONE'S THROW' on the label — nuanced ladder produces Likely Match rather than strict Fail.",
  labelPath: "/demo-labels/02-stones-throw-caps.jpg",
  data: {
    brand: "Stone's Throw",
    classType: "American Amber Lager",
    abv: 5.2,
    netContents: "12 fl oz",
    bottlerName: "Stone's Throw Brewing Co.",
    bottlerAddress: "Bend, OR",
    countryOfOrigin: "United States",
    govWarningRequired: true,
    applicationNotes: "TTB-2026-00002",
    beverageType: "malt-beverage",
  },
};

export const DEMO_SCENARIO_05: DemoScenario = {
  id: "05-warn-incomplete",
  name: "Riverfront Vineyards — incomplete warning (Fail)",
  description:
    "Government warning is truncated mid-sentence; strict matcher reports a wording_mismatch with high distance.",
  labelPath: "/demo-labels/05-warn-incomplete.jpg",
  data: {
    brand: "Riverfront Vineyards",
    classType: "Estate Chardonnay",
    abv: 13.5,
    netContents: "750 mL",
    bottlerName: "Riverfront Vineyards",
    bottlerAddress: "Napa, CA",
    countryOfOrigin: "United States",
    govWarningRequired: true,
    applicationNotes: "TTB-2026-00005",
    beverageType: "wine",
  },
};

export const DEMO_SCENARIO_06: DemoScenario = {
  id: "06-glare-blur",
  name: "Old Tom Distillery — blurry photo (Manual Review)",
  description:
    "Same artwork as Scenario 1 but heavily blurred; image-quality heuristics demote passing rows to Manual Review with Request Better Image.",
  labelPath: "/demo-labels/06-glare-blur.jpg",
  data: {
    brand: "Old Tom Distillery",
    classType: "Kentucky Straight Bourbon Whiskey",
    abv: 45,
    netContents: "750 mL",
    bottlerName: "Old Tom Distillery, LLC",
    bottlerAddress: "123 Bourbon Lane, Bardstown, KY 40004",
    countryOfOrigin: "United States",
    govWarningRequired: true,
    applicationNotes: "TTB-2026-00006",
    beverageType: "distilled-spirits",
  },
};

export const DEMO_SCENARIOS: ReadonlyArray<DemoScenario> = [
  DEMO_SCENARIO_01,
  DEMO_SCENARIO_02,
  DEMO_SCENARIO_03,
  DEMO_SCENARIO_04,
  DEMO_SCENARIO_05,
  DEMO_SCENARIO_06,
];

/**
 * Slice 0007 — bundled demo batch (Scenario 07).
 *
 * The "Load demo batch" button on `/batch` fetches the manifest at
 * `/demo-batch/manifest.json`, reads each entry's image, and pairs it
 * to the embedded `expected` row. Reviewers can then click Start and
 * watch a 6-file batch run end-to-end without picking files manually.
 */
export interface DemoBatchEntry {
  /** Filename used for queue display + pairing key. */
  filename: string;
  /** Public path under /public — fetched at runtime. */
  labelPath: string;
  expected: ApplicationData;
}

export interface DemoBatchPayload {
  scenarioId: "07-demo-batch";
  entries: DemoBatchEntry[];
}

export const DEMO_BATCH_SCENARIO_ID = "07-demo-batch" as const;
export const DEMO_BATCH_MANIFEST_URL = "/demo-batch/manifest.json";

/**
 * Fetch + validate the bundled demo batch manifest. Throws on any
 * shape mismatch so the page can surface a single toast.
 */
export async function loadDemoBatchManifest(): Promise<DemoBatchPayload> {
  const res = await fetch(DEMO_BATCH_MANIFEST_URL);
  if (!res.ok) {
    throw new Error(`demo manifest fetch failed (HTTP ${res.status})`);
  }
  const json = (await res.json()) as DemoBatchPayload;
  if (
    !json ||
    json.scenarioId !== DEMO_BATCH_SCENARIO_ID ||
    !Array.isArray(json.entries)
  ) {
    throw new Error("demo manifest is malformed");
  }
  return json;
}
