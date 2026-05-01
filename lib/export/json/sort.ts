/**
 * Alphabetic-key JSON stringifier — produces deterministic output so two
 * exports of the same review yield byte-identical files. This matters for
 * audit trails (file checksums) and for diffing exports across runs.
 *
 * `JSON.stringify(value, replacer)` emits keys in insertion order; we
 * pre-sort each object's own enumerable keys (recursively) before
 * stringifying. Arrays preserve their original order — only object keys
 * are touched.
 */

export function stringifyAlphabetic(value: unknown, indent: number = 2): string {
  return JSON.stringify(sortKeys(value), null, indent);
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = sortKeys(obj[k]);
  return out;
}
