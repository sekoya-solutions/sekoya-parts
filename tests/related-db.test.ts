// The related products (issue #161) against the database: the neighbour
// models, the related rows, and the migration's frozen copy of the
// generator's statements, which must give the same rows. Writes run in a
// transaction that is rolled back. Needs a database migrated and loaded by
// `npm run generate`.
import type { MigrateUpArgs, PostgresAdapter } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import { MILLION_PRODUCT_ID } from "../catalog/generator.ts";
import { RELATED_PRODUCTS, SHARED_NEIGHBOURS } from "../catalog/related.ts";
import { up } from "../migrations/20261116_120000_related_products.ts";
import config from "../payload.config.ts";

for (const name of ["DATABASE_URL", "PAYLOAD_SECRET"]) {
  if (!process.env[name]) throw new Error(`${name} must be set for this test.`);
}

type Database = PostgresAdapter["drizzle"];
let db: Database;

beforeAll(async () => {
  const payload = await getPayload({ config });
  db = (payload.db as unknown as PostgresAdapter).drizzle;
});

const count = async (database: Database, query: ReturnType<typeof sql>) => {
  const { rows } = await database.execute<{ n: string }>(query);
  return Number(rows[0]?.n);
};

/** Rolls back whatever `work` wrote. */
class Rollback extends Error {}
async function inRollback(work: (tx: Database) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await work(tx as unknown as Database);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

describe("related products", () => {
  it("lists for most products others that share a model with it", async () => {
    const products = await count(
      db,
      sql`SELECT count(*) AS n FROM products WHERE id <> ${MILLION_PRODUCT_ID}`,
    );
    const related = await count(
      db,
      sql`SELECT count(DISTINCT product_id) AS n FROM related_products`,
    );
    // Products at the end of a category may share with fewer neighbours;
    // with two following ones, nearly every product shares with someone.
    expect(related).toBeGreaterThan(products * 0.95);
  });

  it("lists only products sharing a model, never itself or product 1", async () => {
    expect(
      await count(
        db,
        sql`SELECT count(*) AS n FROM related_products r
             WHERE r.related_id = r.product_id
                OR r.related_id = ${MILLION_PRODUCT_ID}
                OR NOT EXISTS (
                  SELECT 1 FROM compatibility a
                    JOIN compatibility b ON b.model_id = a.model_id
                   WHERE a.product_id = r.product_id
                     AND b.product_id = r.related_id)`,
      ),
    ).toBe(0);
  });

  it("ranks from 1 with no gap, at most eight, most shared models first", async () => {
    expect(
      await count(
        db,
        sql`SELECT count(*) AS n FROM (
              SELECT product_id, max(rank) AS top, count(*) AS rows
                FROM related_products GROUP BY product_id) s
             WHERE top <> rows OR top > ${RELATED_PRODUCTS}`,
      ),
    ).toBe(0);
    const { rows } = await db.execute<{ product_id: number; shared: string }>(
      sql`SELECT r.product_id, count(*) AS shared
            FROM related_products r
            JOIN compatibility a ON a.product_id = r.product_id
            JOIN compatibility b ON b.model_id = a.model_id AND b.product_id = r.related_id
           WHERE r.product_id IN (SELECT product_id FROM related_products ORDER BY product_id LIMIT 50)
           GROUP BY r.product_id, r.rank
           ORDER BY r.product_id, r.rank`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const [i, row] of rows.entries()) {
      const before = rows[i - 1];
      if (before?.product_id === row.product_id)
        expect(Number(row.shared)).toBeLessThanOrEqual(Number(before.shared));
    }
  });

  it("gives each product the most popular model of the next two in its category", async () => {
    expect(SHARED_NEIGHBOURS).toBe(2);
    expect(
      await count(
        db,
        sql`WITH top AS (
              SELECT c.product_id, c.model_id, p.category_id
                FROM compatibility c JOIN products p ON p.id = c.product_id
               WHERE c.rank = 1 AND c.product_id <> ${MILLION_PRODUCT_ID}),
            following AS (
              SELECT product_id, lead(model_id, 1) OVER w AS m1, lead(model_id, 2) OVER w AS m2
                FROM top WINDOW w AS (PARTITION BY category_id ORDER BY product_id))
            SELECT count(*) AS n FROM following f, LATERAL (VALUES (f.m1), (f.m2)) v (model_id)
             WHERE v.model_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM compatibility c
                                WHERE c.product_id = f.product_id AND c.model_id = v.model_id)`,
      ),
    ).toBe(0);
  });

  it("keeps each product's compatibility ranks contiguous", async () => {
    expect(
      await count(
        db,
        sql`SELECT count(*) AS n FROM (
              SELECT product_id FROM compatibility GROUP BY product_id
              HAVING max(rank) <> count(*)) s`,
      ),
    ).toBe(0);
  });

  it("gets the same rows from the migration, which adds no model twice", async () => {
    await inRollback(async (tx) => {
      const snapshot = sql`SELECT product_id, rank, related_id FROM related_products ORDER BY 1, 2`;
      const before = (await tx.execute(snapshot)).rows;
      const compatibility = sql`SELECT count(*) AS n FROM compatibility`;
      const rowsBefore = await count(tx, compatibility);
      await tx.execute(sql`DROP TABLE related_products`);
      await up({ db: tx } as unknown as MigrateUpArgs);
      expect(await count(tx, compatibility)).toBe(rowsBefore);
      expect((await tx.execute(snapshot)).rows).toEqual(before);
    });
  });
});
