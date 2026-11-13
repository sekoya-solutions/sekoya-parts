// Category pages and the home page's category list (issue #81), built from
// cached reads in the manner of docs/adr/0008-caching-and-partial-refresh.md.
// Every entry is shared by the ten languages: it holds names and addresses in
// each language, and the page, which is not cached, picks its own.
import config from "@payload-config";
import { type PostgresAdapter, sql } from "@payloadcms/db-postgres";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";
import type { Locale } from "../cms/locales.ts";
import {
  type CategoryNaming,
  categoryPath,
  PRODUCTS_PER_CATEGORY_PAGE,
  perLocale,
} from "./addresses.ts";
import { computedAt, type ProductRoute, readProduct } from "./product.tsx";
import {
  CATALOG_TAG,
  CATEGORIES_TAG,
  categoryListingTag,
  categoryPageTags,
  categoryTag,
} from "./tags.ts";

async function database() {
  const payload = await getPayload({ config });
  return (payload.db as unknown as PostgresAdapter).drizzle;
}

type AllLocales = Record<string, string | null | undefined>;
const allLocales = (value: unknown): AllLocales =>
  value !== null && typeof value === "object" ? (value as AllLocales) : {};

function inLocale(values: AllLocales, locale: Locale, what: string): string {
  const value = values[locale] || values.fr;
  if (!value) throw new Error(`No ${what} in ${locale} or in French.`);
  return value;
}

/**
 * Every category, by id, with its names and slugs in each language. One entry,
 * refreshed when a category is saved, created or deleted.
 */
export async function getCategories(): Promise<CategoryNaming[]> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(CATEGORIES_TAG, CATALOG_TAG);

  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "categories",
    locale: "all",
    depth: 0,
    sort: "id",
    pagination: false,
  });
  cacheTag(...docs.map((doc) => categoryTag(doc.id)));
  return docs.map((doc) => {
    const names = allLocales(doc.name);
    const slugs = allLocales(doc.slug);
    return {
      id: doc.id,
      names: perLocale((locale) => inLocale(names, locale, "category name")),
      slugs: perLocale((locale) => inLocale(slugs, locale, "category slug")),
    };
  });
}

/**
 * The number of products of each category, by category id. One entry, tagged
 * with every category's listing, which a product joining or leaving a
 * category refreshes; the categories are read here too, so a category with
 * no product yet still carries its tag.
 */
export async function getCategoryCounts(): Promise<Record<number, number>> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(CATEGORIES_TAG, CATALOG_TAG);

  const drizzle = await database();
  const { rows } = await drizzle.execute<{
    category_id: number;
    count: string;
  }>(sql`
    SELECT c.id AS category_id, count(p.id) AS count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
     GROUP BY c.id
  `);
  cacheTag(...rows.map((row) => categoryListingTag(row.category_id)));
  return Object.fromEntries(
    rows.map((row) => [row.category_id, Number(row.count)]),
  );
}

/** One product on a category page, in every language. */
export type CategoryRow = { route: ProductRoute; priceCents: number };

/** A page of a category's products. */
export type CategoryRows = { rows: CategoryRow[]; computedAt: string };

/**
 * Page `page` of a category's products, 48 of them in reference order, read
 * from the index on (category, reference) (owner decision on issue #81). A
 * category holds a few thousand products, so the OFFSET skips at most that
 * many index entries. Tagged with the listing, the category, the catalog, and
 * each shown product's price and brand, under Next.js's limit of 128 tags.
 */
export async function getCategoryRows(
  categoryId: number,
  page: number,
): Promise<CategoryRows> {
  "use cache: remote";
  cacheLife("max");

  const drizzle = await database();
  const { rows } = await drizzle.execute<{ id: number }>(sql`
    SELECT id FROM products
     WHERE category_id = ${categoryId}
     ORDER BY reference
     LIMIT ${PRODUCTS_PER_CATEGORY_PAGE}
    OFFSET ${(page - 1) * PRODUCTS_PER_CATEGORY_PAGE}
  `);
  const ids = rows.map((row) => row.id);
  const payload = await getPayload({ config });
  const { docs } =
    ids.length === 0
      ? { docs: [] }
      : await payload.find({
          collection: "products",
          where: { id: { in: ids } },
          locale: "all",
          depth: 1,
          sort: "reference",
          pagination: false,
        });

  const result: CategoryRow[] = [];
  const brandIds: number[] = [];
  for (const doc of docs) {
    const read = readProduct(doc);
    brandIds.push(read.brandId);
    result.push({ route: read.route, priceCents: doc.priceCents });
  }
  cacheTag(
    ...categoryPageTags(
      categoryId,
      docs.map((doc) => doc.id),
      brandIds,
    ),
  );
  return { rows: result, computedAt: computedAt() };
}

/** A category page's address in each language. */
export const categoryPaths = (category: CategoryNaming, page: number) =>
  perLocale((locale) => categoryPath(locale, category.slugs[locale], page));
