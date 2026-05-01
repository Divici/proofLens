import { ApplicationDataSchema } from "@/lib/ai/schema";
import type { ExpectedRow } from "./pair";

/**
 * JSON-based paired-import reader for batch flow (R-004).
 *
 * Expected shape: an array of objects:
 *   `[{ "filename": "a.jpg", "expected": { ...ApplicationData } }, ...]`
 *
 * Each row is validated independently so a single bad row doesn't kill
 * the import. Errors carry `row N` references to keep the UI message
 * actionable.
 */

export interface ParsedJson {
  rows: ExpectedRow[];
  errors: string[];
}

export function parseExpectedDataJson(text: string): ParsedJson {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    return {
      rows: [],
      errors: [
        `Could not parse JSON: ${cause instanceof Error ? cause.message : "invalid syntax"}.`,
      ],
    };
  }

  if (!Array.isArray(raw)) {
    return {
      rows: [],
      errors: ["JSON must be an array of `{ filename, expected }` rows."],
    };
  }

  const rows: ExpectedRow[] = [];
  const errors: string[] = [];

  raw.forEach((entry, index) => {
    const rowLabel = `Row ${index + 1}`;

    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      errors.push(`${rowLabel}: must be an object, got ${typeof entry}.`);
      return;
    }

    const obj = entry as Record<string, unknown>;
    const filename = obj.filename;
    if (typeof filename !== "string" || filename.trim() === "") {
      errors.push(`${rowLabel}: \`filename\` is required (non-empty string).`);
      return;
    }

    const parsed = ApplicationDataSchema.safeParse(obj.expected);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.join(".") || "(root)";
      errors.push(
        `${rowLabel}: ${path} — ${issue?.message ?? "invalid value"}.`,
      );
      return;
    }

    rows.push({ filename: filename.trim(), expected: parsed.data });
  });

  return { rows, errors };
}
