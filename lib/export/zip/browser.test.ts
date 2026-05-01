// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildBrowserZip } from "./browser";

/**
 * Browser ZIP smoke tests — assert the ZIP signatures + roundtrip a
 * known small payload by re-parsing the local file headers.
 */

async function blobToBuffer(blob: Blob): Promise<Buffer> {
  return Buffer.from(await blob.arrayBuffer());
}

function findAt(buf: Buffer, sig: number[]): number {
  outer: for (let i = 0; i + sig.length <= buf.length; i++) {
    for (let j = 0; j < sig.length; j++) {
      if (buf[i + j] !== sig[j]) continue outer;
    }
    return i;
  }
  return -1;
}

describe("buildBrowserZip", () => {
  it("produces a Blob with the ZIP local file header signature", async () => {
    const blob = buildBrowserZip([
      { name: "a.txt", bytes: new TextEncoder().encode("hello") },
    ]);
    const buf = await blobToBuffer(blob);
    expect(buf.slice(0, 4).toString("binary")).toBe("PK\x03\x04");
  });

  it("includes the EOCD signature at the end", async () => {
    const blob = buildBrowserZip([
      { name: "a.txt", bytes: new TextEncoder().encode("hello") },
    ]);
    const buf = await blobToBuffer(blob);
    // EOCD is "PK\x05\x06"
    expect(findAt(buf, [0x50, 0x4b, 0x05, 0x06])).toBeGreaterThan(0);
  });

  it("contains every filename in the archive bytes", async () => {
    const names = ["x.json", "y.json", "z.json"];
    const blob = buildBrowserZip(
      names.map((n) => ({
        name: n,
        bytes: new TextEncoder().encode(`{"name":"${n}"}`),
      })),
    );
    const buf = await blobToBuffer(blob);
    for (const n of names) {
      expect(buf.toString("binary")).toContain(n);
    }
  });

  it("produces a valid empty ZIP for 0 entries", async () => {
    const blob = buildBrowserZip([]);
    const buf = await blobToBuffer(blob);
    // Empty ZIP is just an EOCD record (22 bytes).
    expect(buf.length).toBe(22);
    expect(buf.slice(0, 4).toString("binary")).toBe("PK\x05\x06");
  });

  it("preserves payload bytes verbatim (stored / no compression)", async () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 254, 255]);
    const blob = buildBrowserZip([{ name: "raw.bin", bytes: payload }]);
    const buf = await blobToBuffer(blob);
    // After the local file header (30 bytes) + filename (7 bytes), the
    // payload should appear verbatim.
    const start = 30 + "raw.bin".length;
    expect(Array.from(buf.slice(start, start + payload.length))).toEqual([
      1, 2, 3, 4, 5, 254, 255,
    ]);
  });

  it("produces byte-identical output for two calls with the same `now`", async () => {
    // Byte-stability is the load-bearing claim — the exported ZIP is
    // checksummed by downstream auditors. Same inputs + same mtime
    // must produce the same bytes.
    const fixedDate = new Date("2026-04-29T12:30:00.000Z");
    const entries = [
      { name: "a.json", bytes: new TextEncoder().encode('{"a":1}') },
      { name: "b.json", bytes: new TextEncoder().encode('{"b":2}') },
    ];
    const zipA = await blobToBuffer(buildBrowserZip(entries, fixedDate));
    const zipB = await blobToBuffer(buildBrowserZip(entries, fixedDate));
    expect(zipA.equals(zipB)).toBe(true);
  });

  it("produces different bytes for different `now` values (sanity)", async () => {
    const entries = [
      { name: "a.json", bytes: new TextEncoder().encode('{"a":1}') },
    ];
    const zipA = await blobToBuffer(
      buildBrowserZip(entries, new Date("2026-01-01T00:00:00.000Z")),
    );
    const zipB = await blobToBuffer(
      buildBrowserZip(entries, new Date("2026-12-31T23:59:58.000Z")),
    );
    expect(zipA.equals(zipB)).toBe(false);
  });

  it("sets bit 11 (UTF-8 name) when entry name contains non-ASCII bytes", async () => {
    // Bit 11 of the general-purpose flag = "language encoding flag"
    // (UTF-8). Without it Windows Explorer mojibakes non-ASCII names
    // because it falls back to codepage 437. Spec: APPNOTE 4.4.4.
    const blob = buildBrowserZip([
      { name: "résumé.json", bytes: new TextEncoder().encode("{}") },
    ]);
    const buf = await blobToBuffer(blob);
    // Local file header flags live at offset 6 (2 bytes, little-endian).
    const flags = buf.readUInt16LE(6);
    expect((flags & 0x0800) !== 0).toBe(true);
  });

  it("leaves bit 11 clear for ASCII-only entry names", async () => {
    const blob = buildBrowserZip([
      { name: "plain.json", bytes: new TextEncoder().encode("{}") },
    ]);
    const buf = await blobToBuffer(blob);
    const flags = buf.readUInt16LE(6);
    expect((flags & 0x0800) === 0).toBe(true);
  });
});
