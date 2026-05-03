import { describe, expect, it } from "vitest";
import {
  evaluateRule,
  fieldRequirementsFor,
  isUniversalField,
  ruleFor,
  REQUIREMENT_NOT_APPLICABLE,
  REQUIREMENT_CONDITIONAL,
  REQUIREMENT_REQUIRED,
  type BeverageField,
} from "./beverage-rules";

describe("ruleFor — base requirement table per beverage class", () => {
  it("spirits: brand / class / name+addr / net-contents / gov-warning / ABV are Required", () => {
    expect(ruleFor("distilled-spirits", "brand")).toBe(REQUIREMENT_REQUIRED);
    expect(ruleFor("distilled-spirits", "classType")).toBe(
      REQUIREMENT_REQUIRED,
    );
    expect(ruleFor("distilled-spirits", "bottlerName")).toBe(
      REQUIREMENT_REQUIRED,
    );
    expect(ruleFor("distilled-spirits", "bottlerAddress")).toBe(
      REQUIREMENT_REQUIRED,
    );
    expect(ruleFor("distilled-spirits", "netContents")).toBe(
      REQUIREMENT_REQUIRED,
    );
    expect(ruleFor("distilled-spirits", "governmentWarning")).toBe(
      REQUIREMENT_REQUIRED,
    );
    // Spirits ABV is always Required per 27 CFR § 5.65.
    expect(ruleFor("distilled-spirits", "abv")).toBe(REQUIREMENT_REQUIRED);
  });

  it("wine: ABV is Conditional, country is Conditional", () => {
    expect(ruleFor("wine", "abv")).toBe(REQUIREMENT_CONDITIONAL);
    expect(ruleFor("wine", "countryOfOrigin")).toBe(REQUIREMENT_CONDITIONAL);
  });

  it("malt: ABV is Conditional (only when added flavors contribute alcohol)", () => {
    expect(ruleFor("malt-beverage", "abv")).toBe(REQUIREMENT_CONDITIONAL);
  });

  it("unknown / other: only universal fields appear as Required; rest are Not-Applicable", () => {
    expect(ruleFor("unknown", "brand")).toBe(REQUIREMENT_REQUIRED);
    expect(ruleFor("unknown", "netContents")).toBe(REQUIREMENT_REQUIRED);
    expect(ruleFor("unknown", "governmentWarning")).toBe(
      REQUIREMENT_REQUIRED,
    );
    // Class/type, bottler, ABV, country all Not-Applicable for unknown.
    expect(ruleFor("unknown", "classType")).toBe(REQUIREMENT_NOT_APPLICABLE);
    expect(ruleFor("unknown", "abv")).toBe(REQUIREMENT_NOT_APPLICABLE);
    expect(ruleFor("unknown", "bottlerName")).toBe(
      REQUIREMENT_NOT_APPLICABLE,
    );
    expect(ruleFor("unknown", "bottlerAddress")).toBe(
      REQUIREMENT_NOT_APPLICABLE,
    );
    expect(ruleFor("unknown", "countryOfOrigin")).toBe(
      REQUIREMENT_NOT_APPLICABLE,
    );
  });
});

describe("evaluateRule — applies conditional logic per regulation", () => {
  it("spirits ABV → required regardless of value (27 CFR § 5.65)", () => {
    expect(
      evaluateRule("distilled-spirits", "abv", { expectedAbv: 5 }),
    ).toBe("required");
    expect(
      evaluateRule("distilled-spirits", "abv", { expectedAbv: 45 }),
    ).toBe("required");
  });

  it("wine ABV at 14.5% → required (27 CFR § 4.36)", () => {
    expect(
      evaluateRule("wine", "abv", { expectedAbv: 14.5 }),
    ).toBe("required");
  });

  it("wine ABV at 12% → optional (27 CFR § 4.36)", () => {
    expect(evaluateRule("wine", "abv", { expectedAbv: 12 })).toBe("optional");
  });

  it("wine ABV exactly 14% → optional (≤ 14% threshold)", () => {
    expect(evaluateRule("wine", "abv", { expectedAbv: 14 })).toBe("optional");
  });

  it("wine ABV without expected value falls back to optional (conservative)", () => {
    expect(evaluateRule("wine", "abv", {})).toBe("optional");
  });

  it("malt ABV defaults to optional when no `addedFlavorsContributeAlcohol` signal (27 CFR § 7.65)", () => {
    expect(evaluateRule("malt-beverage", "abv", { expectedAbv: 4 })).toBe(
      "optional",
    );
  });

  it("malt ABV becomes required when added flavors contribute alcohol", () => {
    expect(
      evaluateRule("malt-beverage", "abv", {
        expectedAbv: 4,
        addedFlavorsContributeAlcohol: true,
      }),
    ).toBe("required");
  });

  it("unknown beverage routes class/type field to manual-review (not-applicable)", () => {
    expect(evaluateRule("unknown", "classType", {})).toBe("not-applicable");
  });

  it("universal fields (brand, gov-warning, net-contents) stay required for unknown", () => {
    expect(evaluateRule("unknown", "brand", {})).toBe("required");
    expect(evaluateRule("unknown", "governmentWarning", {})).toBe(
      "required",
    );
    expect(evaluateRule("unknown", "netContents", {})).toBe("required");
  });
});

describe("fieldRequirementsFor — full per-beverage map", () => {
  it("returns a stable map of every field for spirits", () => {
    const map = fieldRequirementsFor("distilled-spirits", { expectedAbv: 45 });
    const fields: BeverageField[] = [
      "brand",
      "classType",
      "abv",
      "netContents",
      "bottlerName",
      "bottlerAddress",
      "countryOfOrigin",
      "governmentWarning",
    ];
    for (const f of fields) {
      expect(map[f]).toBeDefined();
    }
  });
});

describe("evaluateRule — country-of-origin (locked in: pipeline auto-derives isImported from expected.countryOfOrigin)", () => {
  it("isImported true → required", () => {
    expect(
      evaluateRule("distilled-spirits", "countryOfOrigin", {
        isImported: true,
      }),
    ).toBe("required");
    expect(
      evaluateRule("wine", "countryOfOrigin", { isImported: true }),
    ).toBe("required");
    expect(
      evaluateRule("malt-beverage", "countryOfOrigin", { isImported: true }),
    ).toBe("required");
  });

  it("isImported false (US product) → optional", () => {
    expect(
      evaluateRule("distilled-spirits", "countryOfOrigin", {
        isImported: false,
      }),
    ).toBe("optional");
    expect(
      evaluateRule("wine", "countryOfOrigin", { isImported: false }),
    ).toBe("optional");
  });
});

describe("isUniversalField — only brand / gov-warning / net-contents stay Required for unknown", () => {
  it("identifies the three universal fields", () => {
    expect(isUniversalField("brand")).toBe(true);
    expect(isUniversalField("netContents")).toBe(true);
    expect(isUniversalField("governmentWarning")).toBe(true);
  });

  it("rejects beverage-class-specific fields", () => {
    expect(isUniversalField("classType")).toBe(false);
    expect(isUniversalField("abv")).toBe(false);
    expect(isUniversalField("bottlerName")).toBe(false);
    expect(isUniversalField("bottlerAddress")).toBe(false);
    expect(isUniversalField("countryOfOrigin")).toBe(false);
  });
});
