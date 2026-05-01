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
});
