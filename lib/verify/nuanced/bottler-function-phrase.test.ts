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

  it("detects 'Bottled by' when the evidence quote ITSELF includes the verb (LLM evidence is a longer slice than the structured name)", async () => {
    // Real bug: LLM extracts bottlerName.value = "OLD TOM
    // DISTILLERY, LLC" (clean) but evidenceQuote = "BOTTLED BY OLD
    // TOM DISTILLERY, LLC" (full slice including the verb). Window
    // must include the evidence range itself, not just the chars
    // before it.
    const evidenceWithVerb = "BOTTLED BY OLD TOM DISTILLERY, LLC";
    // Mid-label OCR — evidence is at a non-zero index.
    const ocr =
      "OLD TOM DISTILLERY\n750 mL\nBOTTLED BY OLD TOM DISTILLERY, LLC\nBARDSTOWN, KENTUCKY";
    const result = findBottlerFunctionPhrase(ocr, evidenceWithVerb);
    expect(result.found).toBe(true);
  });

  it("detects 'Bottled by' when the evidence quote starts at index 0 (the empty-before-window edge case)", () => {
    // If evidence sits at the start of the OCR, the old "chars before
    // the evidence" window is empty even though the verb is RIGHT
    // there inside the evidence.
    const evidenceWithVerb = "BOTTLED BY OLD TOM DISTILLERY, LLC";
    const result = findBottlerFunctionPhrase(evidenceWithVerb, evidenceWithVerb);
    expect(result.found).toBe(true);
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

  it("Vercel regression — sparse rawText (gov-warning only), but evidence quote contains 'BREWED AND BOTTLED BY ...' → found", () => {
    // Production path on Vercel: Tesseract is disabled (ADR 0007),
    // so `rawText` is just the LLM's gov-warning capture and does
    // NOT contain the bottler statement. The verb-bearing slice is
    // in the LLM's evidenceQuote. The scanner must merge both
    // sources so this case finds the verb. Phase-9 user reported
    // Stone's Throw being false-flagged with exactly this layout.
    const evidenceWithVerb =
      "BREWED AND BOTTLED BY STONE'S THROW BREWING CO.";
    const sparseRawText =
      "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON GENERAL, " +
      "WOMEN SHOULD NOT DRINK ALCOHOLIC BEVERAGES DURING PREGNANCY ...";
    const result = findBottlerFunctionPhrase(
      sparseRawText,
      evidenceWithVerb,
    );
    expect(result.found).toBe(true);
    expect(result.phrase?.toLowerCase()).toContain("brewed and bottled by");
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
