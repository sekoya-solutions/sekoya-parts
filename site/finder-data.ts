// What the home page's part finder (site/home-finder.tsx, issue #196) reads
// from the catalog: each brand's appliance types, shipped in the home page,
// and a brand and type's most popular models, which its model field lists
// before anything is typed (app/(site)/api/models/route.ts). Both read the
// index on (brand, appliance type) of migrations/20261115_233000_model_pairs.ts.
import { sql } from "@payloadcms/db-postgres";
import { cacheLife, cacheTag } from "next/cache";
import { applianceTypes } from "../catalog/generator.ts";
import { POPULAR_MODELS } from "./addresses.ts";
import { database } from "./categories.tsx";
import { BRANDS_TAG, brandTag, CATALOG_TAG } from "./tags.ts";

/**
 * The appliance types each brand has models of, by brand id, in the
 * generator's order. One entry: models change only with a new generation.
 */
export async function getTypesByBrand(): Promise<Record<number, string[]>> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(BRANDS_TAG, CATALOG_TAG);

  const drizzle = await database();
  const { rows } = await drizzle.execute<{ brand: number; type: string }>(sql`
    SELECT DISTINCT brand_id AS brand, appliance_type AS type
      FROM appliance_models
  `);
  const order = applianceTypes as readonly string[];
  const types: Record<number, string[]> = {};
  for (const { brand, type } of rows) {
    const list = types[Number(brand)] ?? [];
    list.push(type);
    types[Number(brand)] = list;
  }
  for (const list of Object.values(types))
    list.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return types;
}

/**
 * A brand and type's most popular models: those compatible with the most
 * parts, then by reference, read through the index on (brand, type) and, for
 * each model, the compatibility index on (model, product).
 */
export async function getPopularModels(
  brandId: number,
  type: string,
): Promise<string[]> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(brandTag(brandId), CATALOG_TAG);

  const drizzle = await database();
  const { rows } = await drizzle.execute<{ reference: string }>(sql`
    SELECT m.reference
      FROM appliance_models m
      LEFT JOIN compatibility c ON c.model_id = m.id
     WHERE m.brand_id = ${brandId} AND m.appliance_type = ${type}
     GROUP BY m.id, m.reference
     ORDER BY count(c.product_id) DESC, m.reference
     LIMIT ${POPULAR_MODELS}
  `);
  return rows.map((row) => row.reference);
}
