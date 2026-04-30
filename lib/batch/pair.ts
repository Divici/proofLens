import type { ApplicationData } from "@/lib/ai/schema";

/**
 * Filename pairing for batch import.
 *
 * Reviewers drop a folder of label images plus a paired CSV/JSON describing
 * the expected `ApplicationData` per file. Pairing is deliberately
 * forgiving: case-insensitive, extension-agnostic. Collisions resolve to
 * first-match with a human-readable warning so the reviewer notices the
 * duplication without losing the rest of the batch.
 */

export interface ExpectedRow {
  filename: string;
  expected: ApplicationData;
}

export interface PairedItem {
  /** Original `File` from the dropzone — preserves bytes + metadata. */
  file: File;
  /** Expected application data for this file. */
  expected: ApplicationData;
  /** Original (un-normalized) filename used for display. */
  filename: string;
}

export interface PairingResult {
  paired: PairedItem[];
  /** Files with no matching expected row. */
  unpairedLabels: File[];
  /** Expected rows with no matching file. */
  unpairedExpected: ExpectedRow[];
  /** Human-readable warnings (duplicates, ambiguous keys, etc.). */
  warnings: string[];
}

/**
 * Normalize a filename for matching:
 *   1. Lowercase.
 *   2. Strip extension (everything after the last `.`).
 *
 * Files with no extension are kept as-is (lowercased). Files starting
 * with a `.` (e.g. `.gitignore`) keep the leading dot; this is fine since
 * those won't be in a label batch.
 */
export function normalizeFilenameKey(filename: string): string {
  const lower = filename.toLowerCase();
  const lastDot = lower.lastIndexOf(".");
  // Treat the entire name as the key when there's no extension or the dot
  // is the leading character (hidden file like `.dsstore`).
  if (lastDot <= 0) return lower;
  return lower.slice(0, lastDot);
}

export function pairLabelsToExpected(
  labels: ReadonlyArray<File>,
  expected: ReadonlyArray<ExpectedRow>,
): PairingResult {
  const warnings: string[] = [];

  // Build expected-row map keyed on normalized filename. First entry wins.
  const expectedByKey = new Map<string, ExpectedRow>();
  for (const row of expected) {
    const key = normalizeFilenameKey(row.filename);
    if (expectedByKey.has(key)) {
      warnings.push(
        `Duplicate expected-data row for "${row.filename}" — using first occurrence.`,
      );
      continue;
    }
    expectedByKey.set(key, row);
  }

  // Walk labels in original order so the queue keeps the reviewer's order.
  const usedKeys = new Set<string>();
  const paired: PairedItem[] = [];
  const unpairedLabels: File[] = [];

  for (const file of labels) {
    const key = normalizeFilenameKey(file.name);
    if (usedKeys.has(key)) {
      warnings.push(
        `Duplicate label filename "${file.name}" — using first occurrence.`,
      );
      unpairedLabels.push(file);
      continue;
    }
    const match = expectedByKey.get(key);
    if (!match) {
      unpairedLabels.push(file);
      continue;
    }
    usedKeys.add(key);
    paired.push({ file, expected: match.expected, filename: file.name });
  }

  // Anything that was never used on the expected side is reported back.
  const unpairedExpected: ExpectedRow[] = [];
  for (const row of expected) {
    const key = normalizeFilenameKey(row.filename);
    if (!usedKeys.has(key)) {
      // Only include the row if it wasn't already a duplicate we warned about.
      // The expectedByKey map has the first occurrence; subsequent
      // duplicates are dropped silently after the warning.
      const stored = expectedByKey.get(key);
      if (stored && stored === row) {
        unpairedExpected.push(row);
      }
    }
  }

  return { paired, unpairedLabels, unpairedExpected, warnings };
}
