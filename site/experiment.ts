// Experiment 2's temporary page (docs/adr/0009-compatible-references.md):
// product 1's page with a chosen number of references, on Vercel previews
// only. Removed once the experiment has set the number.

/** The reference counts experiment 2 measures. */
export const EXPERIMENT_REFERENCE_COUNTS = [250, 500, 1000, 2000] as const;

/**
 * The count to render, or null when the page must answer 404: outside a Vercel
 * Preview deployment, or for a count the experiment does not measure.
 */
export function experimentReferenceCount(
  raw: string,
  env: Record<string, string | undefined>,
): number | null {
  if (env.VERCEL_ENV !== "preview") return null;
  const count = EXPERIMENT_REFERENCE_COUNTS.find((n) => String(n) === raw);
  return count ?? null;
}
