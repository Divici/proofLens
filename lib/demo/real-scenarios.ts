import { z } from "zod";
import { ApplicationDataSchema, type ApplicationData } from "@/lib/ai/schema";
import manifestRaw from "../../public/demo-labels/real/manifest.json";

/**
 * Real bottle photos that ship in the queue alongside the synthetic
 * `DEMO_SCENARIOS`. Each entry in
 * `public/demo-labels/real/manifest.json` becomes its own scenario, so a
 * single product photographed under multiple conditions
 * (front / angled / glare / low light) shows up as separate queue rows
 * — that's the point: reviewers see how proofLens responds to each
 * image-quality variant.
 */

export interface RealScenario {
  /** Stable id of the form `real-<basename>` (lowercase). */
  id: string;
  /** Human-readable label, derived from the manifest description. */
  name: string;
  /** Public path under `/public`, served by Next.js statically. */
  labelPath: string;
  /** ApplicationData payload paired with this photo. */
  data: ApplicationData;
}

const ManifestEntrySchema = z.object({
  filename: z.string().min(1),
  description: z.string().min(1),
  applicationData: ApplicationDataSchema,
});

const ManifestSchema = z.array(ManifestEntrySchema);

function basenameWithoutExt(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return (lastDot === -1 ? filename : filename.slice(0, lastDot)).toLowerCase();
}

function buildScenarios(): RealScenario[] {
  const parsed = ManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    throw new Error(
      `public/demo-labels/real/manifest.json is malformed: ${parsed.error.message}`,
    );
  }
  return parsed.data.map((entry) => ({
    id: `real-${basenameWithoutExt(entry.filename)}`,
    name: entry.description,
    labelPath: `/demo-labels/real/${entry.filename}`,
    data: entry.applicationData,
  }));
}

export const REAL_SCENARIOS: ReadonlyArray<RealScenario> = buildScenarios();
