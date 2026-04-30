import { describe, expect, it } from "vitest";
import { pairLabelsToExpected, type PairingResult } from "./pair";
import type { ApplicationData } from "@/lib/ai/schema";

const sampleApp = (overrides: Partial<ApplicationData> = {}): ApplicationData => ({
  brand: "Sample Brand",
  classType: "Sample Class",
  abv: 40,
  netContents: "750 mL",
  bottlerName: "Sample Bottler",
  bottlerAddress: "Somewhere, US",
  countryOfOrigin: "United States",
  govWarningRequired: true,
  applicationNotes: "",
  beverageType: "distilled-spirits",
  ...overrides,
});

function fileWithName(name: string): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], name, {
    type: "image/jpeg",
  });
}

describe("pairLabelsToExpected", () => {
  it("matches case-insensitively and ignoring extension", () => {
    const labels = [
      fileWithName("Old-Tom.JPG"),
      fileWithName("StoneSthrow.png"),
    ];
    const expected = [
      { filename: "old-tom.jpg", expected: sampleApp({ brand: "Old Tom" }) },
      { filename: "STONESTHROW.PNG", expected: sampleApp({ brand: "Stone's" }) },
    ];

    const result: PairingResult = pairLabelsToExpected(labels, expected);

    expect(result.paired).toHaveLength(2);
    expect(result.unpairedLabels).toHaveLength(0);
    expect(result.unpairedExpected).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.paired[0]?.expected.brand).toBe("Old Tom");
    expect(result.paired[1]?.expected.brand).toBe("Stone's");
  });

  it("flags unpaired labels (label has no matching expected row)", () => {
    const labels = [
      fileWithName("paired.jpg"),
      fileWithName("orphan.jpg"),
    ];
    const expected = [
      { filename: "paired.jpg", expected: sampleApp() },
    ];

    const result = pairLabelsToExpected(labels, expected);

    expect(result.paired).toHaveLength(1);
    expect(result.unpairedLabels.map((f) => f.name)).toEqual(["orphan.jpg"]);
  });

  it("flags unpaired expected rows (no matching file)", () => {
    const labels = [fileWithName("a.jpg")];
    const expected = [
      { filename: "a.jpg", expected: sampleApp({ brand: "A" }) },
      { filename: "missing.jpg", expected: sampleApp({ brand: "B" }) },
    ];

    const result = pairLabelsToExpected(labels, expected);

    expect(result.paired).toHaveLength(1);
    expect(result.unpairedExpected.map((e) => e.filename)).toEqual([
      "missing.jpg",
    ]);
  });

  it("resolves duplicate label-side filenames first-match-with-warning", () => {
    const labels = [fileWithName("dup.jpg"), fileWithName("DUP.jpg")];
    const expected = [{ filename: "dup.jpg", expected: sampleApp() }];

    const result = pairLabelsToExpected(labels, expected);

    expect(result.paired).toHaveLength(1);
    expect(result.warnings.some((w) => /dup/i.test(w))).toBe(true);
    expect(result.unpairedLabels).toHaveLength(1);
  });

  it("resolves duplicate expected-side filenames first-match-with-warning", () => {
    const labels = [fileWithName("a.jpg")];
    const expected = [
      { filename: "a.jpg", expected: sampleApp({ brand: "First" }) },
      { filename: "A.JPG", expected: sampleApp({ brand: "Second" }) },
    ];

    const result = pairLabelsToExpected(labels, expected);

    expect(result.paired).toHaveLength(1);
    expect(result.paired[0]?.expected.brand).toBe("First");
    expect(result.warnings.some((w) => /a\.jpg/i.test(w))).toBe(true);
  });

  it("strips common extensions when matching", () => {
    const labels = [fileWithName("photo.jpeg")];
    const expected = [{ filename: "photo.png", expected: sampleApp() }];

    const result = pairLabelsToExpected(labels, expected);

    expect(result.paired).toHaveLength(1);
  });

  it("handles files with no extension", () => {
    const labels = [fileWithName("noext")];
    const expected = [{ filename: "noext", expected: sampleApp() }];

    const result = pairLabelsToExpected(labels, expected);

    expect(result.paired).toHaveLength(1);
  });
});
