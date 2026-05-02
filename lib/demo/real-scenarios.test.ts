import { describe, expect, it } from "vitest";
import { ApplicationDataSchema } from "@/lib/ai/schema";
import { REAL_SCENARIOS } from "./real-scenarios";

describe("REAL_SCENARIOS", () => {
  it("loads at least one entry from public/demo-labels/real/manifest.json", () => {
    expect(REAL_SCENARIOS.length).toBeGreaterThan(0);
  });

  it("derives ids of the form real-<basename>", () => {
    for (const s of REAL_SCENARIOS) {
      expect(s.id).toMatch(/^real-[a-z0-9-]+$/);
    }
  });

  it("points labelPath at /demo-labels/real/<filename>", () => {
    for (const s of REAL_SCENARIOS) {
      expect(s.labelPath.startsWith("/demo-labels/real/")).toBe(true);
    }
  });

  it("yields valid ApplicationData for every entry", () => {
    for (const s of REAL_SCENARIOS) {
      const result = ApplicationDataSchema.safeParse(s.data);
      expect(result.success, `manifest entry ${s.id} failed schema`).toBe(true);
    }
  });

  it("ids are unique", () => {
    const seen = new Set<string>();
    for (const s of REAL_SCENARIOS) {
      expect(seen.has(s.id), `duplicate id ${s.id}`).toBe(false);
      seen.add(s.id);
    }
  });
});
