// "Other parts for the same appliances" (issue #161): the products that share
// the most compatible models with each product, precomputed after the
// compatibility rows are loaded. The generator runs these statements in its
// load; migrations/20261116_120000_related_products.ts holds its own copy,
// frozen, for databases loaded before this issue, and
// tests/related-db.test.ts checks the two give the same rows.
//
// The generator draws each product's models at random among 1,000,000, so two
// products rarely share one: on the full catalog, 28% shared none (measured on
// Neon's dev branch, 2026-11-16). The first statement makes neighbours share:
// each product, the million-model one aside, also fits the most popular model
// of the next two products in its category, by id, so it shares a model with
// up to four of them (owner request, 2026-11-16).
import { MILLION_PRODUCT_ID } from "./generator.ts";

/** The most related products a product page shows. */
export const RELATED_PRODUCTS = 8;

/** How many following products of its category each product shares a model with. */
export const SHARED_NEIGHBOURS = 2;

/**
 * Adds the neighbours' most popular models to each product, after its own
 * ranks, skipping a model it already fits. Running it again adds nothing:
 * the neighbours' first ranks do not change, and each pair is already there.
 */
export const shareNeighbourModels = `
  WITH top AS (
    SELECT c.product_id, c.model_id, p.category_id
      FROM compatibility c
      JOIN products p ON p.id = c.product_id
     WHERE c.rank = 1 AND c.product_id <> ${MILLION_PRODUCT_ID}
  ),
  following AS (
    SELECT product_id,
           ${Array.from(
             { length: SHARED_NEIGHBOURS },
             (_, i) => `lead(model_id, ${i + 1}) OVER w AS m${i + 1}`,
           ).join(", ")}
      FROM top
    WINDOW w AS (PARTITION BY category_id ORDER BY product_id)
  ),
  added AS (
    SELECT f.product_id, n.ord, n.model_id
      FROM following f
     CROSS JOIN LATERAL (VALUES ${Array.from(
       { length: SHARED_NEIGHBOURS },
       (_, i) => `(${i + 1}, f.m${i + 1})`,
     ).join(", ")}) AS n (ord, model_id)
     WHERE n.model_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM compatibility c
          WHERE c.model_id = n.model_id AND c.product_id = f.product_id)
  )
  INSERT INTO compatibility (product_id, rank, model_id)
  SELECT a.product_id,
         last.rank + row_number() OVER (PARTITION BY a.product_id ORDER BY a.ord),
         a.model_id
    FROM added a
   CROSS JOIN LATERAL (
     SELECT max(rank) AS rank FROM compatibility WHERE product_id = a.product_id
   ) last
`;

/**
 * Rebuilds the related products from the compatibility rows: for each
 * product, the RELATED_PRODUCTS others that share the most models with it,
 * then by id. The million-model product shares every model, so it is never
 * listed as related, but its own page lists the products with the most models.
 */
export const fillRelatedProducts = [
  "DELETE FROM related_products",
  `INSERT INTO related_products (product_id, rank, related_id)
   SELECT product_id, rank, related_id FROM (
     SELECT a.product_id, b.product_id AS related_id,
            row_number() OVER (
              PARTITION BY a.product_id ORDER BY count(*) DESC, b.product_id
            ) AS rank
       FROM compatibility a
       JOIN compatibility b
         ON b.model_id = a.model_id AND b.product_id <> a.product_id
      WHERE b.product_id <> ${MILLION_PRODUCT_ID}
      GROUP BY a.product_id, b.product_id
   ) s
   WHERE rank <= ${RELATED_PRODUCTS}`,
];

type Client = {
  query(text: string): Promise<{ rowCount: number | null }>;
};

/** Runs both steps on a loaded catalog, inside the caller's transaction. */
export async function relateProducts(
  client: Client,
): Promise<{ shared: number; related: number }> {
  const shared = (await client.query(shareNeighbourModels)).rowCount ?? 0;
  let related = 0;
  for (const statement of fillRelatedProducts)
    related = (await client.query(statement)).rowCount ?? 0;
  return { shared, related };
}
