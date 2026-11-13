// Compatible models and their pages (docs/adr/0009-compatible-references.md,
// docs/adr/0011-languages-and-seo.md, issue #79). The models and the
// compatibility rows live in the project's own tables, read here with SQL.
//
// The reference rows are one remote cache entry per product and rank range,
// shared by the ten languages: a model's address carries a translated section
// word, so the entry holds data only and the page, which is not cached,
// builds the links in its language (owner decision on issue #79).
import config from "@payload-config";
import { type PostgresAdapter, sql } from "@payloadcms/db-postgres";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";
import { type ApplianceType, applianceTypes } from "../catalog/generator.ts";
import type { Locale } from "../cms/locales.ts";
import { type ModelKey, modelPath, modelPaths } from "./addresses.ts";
import {
  computedAt,
  formatPrice,
  type ProductRoute,
  readProduct,
} from "./product.tsx";
import {
  brandSlugTag,
  brandTag,
  CATALOG_TAG,
  categoryTag,
  modelTag,
  productTags,
  referenceListTags,
} from "./tags.ts";

async function database() {
  const payload = await getPayload({ config });
  return (payload.db as unknown as PostgresAdapter).drizzle;
}

/** One compatible model, the same in every language. */
export type ReferenceRow = {
  id: number;
  brandId: number;
  brand: string;
  brandSlug: string;
  reference: string;
};

/** A range of a product's references. */
export type ReferenceRows = {
  rows: ReferenceRow[];
  computedAt: string;
};

/**
 * How many references a product has. Ranks run from 1 with no gap, as the
 * generator writes them (ADR 0009), so this is the highest rank, read from
 * the end of the compatibility key (product, rank). Pages check it before
 * reading a range, so a page number past the end never creates an entry.
 */
export async function getReferenceTotal(productId: number): Promise<number> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(productTags(productId).references, CATALOG_TAG);

  const drizzle = await database();
  const { rows } = await drizzle.execute<{ total: number | null }>(sql`
    SELECT max(rank) AS total FROM compatibility WHERE product_id = ${productId}
  `);
  return rows[0]?.total ?? 0;
}

/**
 * A product's references from rank `first` to rank `last`, most popular
 * first, read on the compatibility key (product, rank), with no OFFSET
 * (ADR 0007, ADR 0009).
 */
export async function getReferenceRows(
  productId: number,
  first: number,
  last: number,
): Promise<ReferenceRows> {
  "use cache: remote";
  cacheLife("max");

  const drizzle = await database();
  const { rows } = await drizzle.execute<{
    id: number;
    brand_id: number;
    brand: string;
    brand_slug: string;
    reference: string;
  }>(sql`
    SELECT m.id, m.brand_id, b.name AS brand, b.slug AS brand_slug, m.reference
      FROM compatibility c
      JOIN appliance_models m ON m.id = c.model_id
      JOIN brands b ON b.id = m.brand_id
     WHERE c.product_id = ${productId}
       AND c.rank BETWEEN ${first} AND ${last}
     ORDER BY c.rank
  `);
  cacheTag(
    ...referenceListTags(
      productId,
      rows.map((row) => row.brand_id),
    ),
  );
  return {
    rows: rows.map((row) => ({
      id: row.id,
      brandId: row.brand_id,
      brand: row.brand,
      brandSlug: row.brand_slug,
      reference: row.reference,
    })),
    computedAt: computedAt(),
  };
}

/**
 * A list of references as plain links to the model pages in one language,
 * so it runs no code in the browser (ADR 0009). It is not cached: it only
 * maps the shared rows to this language's addresses.
 */
export function ReferenceList({
  references,
  locale,
}: {
  references: ReferenceRows;
  locale: Locale;
}) {
  return (
    <ul data-computed-at={references.computedAt}>
      {references.rows.map((row) => (
        <li key={row.id}>
          <a
            href={modelPath(locale, {
              brandSlug: row.brandSlug,
              reference: row.reference,
            })}
          >
            {row.brand} {row.reference}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** A model found by its key: its heading and its address in each language. */
export type ModelRoute = {
  id: number;
  brand: string;
  reference: string;
  applianceType: ApplianceType;
  paths: Record<Locale, string>;
  computedAt: string;
};

const isApplianceType = (value: string): value is ApplianceType =>
  (applianceTypes as readonly string[]).includes(value);

/**
 * The model with this brand slug and reference, or null, which the page
 * answers with a 404. One entry per key, shared by the ten languages. It is
 * refreshed by the brand slug's tag (a brand that takes or leaves the slug),
 * the brand's tag (its name) and the model's tag; models themselves change
 * only with a new generation, which the catalog tag covers.
 */
export async function getModelRoute(key: ModelKey): Promise<ModelRoute | null> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(brandSlugTag(key.brandSlug), CATALOG_TAG);

  const drizzle = await database();
  // The brand by its unique slug, then the model by the unique pair (brand,
  // reference).
  const { rows } = await drizzle.execute<{
    id: number;
    reference: string;
    appliance_type: string;
    brand_id: number;
    brand: string;
    brand_slug: string;
  }>(sql`
    SELECT m.id, m.reference, m.appliance_type,
           b.id AS brand_id, b.name AS brand, b.slug AS brand_slug
      FROM appliance_models m
      JOIN brands b ON b.id = m.brand_id
     WHERE b.slug = ${key.brandSlug}
       AND m.reference = ${key.reference}
  `);
  const model = rows[0];
  if (!model) return null;
  if (!isApplianceType(model.appliance_type))
    throw new Error(
      `Model ${model.id}: unknown appliance type "${model.appliance_type}".`,
    );
  cacheTag(modelTag(model.id), brandTag(model.brand_id));
  return {
    id: model.id,
    brand: model.brand,
    reference: model.reference,
    applianceType: model.appliance_type,
    paths: modelPaths({
      brandSlug: model.brand_slug,
      reference: model.reference,
    }),
    computedAt: computedAt(),
  };
}

/**
 * A model's compatible products in one language, each with its name, its
 * price and a link to its address, read through the compatibility index
 * (model, product). Tagged with the model, and with each product's price and
 * description and its category and brand, which its name and address come
 * from.
 */
export async function ModelProducts({
  id,
  locale,
}: {
  id: number;
  locale: Locale;
}) {
  "use cache: remote";
  cacheLife("max");
  cacheTag(modelTag(id), CATALOG_TAG);

  const drizzle = await database();
  const { rows } = await drizzle.execute<{ product_id: number }>(sql`
    SELECT product_id FROM compatibility
     WHERE model_id = ${id}
     ORDER BY product_id
  `);
  const ids = rows.map((row) => row.product_id);
  const payload = await getPayload({ config });
  const { docs } =
    ids.length === 0
      ? { docs: [] }
      : await payload.find({
          collection: "products",
          where: { id: { in: ids } },
          locale: "all",
          depth: 1,
          sort: "id",
          pagination: false,
        });

  const products: { route: ProductRoute; priceCents: number }[] = [];
  for (const doc of docs) {
    const read = readProduct(doc);
    const tags = productTags(doc.id);
    cacheTag(
      tags.price,
      tags.description,
      categoryTag(read.categoryId),
      brandTag(read.brandId),
    );
    products.push({ route: read.route, priceCents: doc.priceCents });
  }

  return (
    <ul data-computed-at={computedAt()}>
      {products.map(({ route, priceCents }) => (
        <li key={route.id}>
          <a href={route.paths[locale]}>{route.names[locale]}</a>{" "}
          <span>{formatPrice(priceCents, locale)}</span>
        </li>
      ))}
    </ul>
  );
}
