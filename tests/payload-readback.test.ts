// Reads a sample of the loaded catalog back through Payload's local API, to
// confirm that Payload sees the rows the generator wrote into its tables
// (docs/adr/0007-catalog-data-model.md). Needs a database loaded by
// `npm run generate`, with the same seed and scale (CATALOG_SEED and
// CATALOG_SCALE, by default 1 and small).

import { getPayload, type Payload } from "payload";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  brandRows,
  categories,
  compatibilityRows,
  isScaleName,
  MILLION_PRODUCT_ID,
  MODEL_COUNT,
  type ProductRow,
  productRows,
  scales,
} from "../catalog/generator.ts";
import config from "../payload.config.ts";

// No silent skip: without a database this test fails.
for (const name of ["DATABASE_URL", "PAYLOAD_SECRET"]) {
  if (!process.env[name]) throw new Error(`${name} must be set for this test.`);
}
const seed = Number(process.env.CATALOG_SEED ?? "1");
const scaleName = process.env.CATALOG_SCALE ?? "small";
if (!isScaleName(scaleName)) throw new Error(`Unknown scale "${scaleName}".`);
const scale = scales[scaleName];

let payload: Payload;
let client: pg.Client;

beforeAll(async () => {
  payload = await getPayload({ config });
  client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
});

afterAll(async () => {
  await client?.end();
  await payload?.destroy();
});

describe("Payload reads the generated catalog", () => {
  it("counts the generated categories, brands and products", async () => {
    expect((await payload.count({ collection: "categories" })).totalDocs).toBe(
      categories().length,
    );
    expect((await payload.count({ collection: "brands" })).totalDocs).toBe(
      scale.brands,
    );
    expect((await payload.count({ collection: "products" })).totalDocs).toBe(
      scale.products,
    );
  });

  it("returns sampled products with their brand and translated category", async () => {
    const sampleIds = new Set([
      1,
      2,
      Math.floor(scale.products / 2),
      scale.products,
    ]);
    const expected = new Map<number, ProductRow>();
    for (const row of productRows(seed, scaleName)) {
      if (sampleIds.has(row[0])) expected.set(row[0], row);
    }
    const brands = new Map(
      brandRows(seed, scaleName).map(([id, name]) => [id, name]),
    );
    const categoryNames = new Map(categories().map((c) => [c.id, c.names]));

    for (const [
      id,
      [, reference, brandId, categoryId, priceCents],
    ] of expected) {
      for (const locale of ["fr", "de"] as const) {
        const product = await payload.findByID({
          collection: "products",
          id,
          depth: 1,
          locale,
        });
        expect(product.reference).toBe(reference);
        expect(product.priceCents).toBe(priceCents);
        expect(product.showcase).toBe(false);
        expect(product.name ?? null).toBeNull();
        expect(product.description ?? null).toBeNull();
        expect(typeof product.brand === "object" && product.brand.name).toBe(
          brands.get(brandId),
        );
        expect(
          typeof product.category === "object" && product.category.name,
        ).toBe(categoryNames.get(categoryId)?.[locale]);
      }
    }
  });

  it("gives a new document the next free id", async () => {
    const brand = await payload.create({
      collection: "brands",
      data: { name: "Readback test brand", slug: "readback-test-brand" },
    });
    try {
      expect(brand.id).toBe(scale.brands + 1);
    } finally {
      await payload.delete({ collection: "brands", id: brand.id });
    }
  });
});

describe("the project tables", () => {
  it("hold every model and the compatibility rows", async () => {
    let expectedRows = 0;
    for (const _ of compatibilityRows(seed, scaleName)) expectedRows++;
    const { rows } = await client.query<{
      models: string;
      compatibility: string;
    }>(
      `SELECT (SELECT count(*) FROM appliance_models) AS models,
              (SELECT count(*) FROM compatibility) AS compatibility`,
    );
    expect(Number(rows[0]?.models)).toBe(MODEL_COUNT);
    expect(Number(rows[0]?.compatibility)).toBe(expectedRows);
  });

  it("rank the million-model product's models from 1 to 1,000,000", async () => {
    const { rows } = await client.query<{
      count: string;
      min: number;
      max: number;
    }>(
      "SELECT count(*), min(rank), max(rank) FROM compatibility WHERE product_id = $1",
      [MILLION_PRODUCT_ID],
    );
    expect(rows[0]).toEqual({ count: "1000000", min: 1, max: 1_000_000 });
  });

  it("store no text for ordinary products", async () => {
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*) FROM products_locales l
         JOIN products p ON p.id = l._parent_id
        WHERE p.showcase IS NOT TRUE`,
    );
    expect(rows[0]?.count).toBe("0");
  });
});
