// Model search against the database (docs/adr/0010-search.md, issue #113):
// the query finds models by prefix and by exact search key, and PostgreSQL
// reads it through the search key index. Writes run in a transaction that is
// rolled back. Needs a database migrated and loaded by `npm run generate`.
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config.ts";
import { findModels, modelSearchQuery } from "../site/model-search.ts";
import { searchKey } from "../site/search-key.ts";

for (const name of ["DATABASE_URL", "PAYLOAD_SECRET"]) {
  if (!process.env[name]) throw new Error(`${name} must be set for this test.`);
}

const INDEX = "appliance_models_search_key_idx";

let db: PostgresAdapter["drizzle"];
let model: { id: number; reference: string; brand_id: number };

beforeAll(async () => {
  const payload = await getPayload({ config });
  db = (payload.db as unknown as PostgresAdapter).drizzle;
  const { rows } = await db.execute<typeof model>(
    sql`SELECT id, reference, brand_id FROM appliance_models WHERE id = 1`,
  );
  model = rows[0] as typeof model;
  expect(model).toBeDefined();
});

/** The search key of a reference, which searchKey must accept. */
const keyOf = (query: string) => {
  const key = searchKey(query);
  if (key === null) throw new Error(`No search key for "${query}".`);
  return key;
};

describe("model search", () => {
  it("finds a model by its reference in any case, with or without its dash", async () => {
    for (const query of [
      model.reference,
      model.reference.toLowerCase(),
      model.reference.replace("-", " "),
    ]) {
      const found = await findModels(db, keyOf(query), 21);
      expect(found.filter((row) => row.exact)).toHaveLength(1);
      expect(found[0]).toMatchObject({
        reference: model.reference,
        exact: true,
      });
    }
  });

  it("lists models by prefix, at most the limit, in search key order", async () => {
    const prefix = keyOf(model.reference.slice(0, 2));
    const found = await findModels(db, prefix, 21);
    expect(found).toHaveLength(21);
    const keys = found.map((row) => keyOf(row.reference));
    for (const key of keys) expect(key.startsWith(prefix)).toBe(true);
    // ~<~ compares bytes, the order of JavaScript's < on ASCII strings.
    expect([...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(
      keys,
    );
    expect(found.some((row) => row.exact)).toBe(false);
  });

  it("finds nothing for a key no reference starts with", async () => {
    expect(await findModels(db, "ZZZZZZZZZZZZ", 21)).toEqual([]);
  });

  it("refuses a key that is not one searchKey gives", async () => {
    await expect(findModels(db, "AB%", 21)).rejects.toThrow("Not a search key");
  });

  it("finds every model of several brands that share a reference", async () => {
    const rollback = new Error("rollback");
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO appliance_models (id, brand_id, reference, appliance_type)
          SELECT -1, id, ${model.reference.replace("-", "")}, 'oven'
            FROM brands WHERE id <> ${model.brand_id} ORDER BY id LIMIT 1
        `);
        const found = await findModels(
          tx as unknown as PostgresAdapter["drizzle"],
          keyOf(model.reference),
          21,
        );
        expect(found.filter((row) => row.exact)).toHaveLength(2);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it("reads the search key index for a prefix and for an exact key", async () => {
    for (const key of [
      keyOf(model.reference.slice(0, 1)),
      keyOf(model.reference),
    ]) {
      const { rows } = await db.execute<{ "QUERY PLAN": unknown }>(
        sql`EXPLAIN (FORMAT JSON) ${modelSearchQuery(key, 21)}`,
      );
      const plan = JSON.stringify(rows[0]?.["QUERY PLAN"]);
      expect(plan, key).toContain(`"Index Name":"${INDEX}"`);
      // The index gives the order, so no full sort of every match.
      expect(plan, key).not.toContain(`"Node Type":"Sort"`);
    }
  });
});
