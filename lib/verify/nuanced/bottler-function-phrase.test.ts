import { describe, expect, it } from "vitest";
import { findBottlerFunctionPhrase } from "./bottler-function-phrase";

describe("findBottlerFunctionPhrase — TTB §§ 5.66 / 4.35 / 7.66", () => {
  const EVIDENCE = "Old Tom Distillery, LLC";

  it("detects 'Bottled by' before the bottler name", () => {
    const result = findBottlerFunctionPhrase(
      "BOTTLED BY OLD TOM DISTILLERY, LLC\nBARDSTOWN, KENTUCKY",
      EVIDENCE,
    );
    expect(result.found).toBe(true);
    expect(result.phrase?.toLowerCase()).toContain("bottled by");
  });

  it("detects 'Distilled by' (spirits) — case-insensitive", () => {
    const result = findBottlerFunctionPhrase(
      "Distilled by Old Tom Distillery, LLC",
      EVIDENCE,
    );
    expect(result.found).toBe(true);
  });

  it("detects 'Brewed and bottled by' (malt — multi-word)", () => {
    const result = findBottlerFunctionPhrase(
      "Brewed and bottled by Old Tom Distillery, LLC",
      EVIDENCE,
    );
    expect(result.found).toBe(true);
  });

  it("detects 'Vinted and bottled by' (wine-specific)", () => {
    const result = findBottlerFunctionPhrase(
      "Vinted and bottled by Old Tom Distillery, LLC",
      EVIDENCE,
    );
    expect(result.found).toBe(true);
  });

  it("returns found=false when no approved verb is anywhere in the OCR", () => {
    const result = findBottlerFunctionPhrase(
      "Old Tom Distillery, LLC, Bardstown, Kentucky\nGOVERNMENT WARNING: ...",
      EVIDENCE,
    );
    expect(result.found).toBe(false);
  });

  it("only counts a verb that's near the bottler-name evidence (within 80 chars)", () => {
    // "Distilled by" appears in OCR but 200+ chars away from the
    // bottler name → does not count.
    const result = findBottlerFunctionPhrase(
      `Distilled by Some Other Brand at a different facility long ago.\n${"x".repeat(200)}\nOld Tom Distillery, LLC`,
      EVIDENCE,
    );
    expect(result.found).toBe(false);
  });

  it("tolerates whitespace and case variation in the verb itself", () => {
    expect(
      findBottlerFunctionPhrase(
        "  bottled  by  Old Tom Distillery, LLC",
        EVIDENCE,
      ).found,
    ).toBe(true);
  });

  it("when evidence is null/empty, falls back to scanning the entire OCR (tolerant default — don't false-warn when extraction lost the anchor)", () => {
    expect(
      findBottlerFunctionPhrase("Bottled by Some Brand", null).found,
    ).toBe(true);
    expect(
      findBottlerFunctionPhrase("Bottled by Some Brand", "").found,
    ).toBe(true);
    // No verb anywhere AND no anchor → we still have to warn,
    // because there's no signal that the label is compliant.
    expect(
      findBottlerFunctionPhrase("Just a brand line, no verb here", null)
        .found,
    ).toBe(false);
  });

  it("when the evidence quote can't be found in the OCR (rare — fragmentation or LLM normalisation drift), falls back to whole-OCR scan", () => {
    // Evidence is "Old Tom Distillery, LLC" but OCR only has
    // "OLD TOM" on one line and "DISTILLERY" on the next — the indexOf
    // lookup misses. We fall back to whole-OCR scan so we don't
    // false-warn purely because the LLM tidied up the text.
    const ocr =
      "BOTTLED BY\nOLD TOM\nDISTILLERY\nBARDSTOWN, KENTUCKY";
    const result = findBottlerFunctionPhrase(ocr, EVIDENCE);
    expect(result.found).toBe(true);
  });
});
