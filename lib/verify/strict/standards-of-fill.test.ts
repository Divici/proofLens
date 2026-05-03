import { describe, expect, it } from "vitest";
import { isAuthorizedFillSize } from "./standards-of-fill";

describe("isAuthorizedFillSize — TTB §§ 4.72 (wine) / 5.203 (spirits)", () => {
  it("750 mL is authorized for wine and spirits", () => {
    expect(isAuthorizedFillSize(750, "wine")).toBe(true);
    expect(isAuthorizedFillSize(750, "distilled-spirits")).toBe(true);
  });

  it("680 mL spirits is non-compliant (between 570 and 700)", () => {
    expect(isAuthorizedFillSize(680, "distilled-spirits")).toBe(false);
  });

  it("730 mL wine is non-compliant (between 720 and 750)", () => {
    expect(isAuthorizedFillSize(730, "wine")).toBe(false);
  });

  it("355 mL is authorized for both wine and spirits (2025 TTB-200 amendment)", () => {
    expect(isAuthorizedFillSize(355, "wine")).toBe(true);
    expect(isAuthorizedFillSize(355, "distilled-spirits")).toBe(true);
  });

  it("malt beverages always return true (no fixed list — § 7.70 uses US customary)", () => {
    expect(isAuthorizedFillSize(355, "malt-beverage")).toBe(true);
    expect(isAuthorizedFillSize(680, "malt-beverage")).toBe(true);
  });

  it("unknown beverage type returns true (don't false-flag unclassified products)", () => {
    expect(isAuthorizedFillSize(680, "unknown")).toBe(true);
  });

  it("wine sizes >3 L are authorized in even-liter increments (4 L, 5 L, etc.)", () => {
    expect(isAuthorizedFillSize(4000, "wine")).toBe(true);
    expect(isAuthorizedFillSize(5000, "wine")).toBe(true);
    expect(isAuthorizedFillSize(4500, "wine")).toBe(false);
  });

  it("tolerates 0.5 mL float drift on the canonical list", () => {
    expect(isAuthorizedFillSize(750.3, "wine")).toBe(true);
    expect(isAuthorizedFillSize(749.7, "wine")).toBe(true);
  });
});
