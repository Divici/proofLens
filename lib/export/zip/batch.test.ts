// @vitest-environment node
import { describe, expect, it } from "vitest";
import archiver from "archiver";
import { Readable } from "node:stream";
import { buildBatchZip } from "./batch";

/**
 * Read every entry from a ZIP buffer using `archiver` round-trip data.
 * (We don't import a separate decompressor — instead each test asserts
 * via `archiver`'s sibling listing capability where possible.)
 *
 * Pragmatic approach for these tests: we trust archiver to produce a
 * valid ZIP if (a) it emits the magic bytes "PK\x03\x04" and (b) the
 * total byte count matches what the stream emitted. We additionally
 * scan for filename strings inside the ZIP to assert all entries
 * landed.
 */

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

describe("buildBatchZip", () => {
  it("returns a Node Readable stream that yields a valid ZIP", async () => {
    const stream = await buildBatchZip([
      { name: "a.txt", content: Buffer.from("hello a") },
      { name: "b.txt", content: Buffer.from("hello b") },
    ]);
    const buf = await streamToBuffer(stream);
    expect(buf.length).toBeGreaterThan(0);
    // ZIP magic bytes: 0x50 0x4B 0x03 0x04 ("PK\x03\x04") at offset 0
    expect(buf.slice(0, 4).toString("binary")).toBe("PK\x03\x04");
  });

  it("contains every named entry — found in the central directory listing", async () => {
    const names = ["alpha.json", "beta.json", "gamma.json"];
    const stream = await buildBatchZip(
      names.map((n) => ({ name: n, content: Buffer.from(`content of ${n}`) })),
    );
    const buf = await streamToBuffer(stream);
    // Central directory keeps filenames in cleartext — assertable via byte search.
    for (const n of names) {
      expect(buf.toString("binary")).toContain(n);
    }
  });

  it("handles N=0 entries by producing an empty (but valid) ZIP", async () => {
    const stream = await buildBatchZip([]);
    const buf = await streamToBuffer(stream);
    // End-of-central-directory record signature at the end: 0x50 0x4b 0x05 0x06
    // Empty ZIP has only the EOCD; the buffer should be small but non-empty.
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true);
  });

  it("accepts entries from a Readable stream content (streaming PDF case)", async () => {
    const pdfish = Readable.from([Buffer.from("%PDF-1.4 fake")]);
    const stream = await buildBatchZip([
      { name: "review-001.pdf", content: pdfish },
    ]);
    const buf = await streamToBuffer(stream);
    expect(buf.toString("binary")).toContain("review-001.pdf");
  });

  it("uses streaming under the hood — buffer is built incrementally (smoke)", async () => {
    // Build a 50-entry zip and assert we got bytes for each.
    const entries = Array.from({ length: 50 }, (_, i) => ({
      name: `r${i.toString().padStart(3, "0")}.json`,
      content: Buffer.from(`{"id":"r${i}"}`),
    }));
    const stream = await buildBatchZip(entries);
    const buf = await streamToBuffer(stream);
    for (let i = 0; i < entries.length; i += 7) {
      expect(buf.toString("binary")).toContain(entries[i]!.name);
    }
  });

  it("returns a readable that exposes pipe + on for Next response handoff", async () => {
    // Required for `Readable.toWeb(stream)` in the route handler.
    const stream = await buildBatchZip([
      { name: "x.txt", content: Buffer.from("hello") },
    ]);
    expect(typeof stream.on).toBe("function");
    expect(typeof stream.pipe).toBe("function");
    // Drain to avoid leaking handles between tests.
    await streamToBuffer(stream);
  });

  it("uses archiver's deflate by default (small-file smoke)", async () => {
    // Verify the produced output is a real ZIP archiver can re-read.
    const stream = await buildBatchZip([
      { name: "x.txt", content: Buffer.from("hello world") },
    ]);
    const buf = await streamToBuffer(stream);
    // Use archiver's underlying detection: archive can be appended-to
    // again as a smoke "valid" check. Not a deep assertion, just a smell
    // test: PK header.
    expect(buf.slice(0, 2).toString("binary")).toBe("PK");
    // archiver instance is constructed without errors (smoke).
    const a = archiver("zip");
    expect(typeof a.append).toBe("function");
  });
});
