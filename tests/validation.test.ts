// Payload refuses a product reference, a category slug or a brand slug that
// would break an address (docs/adr/0011-languages-and-seo.md, issues #73, #75
// and #79). The saves go through Payload's local API, so the tests prove each
// rule is wired to its
// field, and fail if a validator is removed: Payload's own text validation
// would accept these values, and the save would then fail elsewhere, without
// a validation error on the field. A refused save writes nothing, which the
// tests check in the database. Needs a database loaded by `npm run generate`.

import { getPayload, type Payload, ValidationError } from "payload";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config.ts";

// No silent skip: without a database this test fails.
for (const name of ["DATABASE_URL", "PAYLOAD_SECRET"]) {
  if (!process.env[name]) throw new Error(`${name} must be set for this test.`);
}

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

/** The field paths a save's validation error names; fails on any other error. */
async function rejectedPaths(save: Promise<unknown>): Promise<string[]> {
  const error = await save.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ValidationError);
  return (error as ValidationError).data.errors.map(({ path }) => path);
}

async function firstId(table: "brands" | "categories"): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `SELECT id FROM ${table} ORDER BY id LIMIT 1`,
  );
  const id = rows[0]?.id;
  if (id === undefined)
    throw new Error(`No row in ${table}: load the catalog.`);
  return id;
}

describe("product references", () => {
  it.each(["sp000123", "SP-123", "SP 123", "SPÉ123"])(
    "refuses %j and writes nothing",
    async (reference) => {
      const brand = await firstId("brands");
      const category = await firstId("categories");
      const paths = await rejectedPaths(
        payload.create({
          collection: "products",
          data: { reference, brand, category, priceCents: 990 },
        }),
      );
      expect(paths).toEqual(["reference"]);
      const { rows } = await client.query<{ count: string }>(
        "SELECT count(*) FROM products WHERE reference = $1",
        [reference],
      );
      expect(Number(rows[0]?.count)).toBe(0);
    },
  );
});

describe("category slugs", () => {
  it.each(["Courroie", "courroié", "cour--roie", "courroie-", "-courroie"])(
    "refuses %j and leaves the slug unchanged",
    async (slug) => {
      const id = await firstId("categories");
      const read = async () =>
        (
          await client.query<{ slug: string }>(
            `SELECT slug FROM categories_locales
              WHERE _parent_id = $1 AND _locale = 'fr'`,
            [id],
          )
        ).rows[0]?.slug;
      const before = await read();
      expect(before).toBeTruthy();
      const paths = await rejectedPaths(
        payload.update({
          collection: "categories",
          id,
          locale: "fr",
          data: { slug },
        }),
      );
      expect(paths).toEqual(["slug"]);
      expect(await read()).toBe(before);
    },
  );
});

describe("category slugs equal to a model word", () => {
  it.each([
    ["fr", "appareil"],
    ["fr", "geraet"],
    ["de", "apparat"],
  ] as const)(
    "refuses %s %j and leaves the slug unchanged",
    async (locale, slug) => {
      const id = await firstId("categories");
      const read = async () =>
        (
          await client.query<{ slug: string }>(
            `SELECT slug FROM categories_locales
              WHERE _parent_id = $1 AND _locale = $2`,
            [id, locale],
          )
        ).rows[0]?.slug;
      const before = await read();
      expect(before).toBeTruthy();
      const paths = await rejectedPaths(
        payload.update({
          collection: "categories",
          id,
          locale,
          data: { slug },
        }),
      );
      expect(paths).toEqual(["slug"]);
      expect(await read()).toBe(before);
    },
  );
});

// A brand's slug starts its models' addresses, up to the first hyphen
// (issue #79).
describe("brand slugs", () => {
  it.each(["Norium", "nor-ium", "nor ium", "noriüm", "nor_ium"])(
    "refuses %j and leaves the slug unchanged",
    async (slug) => {
      const id = await firstId("brands");
      const read = async () =>
        (
          await client.query<{ slug: string }>(
            "SELECT slug FROM brands WHERE id = $1",
            [id],
          )
        ).rows[0]?.slug;
      const before = await read();
      expect(before).toBeTruthy();
      const paths = await rejectedPaths(
        payload.update({ collection: "brands", id, data: { slug } }),
      );
      expect(paths).toEqual(["slug"]);
      expect(await read()).toBe(before);
    },
  );
});
