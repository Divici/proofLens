import { CSV_TEMPLATE_TEXT } from "@/lib/batch/csv";

/**
 * GET /api/template/csv — returns the batch import CSV template as a
 * downloadable attachment. Stateless; nothing persists server-side.
 *
 * The template body is a single example row matching the locked header
 * order so reviewers see the exact column layout. The same body
 * round-trips through `parseExpectedDataCsv`, which is asserted in
 * `route.test.ts`.
 */

export const dynamic = "force-static";
export const runtime = "nodejs";

export function GET(): Response {
  return new Response(CSV_TEMPLATE_TEXT, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition":
        'attachment; filename="prooflens-batch-template.csv"',
      "cache-control": "public, max-age=86400, immutable",
    },
  });
}
