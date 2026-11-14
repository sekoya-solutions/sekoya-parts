// Model search in PostgreSQL (docs/adr/0010-search.md, issue #113): models
// whose search key (site/search-key.ts) starts with the query's, read through
// the index of migrations/20261114_120000_model_search.ts. It takes the
// database as an argument, with no Payload config or Next.js import, so the
// database test runs the same query and checks its plan.
import { type PostgresAdapter, sql } from "@payloadcms/db-postgres";
import type { ModelKey } from "./addresses.ts";
import { MODEL_SEARCH_KEY } from "./search-key.ts";

export { MODEL_RESULTS } from "./search-key.ts";

/** A model a search found. */
export type ModelMatch = ModelKey & {
  brand: string;
  /** Whether its search key equals the query's, not only starts with it. */
  exact: boolean;
};

type Database = PostgresAdapter["drizzle"];

/**
 * The query for the models whose search key starts with `key`, in search key
 * order, then by id: at most `limit`. A key equal to the query sorts before
 * every longer one, so exact matches come first. The ORDER BY uses the
 * operator class's own ordering (~<~), so the index both finds and sorts the
 * rows, and a short prefix reads `limit` rows rather than every match. `key`
 * must come from searchKey: ASCII letters and digits only, so it carries no
 * LIKE wildcard.
 */
export function modelSearchQuery(key: string, limit: number) {
  const expression = sql.raw(MODEL_SEARCH_KEY);
  return sql`
    SELECT m.reference, b.name AS brand, b.slug AS brand_slug,
           ${expression} = ${key} AS exact
      FROM appliance_models m
      JOIN brands b ON b.id = m.brand_id
     WHERE ${expression} LIKE ${`${key}%`}
     ORDER BY ${expression} USING ~<~, m.id
     LIMIT ${limit}
  `;
}

/** The models modelSearchQuery finds. */
export async function findModels(
  db: Database,
  key: string,
  limit: number,
): Promise<ModelMatch[]> {
  if (!/^[A-Z0-9]+$/.test(key)) throw new Error(`Not a search key: "${key}".`);
  const { rows } = await db.execute<{
    reference: string;
    brand: string;
    brand_slug: string;
    exact: boolean;
  }>(modelSearchQuery(key, limit));
  return rows.map((row) => ({
    reference: row.reference,
    brandSlug: row.brand_slug,
    brand: row.brand,
    exact: row.exact,
  }));
}
