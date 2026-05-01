// @vitest-environment node
/**
 * `<ReviewReport>` is a `@react-pdf/renderer` React component, not a DOM
 * component. We assert structurally — render the tree to a PDF buffer via
 * `pdf(...).toBuffer()` and verify the buffer is a non-empty PDF, plus
 * walk the React element tree for the required structural sections.
 */
import { describe, expect, it } from "vitest";
import { renderToBuffer, pdf } from "@react-pdf/renderer";
import { isValidElement } from "react";
import { ReviewReport } from "./template";
import {
  makeReviewFixture,
  makeFieldResults,
} from "@/test/fixtures/review";

/**
 * `react-pdf` primitives (`Document`, `Page`, `Text`, `View`, `Image`) are
 * just string types like `'DOCUMENT'`, `'PAGE'`, etc. To inspect the
 * structural tree we evaluate the function-component output (call
 * `ReviewReport(props)`) and walk the resulting React element graph.
 */

interface AnyEl {
  type: unknown;
  props: { children?: unknown };
}

function flattenAll(node: unknown, out: AnyEl[] = []): AnyEl[] {
  if (node == null || node === false) return out;
  if (Array.isArray(node)) {
    for (const c of node) flattenAll(c, out);
    return out;
  }
  if (isValidElement(node)) {
    const el = node as unknown as AnyEl;
    out.push(el);
    flattenAll(el.props.children, out);
  }
  return out;
}

function collectText(node: unknown): string[] {
  const out: string[] = [];
  function walk(n: unknown) {
    if (n == null || n === false) return;
    if (typeof n === "string" || typeof n === "number") {
      out.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) walk(c);
      return;
    }
    if (isValidElement(n)) {
      const el = n as unknown as AnyEl;
      walk(el.props.children);
    }
  }
  walk(node);
  return out;
}

describe("ReviewReport (react-pdf component)", () => {
  it("renders a non-empty PDF buffer", async () => {
    const review = makeReviewFixture();
    const thumbnailDataUrl =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgAA//Z";
    const buf = await renderToBuffer(
      <ReviewReport
        review={review}
        thumbnailDataUrl={thumbnailDataUrl}
        appVersion="0.1.0"
      />,
    );
    expect(buf.length).toBeGreaterThan(500);
    // PDF magic bytes "%PDF-"
    expect(buf.slice(0, 5).toString("utf8")).toBe("%PDF-");
  });

  it("includes header, metadata, fields, verdict, signature, and § 16.21 footer", () => {
    const review = makeReviewFixture();
    const tree = ReviewReport({
      review,
      thumbnailDataUrl: "data:image/jpeg;base64,AAAA",
      appVersion: "0.1.0",
    });
    const text = collectText(tree).join("\n");
    expect(text).toContain("proofLens");
    expect(text).toContain("Jane Doe"); // reviewer name
    expect(text).toContain("Old Tom Distillery"); // brand from expected
    expect(text).toContain("Brand name"); // field label
    expect(text).toContain("Net contents");
    // Final decision text appears
    expect(text).toContain("rejected");
    // § 16.21 footer
    expect(text).toMatch(/27 CFR § 16\.21/);
    // Signature line
    expect(text).toMatch(/Final decision is the reviewer's responsibility/i);
    // 256 thumbnail footer note
    expect(text).toMatch(/256(?:\s*-?\s*)?px thumbnail/i);
  });

  it("omits the override section when no fields carry humanOverride", () => {
    const review = makeReviewFixture();
    const tree = ReviewReport({
      review,
      thumbnailDataUrl: "data:image/jpeg;base64,AAAA",
      appVersion: "0.1.0",
    });
    const text = collectText(tree).join("\n");
    // Heading should not appear
    expect(text).not.toMatch(/Human overrides/i);
  });

  it("renders the override section when at least one humanOverride is present", () => {
    const fields = makeFieldResults();
    fields[0] = {
      ...fields[0]!,
      humanOverride: {
        originalAiStatus: "pass",
        humanStatus: "fail",
        reason: "Found typo in brand on second pass.",
        timestamp: "2026-04-29T12:10:00.000Z",
        reviewerName: "Jane Doe",
      },
    };
    const review = makeReviewFixture({ fieldResults: fields });
    const tree = ReviewReport({
      review,
      thumbnailDataUrl: "data:image/jpeg;base64,AAAA",
      appVersion: "0.1.0",
    });
    const text = collectText(tree).join(" ");
    expect(text).toMatch(/Human overrides/i);
    expect(text).toContain("Found typo in brand");
    // Original AI vs human statuses both present (text chunks may be
    // separated by react-pdf's internal whitespace).
    expect(text).toMatch(/AI:\s*pass/i);
    expect(text).toMatch(/Human:\s*fail/i);
  });

  it("structural tree contains exactly one Document with a Page", () => {
    const review = makeReviewFixture();
    const tree = ReviewReport({
      review,
      thumbnailDataUrl: "data:image/jpeg;base64,AAAA",
      appVersion: "0.1.0",
    });
    const all = flattenAll(tree);
    // react-pdf primitives are string types like 'DOCUMENT', 'PAGE'.
    const docs = all.filter((e) => e.type === "DOCUMENT");
    const pages = all.filter((e) => e.type === "PAGE");
    expect(docs.length).toBe(1);
    expect(pages.length).toBeGreaterThanOrEqual(1);
  });

  it("pdf() factory returns a Readable stream via toBuffer (note: misnamed in the lib)", async () => {
    const review = makeReviewFixture();
    const instance = pdf(
      <ReviewReport
        review={review}
        thumbnailDataUrl="data:image/jpeg;base64,AAAA"
        appVersion="0.1.0"
      />,
    );
    // Per upstream comment in @react-pdf/renderer: "TODO: rename this
    // method to `toStream` because it returns a stream not a buffer."
    const stream = (await instance.toBuffer()) as NodeJS.ReadableStream;
    expect(typeof stream.on).toBe("function");
  });
});
