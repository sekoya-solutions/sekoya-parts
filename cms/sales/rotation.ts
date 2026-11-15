// The demo's sale rotation (issue #151, owner decisions 2026-11-15): about 2%
// of products on sale, at 10% to 30% off, each sale lasting 7 to 28 days. The
// catalog load starts the first sales at once, spread over their lengths so
// they end on different days; the daily job then adds new ones, each starting
// at the next 00:00 UTC, and refreshes their prices at a pace under Vercel
// Hobby's rate limit (ADR 0008). Ended sales are left as they are: their
// dates are past, so no page shows them.
import { categoryPricesTag, productTags } from "../../site/tags.ts";

/** The share of products on sale at any time. */
export const SALE_SHARE = 0.02;

/**
 * The most sales one daily run adds: 300 refreshes take about 30 seconds at
 * 10 a second. On a catalog that has none yet, such as one loaded before the
 * rotation existed, the share is then reached over about a week rather than
 * in one run of 2,000 refreshes that could outlast the function.
 */
export const MAX_NEW_SALES_PER_RUN = 300;

/** Refresh calls per second: Hobby allows 50 per team, shared by its projects. */
export const REFRESHES_PER_SECOND = 10;

/** A client that runs one parameterized query, such as pg's Client or Pool. */
export type Query = {
  query<R>(text: string, values: unknown[]): Promise<{ rows: R[] }>;
};

export type RotatedSale = { id: number; categoryId: number };

/**
 * Puts products without a running or coming sale on sale until SALE_SHARE of
 * the catalog has one, and returns them. A product an editor gave a sale that
 * has not ended is never touched. The sale price is the regular price less
 * the discount, rounded down to 10 cents, so it is always below it.
 *
 * At most `limit` sales are added. `startsAt` is when the new sales start; with `spread`, each starts that
 * many whole days earlier, at random within its length, so a fresh catalog
 * has sales that end on different days, all running at `startsAt`.
 */
export async function rotateSales(
  db: Query,
  {
    now,
    startsAt,
    spread,
    limit,
  }: { now: Date; startsAt: Date; spread: boolean; limit: number },
): Promise<RotatedSale[]> {
  const { rows } = await db.query<{ id: number; category_id: number }>(
    `WITH target AS (
       SELECT ceil(count(*) * $3::numeric) AS n FROM products
     ), running AS (
       SELECT count(*) AS n FROM products WHERE sale_ends_at > $1
     ), chosen AS (
       -- The products first, then their draws: with the draws in the same
       -- SELECT, PostgreSQL matches ORDER BY random() to the identical
       -- random() column and sorts by it, which picked only the smallest
       -- offsets and gave every sale one length (checked on PostgreSQL 18).
       SELECT id FROM products
        WHERE sale_ends_at IS NULL OR sale_ends_at <= $1
        ORDER BY random()
        LIMIT LEAST($5, GREATEST(0, (SELECT n FROM target) - (SELECT n FROM running)))
     ), drawn AS (
       SELECT id, (2 + floor(random() * 5)) * 0.05 AS discount,
              7 + floor(random() * 22) AS days, random() AS offset_draw
         FROM chosen
     ), picked AS (
       SELECT id, discount, days,
              $2::timestamptz - CASE WHEN $4 THEN floor(offset_draw * days)
                                     ELSE 0 END * interval '1 day' AS starts
         FROM drawn
     )
     UPDATE products p
        SET sale_price_cents = floor(p.price_cents * (1 - picked.discount) / 10) * 10,
            sale_starts_at = picked.starts,
            sale_ends_at = picked.starts + picked.days * interval '1 day',
            updated_at = $1
       FROM picked
      WHERE p.id = picked.id
     RETURNING p.id, p.category_id`,
    [now, startsAt, SALE_SHARE, spread, limit],
  );
  return rows.map((row) => ({ id: row.id, categoryId: row.category_id }));
}

/**
 * The tags new sales refresh: each product's price, which every part showing
 * it carries, then each category's price order, once.
 */
export const rotationTags = (sales: RotatedSale[]): string[] => [
  ...sales.map((sale) => productTags(sale.id).price),
  ...new Set(sales.map((sale) => categoryPricesTag(sale.categoryId))),
];

/**
 * Calls `refresh` for each tag, at most `perSecond` a second. A rate limit
 * needs time between calls, not a signal to wait for, so this waits a fixed
 * interval; a refresh over Hobby's limit is only logged by Vercel, which
 * would hide a new sale on that product's pages until its next refresh.
 */
export async function paced(
  tags: string[],
  refresh: (tag: string) => void,
  perSecond = REFRESHES_PER_SECOND,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<number> {
  const interval = 1000 / perSecond;
  for (const [index, tag] of tags.entries()) {
    if (index > 0) await wait(interval);
    refresh(tag);
  }
  return tags.length;
}
