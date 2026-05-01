/**
 * `archiver`-based streaming ZIP builder for batch exports (R-015).
 *
 * Why streaming: a 250-PDF batch at ~80 KB / PDF is ~20 MB — manageable
 * in RAM, but a streaming build keeps memory pressure flat and lets the
 * client start downloading before every PDF is rendered. The function
 * returns a Node `Readable` that callers wrap in `Readable.toWeb` for
 * Next's Response stream API.
 *
 * Each entry is `{ name, content }` where `content` is either a `Buffer`
 * or a `Readable` (PDF render output, JSON serialisations, etc.). The
 * helper appends them in input order and finalises the archive.
 */

import archiver from "archiver";
import type { Readable } from "node:stream";

export interface ZipEntry {
  name: string;
  content: Buffer | Readable;
}

export async function buildBatchZip(
  entries: ReadonlyArray<ZipEntry>,
  options: { level?: number } = {},
): Promise<Readable> {
  const archive = archiver("zip", {
    zlib: { level: options.level ?? 6 },
  });

  // Wire upstream errors so callers see them. archiver emits a
  // diagnostic 'warning' on missing files etc.; we forward it so tests
  // can observe bad inputs.
  archive.on("warning", (err: Error & { code?: string }) => {
    if (err.code !== "ENOENT") {
      archive.emit("error", err);
    }
  });

  for (const entry of entries) {
    archive.append(entry.content, { name: entry.name });
  }

  // Finalise asynchronously — `finalize()` resolves once the central
  // directory has been written. Await before returning so the readable
  // is in a state where it can be drained synchronously.
  await archive.finalize();
  return archive;
}
