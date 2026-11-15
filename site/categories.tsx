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
  type ListingSort,
  PRODUCTS_PER_CATEGORY_PAGE,
  perLocale,
} from "./addresses.ts";
import { dateStrings, priceAt, type Sale } from "./merchandising.ts";
import { setPriceLifetime } from "./price-cache.ts";
import { computedAt, type ProductRoute, readProduct } from "./product.tsx";
import type { ShownPrice } from "./product-card.tsx";
import {
  CATALOG_TAG,
  CATEGORIES_TAG,
  categoryListingTag,
  categoryPageTags,
  categoryPricesTag,
  categoryTag,
} from "./tags.ts";

export async function database() {
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

/** One product on a category page, in every language, at its shown price. */
export type CategoryRow = { route: ProductRoute; price: ShownPrice };

/**
 * The number of products of each brand in a category, by brand id, for the
 * brand filter (issue #148). One entry per category, refreshed with its
 * listing, which a product joining, leaving or changing brand refreshes.
 */
export async function getCategoryBrandCounts(
  categoryId: number,
): Promise<Record<number, number>> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(categoryListingTag(categoryId), CATALOG_TAG);

  const drizzle = await database();
  const { rows } = await drizzle.execute<{ brand_id: number; count: string }>(
    sql`
    SELECT brand_id, count(*) AS count FROM products
     WHERE category_id = ${categoryId}
     GROUP BY brand_id
  `,
  );
  return Object.fromEntries(
    rows.map((row) => [row.brand_id, Number(row.count)]),
  );
}

/** A page of a category's products. */
export type CategoryRows = { rows: CategoryRow[]; computedAt: string };

/**
 * Page `page` of a category's products, 48 of them in reference order, read
 * from the index on (category, reference) (owner decision on issue #81), or
 * sorted by price or filtered by brand (issue #148). A category holds a few
 * thousand products, so the OFFSET skips at most that many index entries.
 * Tagged with the listing, the category, the catalog, and each shown
 * product's price and brand, under Next.js's limit of 128 tags; a price
 * order also with the category's prices, since any product's new price can
 * move it onto or off the page.
 */
export async function getCategoryRows(
  categoryId: number,
  page: number,
  sort: ListingSort = "reference",
  brandId: number | null = null,
): Promise<CategoryRows> {
  "use cache: remote";

  const drizzle = await database();
  const now = Date.now();
  const at = new Date(now).toISOString();
  // The price shown now: the sale's while it runs (issue #151). Ties fall
  // back to reference order, so every page has one order.
  const current = sql`CASE WHEN sale_starts_at <= ${at} AND ${at} < sale_ends_at
    THEN sale_price_cents ELSE price_cents END`;
  const order = {
    reference: sql`reference`,
    "price-asc": sql`${current}, reference`,
    "price-desc": sql`${current} DESC, reference`,
  }[sort];
  const brand = brandId === null ? sql`` : sql`AND brand_id = ${brandId}`;
  const { rows } = await drizzle.execute<{ id: number }>(sql`
    SELECT id FROM products
     WHERE category_id = ${categoryId} ${brand}
     ORDER BY ${order}
     LIMIT ${PRODUCTS_PER_CATEGORY_PAGE}
    OFFSET ${(page - 1) * PRODUCTS_PER_CATEGORY_PAGE}
  `);
  const cards = await readCards(
    rows.map((row) => row.id),
    now,
    sort,
  );
  cacheTag(
    ...categoryPageTags(
      categoryId,
      cards.rows.map((row) => row.route.id),
      cards.brandIds,
    ),
  );
  if (sort === "reference") setPriceLifetime(cards.sales, now);
  else {
    // A sale starting or ending anywhere in the category can move a product
    // onto or off a price-sorted page, so its next date counts too.
    cacheTag(categoryPricesTag(categoryId));
    const { rows: dates } = await drizzle.execute<Sale>(sql`
      SELECT sale_starts_at AS "saleStartsAt", sale_ends_at AS "saleEndsAt",
             sale_price_cents AS "salePriceCents"
        FROM products
       WHERE category_id = ${categoryId} AND sale_ends_at > ${at}
    `);
    setPriceLifetime(dates.map(dateStrings), now);
  }
  return { rows: cards.rows, computedAt: computedAt() };
}

/**
 * The product cards of a listing page, in reference order, with the brand
 * and category each card's name is built from, for the entry's tags. Called
 * inside the listing's cached read, never on its own.
 */
export async function readCards(
  ids: number[],
  now: number,
  sort: ListingSort = "reference",
): Promise<{
  rows: CategoryRow[];
  brandIds: number[];
  categoryIds: number[];
  /** Each card's sale, for the entry's lifetime (ADR 0008). */
  sales: Sale[];
}> {
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
  // Payload returns them by reference; the listing's own order is the ids'.
  if (sort !== "reference") {
    const place = new Map(ids.map((id, index) => [id, index]));
    docs.sort((a, b) => (place.get(a.id) ?? 0) - (place.get(b.id) ?? 0));
  }
  const rows: CategoryRow[] = [];
  const brandIds: number[] = [];
  const categoryIds: number[] = [];
  for (const doc of docs) {
    const read = readProduct(doc);
    brandIds.push(read.brandId);
    categoryIds.push(read.categoryId);
    rows.push({ route: read.route, price: priceAt(doc, now) });
  }
  return { rows, brandIds, categoryIds, sales: docs };
}

/** A category page's address in each language. */
export const categoryPaths = (category: CategoryNaming, page: number) =>
  perLocale((locale) => categoryPath(locale, category.slugs[locale], page));
