/**
 * Browser-side minimal ZIP builder (store / no compression).
 *
 * Why we don't use `archiver` in the browser: archiver pulls in a Node
 * `Readable` and zlib pathway that doesn't run in modern bundlers
 * cleanly. For batch exports the bytes we add are already compressed
 * (PDFs, JSON wrapping base64 thumbnails), so additional deflation
 * gains <5% and adds ~30 KB of zlib code.
 *
 * The implementation produces a valid ZIP (PKZip 2.0) with:
 *   - Local file header (signature 0x04034b50)
 *   - File data (stored, no compression — compression method = 0)
 *   - Central directory record (signature 0x02014b50) per entry
 *   - End-of-central-directory record (signature 0x06054b50)
 *
 * CRC32 is computed via a standard table-driven loop. Spec reference:
 * APPNOTE.TXT 6.3.6 (PKWARE).
 */

interface BrowserZipEntry {
  name: string;
  bytes: Uint8Array;
}

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(date: Date): { time: number; date: number } {
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const d =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, date: d };
}

export function buildBrowserZip(
  entries: ReadonlyArray<BrowserZipEntry>,
  now: Date = new Date(),
): Blob {
  const dos = dosTime(now);
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;
  const encoder = new TextEncoder();

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    // Bit 11 of the general-purpose flag is the "language encoding"
    // flag (APPNOTE 4.4.4). When set, the filename is interpreted as
    // UTF-8; when clear, parsers default to codepage 437 — which
    // mojibakes accented names on Windows Explorer. We always TextEncode
    // names as UTF-8, so set the flag whenever any byte is > 0x7F.
    let hasNonAscii = false;
    for (let i = 0; i < nameBytes.length; i++) {
      if (nameBytes[i]! > 0x7f) {
        hasNonAscii = true;
        break;
      }
    }
    const flags = hasNonAscii ? 0x0800 : 0;

    // Local file header (30 bytes + name).
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lhDV = new DataView(localHeader.buffer);
    lhDV.setUint32(0, 0x04034b50, true); // signature
    lhDV.setUint16(4, 20, true); // version needed
    lhDV.setUint16(6, flags, true); // flags
    lhDV.setUint16(8, 0, true); // method = stored
    lhDV.setUint16(10, dos.time, true);
    lhDV.setUint16(12, dos.date, true);
    lhDV.setUint32(14, crc, true);
    lhDV.setUint32(18, size, true); // compressed size
    lhDV.setUint32(22, size, true); // uncompressed size
    lhDV.setUint16(26, nameBytes.length, true);
    lhDV.setUint16(28, 0, true); // extra field length
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, entry.bytes);

    // Central directory header (46 bytes + name).
    const central = new Uint8Array(46 + nameBytes.length);
    const cdDV = new DataView(central.buffer);
    cdDV.setUint32(0, 0x02014b50, true); // signature
    cdDV.setUint16(4, 20, true); // version made by
    cdDV.setUint16(6, 20, true); // version needed
    cdDV.setUint16(8, flags, true); // flags
    cdDV.setUint16(10, 0, true); // method = stored
    cdDV.setUint16(12, dos.time, true);
    cdDV.setUint16(14, dos.date, true);
    cdDV.setUint32(16, crc, true);
    cdDV.setUint32(20, size, true);
    cdDV.setUint32(24, size, true);
    cdDV.setUint16(28, nameBytes.length, true);
    cdDV.setUint16(30, 0, true); // extra
    cdDV.setUint16(32, 0, true); // comment len
    cdDV.setUint16(34, 0, true); // disk #
    cdDV.setUint16(36, 0, true); // internal attrs
    cdDV.setUint32(38, 0, true); // external attrs
    cdDV.setUint32(42, offset, true); // local header offset
    central.set(nameBytes, 46);
    centralChunks.push(central);

    offset += localHeader.length + entry.bytes.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of centralChunks) centralSize += c.length;

  // End of central directory.
  const eocd = new Uint8Array(22);
  const eocdDV = new DataView(eocd.buffer);
  eocdDV.setUint32(0, 0x06054b50, true);
  eocdDV.setUint16(4, 0, true); // disk #
  eocdDV.setUint16(6, 0, true); // disk where central starts
  eocdDV.setUint16(8, entries.length, true);
  eocdDV.setUint16(10, entries.length, true);
  eocdDV.setUint32(12, centralSize, true);
  eocdDV.setUint32(16, centralStart, true);
  eocdDV.setUint16(20, 0, true); // comment length

  // Cast through unknown[] to BlobPart[] to dodge TS5's tightened
  // ArrayBufferLike vs. ArrayBuffer disjointness — every element is a
  // concrete Uint8Array which is a valid BlobPart at runtime.
  return new Blob(
    [...localChunks, ...centralChunks, eocd] as unknown as BlobPart[],
    { type: "application/zip" },
  );
}
