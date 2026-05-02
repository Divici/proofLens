import { describe, expect, it } from "vitest";
import { DEMO_SCENARIOS } from "@/lib/demo/scenarios";
import { REAL_SCENARIOS } from "@/lib/demo/real-scenarios";
import { listApplications } from "./applications";

describe("listApplications", () => {
  const apps = listApplications();

  it("returns one row per synthetic scenario plus one per real photo", () => {
    expect(apps.length).toBe(DEMO_SCENARIOS.length + REAL_SCENARIOS.length);
  });

  it("orders synthetic rows before real-photo rows", () => {
    const firstRealIndex = apps.findIndex((a) => a.source === "real");
    const lastSyntheticIndex = (() => {
      for (let i = apps.length - 1; i >= 0; i--) {
        if (apps[i]!.source === "synthetic") return i;
      }
      return -1;
    })();
    expect(firstRealIndex).toBeGreaterThan(lastSyntheticIndex);
    expect(firstRealIndex).toBe(DEMO_SCENARIOS.length);
  });

  it("formats synthetic APP-IDs as APP-2026-NNNN with sequential padding", () => {
    const synthetic = apps.filter((a) => a.source === "synthetic");
    synthetic.forEach((app, i) => {
      expect(app.applicationId).toMatch(/^APP-2026-\d{4}$/);
      const expectedSuffix = String(i + 1).padStart(4, "0");
      expect(app.applicationId).toBe(`APP-2026-${expectedSuffix}`);
    });
  });

  it("formats real-photo APP-IDs as APP-2026-RNNN with sequential padding", () => {
    const real = apps.filter((a) => a.source === "real");
    real.forEach((app, i) => {
      expect(app.applicationId).toMatch(/^APP-2026-R\d{3}$/);
      const expectedSuffix = String(i + 1).padStart(3, "0");
      expect(app.applicationId).toBe(`APP-2026-R${expectedSuffix}`);
    });
  });

  it("maps every synthetic scenario exactly once and preserves DEMO_SCENARIOS order", () => {
    const syntheticScenarioIds = apps
      .filter((a) => a.source === "synthetic")
      .map((a) => a.scenarioId);
    expect(syntheticScenarioIds).toEqual(DEMO_SCENARIOS.map((s) => s.id));
  });

  it("maps every real scenario exactly once and preserves REAL_SCENARIOS order", () => {
    const realScenarioIds = apps
      .filter((a) => a.source === "real")
      .map((a) => a.scenarioId);
    expect(realScenarioIds).toEqual(REAL_SCENARIOS.map((s) => s.id));
  });

  it("populates a non-empty brand for every row", () => {
    for (const app of apps) {
      expect(app.brand.length).toBeGreaterThan(0);
    }
  });

  it("populates a description for every row", () => {
    for (const app of apps) {
      expect(typeof app.description).toBe("string");
      expect(app.description.length).toBeGreaterThan(0);
    }
  });

  it("returns a stable order across repeated calls", () => {
    const first = listApplications().map((a) => a.applicationId);
    const second = listApplications().map((a) => a.applicationId);
    expect(second).toEqual(first);
  });
});
