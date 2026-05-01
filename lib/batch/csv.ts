import Papa from "papaparse";
import {
  ApplicationDataSchema,
  BeverageTypeSchema,
} from "@/lib/ai/schema";
import type { ExpectedRow } from "./pair";

/**
 * CSV-based paired-import reader for batch flow (R-004).
 *
 * Reviewers download a template at `/api/template/csv`, fill rows
 * mirroring `ApplicationData`, and upload it alongside the label files.
 * The header order is fixed so the template + this parser stay in sync.
 *
 * Errors are collected per-row with 1-indexed line numbers so the UI can
 * pinpoint exactly which row needs fixing — much friendlier than a single
 * "csv invalid" toast.
 */

export const CSV_TEMPLATE_HEADERS = [
  "filename",
  "brand",
  "classType",
  "abv",
  "netContents",
  "bottlerName",
  "bottlerAddress",
  "countryOfOrigin",
  "govWarningRequired",
  "applicationNotes",
  "beverageType",
] as const;

type Header = (typeof CSV_TEMPLATE_HEADERS)[number];

/**
 * Reference template body. The first row is documentation-grade — it
 * round-trips through the parser as a real ExpectedRow so demo flows can
 * use it as-is without copy-pasting.
 */
/**
 * Quote a CSV field if it contains a comma, quote, or newline. RFC 4180.
 */
function csvQuote(value: string): string {
  if (/[,"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const CSV_TEMPLATE_TEXT = [
  CSV_TEMPLATE_HEADERS.join(","),
  [
    "01-spirits-pass.jpg",
    "Old Tom Distillery",
    "Kentucky Straight Bourbon Whiskey",
    "45",
    "750 mL",
    "Old Tom Distillery LLC",
    "123 Bourbon Lane Bardstown KY 40004",
    "United States",
    "true",
    "TTB-2026-00001",
    "distilled-spirits",
  ]
    .map(csvQuote)
    .join(","),
].join("\n");

export interface ParsedCsv {
  rows: ExpectedRow[];
  /** Plain-English error messages with `line N:` prefixes. */
  errors: string[];
}

const TRUE_VALUES = new Set(["true", "yes", "y", "1"]);
const FALSE_VALUES = new Set(["false", "no", "n", "0"]);

function parseBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(v)) return true;
  if (FALSE_VALUES.has(v)) return false;
  return null;
}

function parseAbv(raw: string): number | null {
  const v = raw.trim();
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function parseExpectedDataCsv(text: string): ParsedCsv {
  if (!text || text.trim() === "") {
    return { rows: [], errors: ["CSV is empty."] };
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const errors: string[] = [];

  // Header sanity check.
  const fields = parsed.meta.fields ?? [];
  const missingHeaders = CSV_TEMPLATE_HEADERS.filter(
    (h) => !fields.includes(h),
  );
  if (missingHeaders.length > 0) {
    errors.push(
      `CSV header row is missing required column(s): ${missingHeaders.join(", ")}.`,
    );
    return { rows: [], errors };
  }

  for (const err of parsed.errors ?? []) {
    const line = (err.row ?? 0) + 2; // +1 for header, +1 to 1-index
    errors.push(`Line ${line}: ${err.message}`);
  }

  const rows: ExpectedRow[] = [];

  parsed.data.forEach((row, index) => {
    const lineNumber = index + 2; // header is line 1

    const filename = (row[("filename" satisfies Header) as string] ?? "").trim();
    if (filename === "") {
      errors.push(`Line ${lineNumber}: filename is required.`);
      return;
    }

    const abv = parseAbv(row.abv ?? "");
    if (abv === null) {
      errors.push(
        `Line ${lineNumber}: abv must be a number (got "${row.abv ?? ""}").`,
      );
      return;
    }

    const govWarningRequired = parseBool(row.govWarningRequired ?? "");
    if (govWarningRequired === null) {
      errors.push(
        `Line ${lineNumber}: govWarningRequired must be true/false (got "${row.govWarningRequired ?? ""}").`,
      );
      return;
    }

    const beverageParse = BeverageTypeSchema.safeParse(
      (row.beverageType ?? "").trim(),
    );
    if (!beverageParse.success) {
      errors.push(
        `Line ${lineNumber}: beverageType must be one of distilled-spirits|wine|malt-beverage|unknown (got "${row.beverageType ?? ""}").`,
      );
      return;
    }

    const candidate = {
      brand: (row.brand ?? "").trim(),
      classType: (row.classType ?? "").trim(),
      abv,
      netContents: (row.netContents ?? "").trim(),
      bottlerName: (row.bottlerName ?? "").trim(),
      bottlerAddress: (row.bottlerAddress ?? "").trim(),
      countryOfOrigin: (row.countryOfOrigin ?? "").trim(),
      govWarningRequired,
      applicationNotes: (row.applicationNotes ?? "").trim(),
      beverageType: beverageParse.data,
    };

    const expectedParse = ApplicationDataSchema.safeParse(candidate);
    if (!expectedParse.success) {
      const issue = expectedParse.error.issues[0];
      const path = issue?.path.join(".") || "(root)";
      errors.push(
        `Line ${lineNumber}: ${path} — ${issue?.message ?? "invalid value"}.`,
      );
      return;
    }

    rows.push({ filename, expected: expectedParse.data });
  });

  return { rows, errors };
}
