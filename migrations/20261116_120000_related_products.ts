// "Other parts for the same appliances" (issue #161): the related-products
// table, then, on a database that already holds the catalog, the neighbour
// models and the related rows that catalog/related.ts adds in a load. The SQL
// is written here, not imported, so this migration stays the same whatever the
// generator becomes; tests/related-db.test.ts checks it gives the generator's
// rows. On an empty catalog, as in CI before the load, it only creates the
// table. Written by hand, like the other project tables' migrations.
import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Rank 1 shares the most models with the product. The key, product then
  // rank, serves the product page.
  await db.execute(sql`
    CREATE TABLE "related_products" (
      "product_id" integer NOT NULL REFERENCES "products" ("id") ON DELETE CASCADE,
      "rank" integer NOT NULL CHECK ("rank" >= 1),
      "related_id" integer NOT NULL REFERENCES "products" ("id") ON DELETE CASCADE,
      CONSTRAINT "related_products_pkey" PRIMARY KEY ("product_id", "rank"),
      CONSTRAINT "related_products_pair_unique" UNIQUE ("product_id", "related_id")
    );
  `);
  // Each product, product 1 aside, also fits the most popular model of the
  // next two products in its category, by id.
  await db.execute(sql`
    WITH top AS (
      SELECT c.product_id, c.model_id, p.category_id
        FROM compatibility c
        JOIN products p ON p.id = c.product_id
       WHERE c.rank = 1 AND c.product_id <> 1
    ),
    following AS (
      SELECT product_id,
             lead(model_id, 1) OVER w AS m1,
             lead(model_id, 2) OVER w AS m2
        FROM top
      WINDOW w AS (PARTITION BY category_id ORDER BY product_id)
    ),
    added AS (
      SELECT f.product_id, n.ord, n.model_id
        FROM following f
       CROSS JOIN LATERAL (VALUES (1, f.m1), (2, f.m2)) AS n (ord, model_id)
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
     ) last;
  `);
  // The 8 products sharing the most models with each, then by id; product 1
  // shares every model, so it is never listed.
  await db.execute(sql`
    INSERT INTO related_products (product_id, rank, related_id)
    SELECT product_id, rank, related_id FROM (
      SELECT a.product_id, b.product_id AS related_id,
             row_number() OVER (
               PARTITION BY a.product_id ORDER BY count(*) DESC, b.product_id
             ) AS rank
        FROM compatibility a
        JOIN compatibility b
          ON b.model_id = a.model_id AND b.product_id <> a.product_id
       WHERE b.product_id <> 1
       GROUP BY a.product_id, b.product_id
    ) s
    WHERE rank <= 8;
    ANALYZE compatibility, related_products;
  `);
}

// The neighbour models stay: nothing tells them from the generated ones
// afterwards, and a catalog load replaces them all.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "related_products";
  `);
}
