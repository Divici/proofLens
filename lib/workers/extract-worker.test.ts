/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractLabelOnce } from "./extract-worker";
import type { ApplicationData } from "@/lib/ai/schema";

const sampleApp: ApplicationData = {
  brand: "Sample",
  classType: "Class",
  abv: 40,
  netContents: "750 mL",
  bottlerName: "Bottler",
  bottlerAddress: "Somewhere",
  countryOfOrigin: "United States",
  govWarningRequired: true,
  applicationNotes: "",
  beverageType: "distilled-spirits",
};

const successPayload = {
  extracted: {
    brand: { value: "Sample", evidenceQuote: "SAMPLE", confidence: 0.9 },
    classType: { value: "Class", evidenceQuote: "CLASS", confidence: 0.9 },
    alcoholContentText: {
      value: "40%",
      evidenceQuote: "40%",
      confidence: 0.9,
    },
    abvPercent: { value: 40, evidenceQuote: "40%", confidence: 0.9 },
    proof: { value: 80, evidenceQuote: "80", confidence: 0.9 },
    netContents: {
      value: "750 mL",
      evidenceQuote: "750 mL",
      confidence: 0.9,
    },
    bottlerName: {
      value: "Bottler",
      evidenceQuote: "BOTTLER",
      confidence: 0.9,
    },
    bottlerAddress: {
      value: "Somewhere",
      evidenceQuote: "SOMEWHERE",
      confidence: 0.9,
    },
    countryOfOrigin: {
      value: "United States",
      evidenceQuote: "U.S.A.",
      confidence: 0.9,
    },
    governmentWarningText: {
      value: "warning",
      evidenceQuote: "GOVERNMENT WARNING:",
      confidence: 0.9,
    },
    rawText: "RAW",
    imageQualityNotes: [],
    extractionConfidence: 0.9,
  },
  expected: sampleApp,
  rawText: "RAW",
  fieldResults: [],
  overall: "pass",
  processingTimeMs: 100,
  aiSpend: { primaryUsd: 0.001, fallbackUsd: 0 },
  ocrConfidence: 0.9,
  imageWidth: 200,
  imageHeight: 300,
  imageQualityFlags: [],
  imageQualityPoor: false,
};

describe("extractLabelOnce", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts multipart/form-data to /api/extract-label", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(successPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const file = new File([new Uint8Array([1, 2, 3])], "a.jpg", {
      type: "image/jpeg",
    });

    await extractLabelOnce({ file, expected: sampleApp });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/extract-label");
    expect(init?.method).toBe("POST");
    const body = init?.body;
    expect(body).toBeInstanceOf(FormData);
  });

  it("returns the parsed payload on a 200 response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(successPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const file = new File([new Uint8Array([1])], "a.jpg", {
      type: "image/jpeg",
    });

    const out = await extractLabelOnce({ file, expected: sampleApp });
    expect(out.overall).toBe("pass");
    expect(out.imageWidth).toBe(200);
    expect(out.aiSpend.primaryUsd).toBeCloseTo(0.001);
  });

  it("throws with the server-provided message on a 4xx/5xx response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "Image exceeds the 4 MB upload limit." }),
        { status: 413, headers: { "content-type": "application/json" } },
      ),
    );
    const file = new File([new Uint8Array([1])], "big.jpg", {
      type: "image/jpeg",
    });

    await expect(
      extractLabelOnce({ file, expected: sampleApp }),
    ).rejects.toThrow(/4 MB upload limit/i);
  });

  it("respects an AbortSignal and rejects with an abort error", async () => {
    vi.mocked(globalThis.fetch).mockImplementation(
      (
        _input: string | URL | globalThis.Request,
        init?: RequestInit,
      ) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const file = new File([new Uint8Array([1])], "a.jpg", {
      type: "image/jpeg",
    });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 5);
    await expect(
      extractLabelOnce({ file, expected: sampleApp, signal: ac.signal }),
    ).rejects.toThrow();
  });
});
