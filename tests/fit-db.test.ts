// "Does it fit my appliance?" against the database (issue #161): yes for a
// compatible model, no for another, the million-model product included, and
// PostgreSQL reads the answer through the search key index and the
// compatibility key (model, product), not the product's million rows. Needs a
// database migrated and loaded by `npm run generate`.
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import { MILLION_PRODUCT_ID, productReference } from "../catalog/generator.ts";
import config from "../payload.config.ts";
import { checkFit, fitQuery } from "../site/fit.ts";
import { searchKey } from "../site/search-key.ts";

for (const name of ["DATABASE_URL", "PAYLOAD_SECRET"]) {
  if (!process.env[name]) throw new Error(`${name} must be set for this test.`);
}

let db: PostgresAdapter["drizzle"];
/** An ordinary product, a model it fits and one it does not. */
let part: string;
let fitting: { reference: string; brand: string };
let other: { reference: string; brand: string };

beforeAll(async () => {
  const payload = await getPayload({ config });
  db = (payload.db as unknown as PostgresAdapter).drizzle;
  const { rows } = await db.execute<{
    reference: string;
    model: string;
    brand: string;
  }>(sql`
    SELECT p.reference, m.reference AS model, b.name AS brand
      FROM compatibility c
      JOIN products p ON p.id = c.product_id
      JOIN appliance_models m ON m.id = c.model_id
      JOIN brands b ON b.id = m.brand_id
     WHERE c.product_id = 2 AND c.rank = 1
  `);
  const row = rows[0];
  if (!row) throw new Error("Product 2 has no model: load the catalog.");
  part = row.reference;
  fitting = { reference: row.model, brand: row.brand };
  const { rows: others } = await db.execute<{
    reference: string;
    brand: string;
  }>(sql`
    SELECT m.reference, b.name AS brand FROM appliance_models m
      JOIN brands b ON b.id = m.brand_id
     WHERE NOT EXISTS (SELECT 1 FROM compatibility c
                        WHERE c.model_id = m.id AND c.product_id = 2)
     ORDER BY m.id LIMIT 1
  `);
  other = others[0] as typeof other;
});

describe("fit check", () => {
  it("says yes for a compatible model, typed in any case and spacing", async () => {
    for (const typed of [
      fitting.reference,
      fitting.reference.toLowerCase().replace("-", " "),
      ` ${fitting.reference} `,
    ]) {
      const answer = await checkFit(db, part, typed);
      expect(answer).toEqual({
        status: "checked",
        models: [expect.objectContaining({ ...fitting, fits: true })],
      });
    }
  });

  it("says no for a model the product does not fit", async () => {
    expect(await checkFit(db, part, other.reference)).toEqual({
      status: "checked",
      models: [expect.objectContaining({ ...other, fits: false })],
    });
  });

  it("says yes for any model on the million-model product", async () => {
    const answer = await checkFit(
      db,
      productReference(MILLION_PRODUCT_ID),
      other.reference,
    );
    expect(answer).toMatchObject({
      status: "checked",
      models: [{ reference: other.reference, fits: true }],
    });
  });

  it("finds no model for an unknown reference, and no product for an unknown part", async () => {
    expect(await checkFit(db, part, "ZZZZ9999-99")).toEqual({
      status: "checked",
      models: [],
    });
    expect(await checkFit(db, "ZZ999999", fitting.reference)).toEqual({
      status: "no-product",
    });
  });

  it("reads the search key index and the compatibility key, not the product's rows", async () => {
    const key = searchKey(other.reference) as string;
    const { rows } = await db.execute<{ "QUERY PLAN": string }>(
      sql`EXPLAIN ${fitQuery(productReference(MILLION_PRODUCT_ID), key)}`,
    );
    const plan = rows.map((row) => row["QUERY PLAN"]).join("\n");
    expect(plan).toContain("appliance_models_search_key_idx");
    expect(plan).toContain("compatibility_model_product_unique");
    expect(plan).not.toMatch(/Seq Scan on compatibility/);
  });
});
