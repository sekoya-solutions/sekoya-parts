// The sale rotation's SQL on the loaded catalog (issue #151), inside a
// transaction that is rolled back, so the catalog is left as loaded. It runs
// only on a local database, CI's or npm run test:local's (issue #185): with
// npm test, DATABASE_URL is the owner's Neon dev branch (vitest.config.ts),
// whose products it would all rewrite inside the transaction.
import pg from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { rotateSales, SALE_SHARE } from "../cms/sales/rotation.ts";
import { isLocalDatabase } from "./local-database.ts";

describe.runIf(isLocalDatabase())("rotateSales", () => {
  let client: pg.Client;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL)
      throw new Error("DATABASE_URL must be set for this test.");
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
  });
  afterAll(async () => {
    await client?.end();
  });
  beforeEach(async () => {
    await client.query("BEGIN");
    await client.query(
      "UPDATE products SET sale_price_cents = NULL, sale_starts_at = NULL, sale_ends_at = NULL",
    );
  });
  afterEach(async () => {
    await client.query("ROLLBACK");
  });

  const NOW = new Date("2026-11-15T05:10:00Z");
  const NEXT = new Date("2026-11-16T00:00:00Z");
  const DAY = 86_400_000;

  async function products(): Promise<number> {
    const { rows } = await client.query<{ n: string }>(
      "SELECT count(*) AS n FROM products",
    );
    return Number(rows[0]?.n);
  }

  async function sales() {
    const { rows } = await client.query<{
      id: number;
      price: number;
      sale: string;
      starts: Date;
      ends: Date;
    }>(
      `SELECT id, price_cents AS price, sale_price_cents AS sale,
            sale_starts_at AS starts, sale_ends_at AS ends
       FROM products WHERE sale_ends_at IS NOT NULL`,
    );
    return rows;
  }

  it("puts 2% of the catalog on sale, 10% to 30% off, for 7 to 28 days from the next boundary", async () => {
    const added = await rotateSales(client, {
      now: NOW,
      startsAt: NEXT,
      spread: false,
      limit: 100_000,
    });
    expect(added).toHaveLength(Math.ceil((await products()) * SALE_SHARE));
    for (const sale of await sales()) {
      // numeric columns come back from pg as strings.
      const cents = Number(sale.sale);
      const price = Number(sale.price);
      expect(cents, String(sale.id)).toBeLessThan(price);
      expect(cents % 10).toBe(0);
      expect(cents / price).toBeGreaterThanOrEqual(0.69);
      expect(cents / price).toBeLessThanOrEqual(0.9);
      expect(sale.starts.getTime()).toBe(NEXT.getTime());
      const days = (sale.ends.getTime() - sale.starts.getTime()) / DAY;
      expect(days).toBeGreaterThanOrEqual(7);
      expect(days).toBeLessThanOrEqual(28);
    }
    // Drawn per product: one length for all was a bug (ORDER BY random()
    // matched to a random() column).
    const lengths = new Set(
      (await sales()).map(
        (sale) => sale.ends.getTime() - sale.starts.getTime(),
      ),
    );
    expect(lengths.size).toBeGreaterThan(1);
  });

  it("adds nothing while the share is reached, then replaces the sales that ended", async () => {
    await rotateSales(client, {
      now: NOW,
      startsAt: NEXT,
      spread: false,
      limit: 100_000,
    });
    expect(
      await rotateSales(client, {
        now: NOW,
        startsAt: NEXT,
        spread: false,
        limit: 100_000,
      }),
    ).toHaveLength(0);
    await client.query(
      `UPDATE products SET sale_starts_at = $1, sale_ends_at = $2
        WHERE id IN (SELECT id FROM products WHERE sale_ends_at IS NOT NULL
                      ORDER BY id LIMIT 5)`,
      [new Date(NOW.getTime() - 10 * DAY), new Date(NOW.getTime() - DAY)],
    );
    expect(
      await rotateSales(client, {
        now: NOW,
        startsAt: NEXT,
        spread: false,
        limit: 100_000,
      }),
    ).toHaveLength(5);
  });

  it("adds at most the run's limit", async () => {
    expect(
      await rotateSales(client, {
        now: NOW,
        startsAt: NEXT,
        spread: false,
        limit: 3,
      }),
    ).toHaveLength(3);
  });

  it("never touches a sale an editor set that has not ended", async () => {
    await client.query(
      `UPDATE products SET sale_price_cents = 100, sale_starts_at = $1,
              sale_ends_at = $2 WHERE id = 1`,
      [new Date(NOW.getTime() + 3 * DAY), new Date(NOW.getTime() + 9 * DAY)],
    );
    const added = await rotateSales(client, {
      now: NOW,
      startsAt: NEXT,
      spread: false,
      limit: 100_000,
    });
    expect(added.map((sale) => sale.id)).not.toContain(1);
    const { rows } = await client.query<{ sale: string }>(
      "SELECT sale_price_cents AS sale FROM products WHERE id = 1",
    );
    expect(Number(rows[0]?.sale)).toBe(100);
  });

  it("spreads a fresh catalog's sales so all run at the start and end on different days", async () => {
    await rotateSales(client, {
      now: NOW,
      startsAt: NOW,
      spread: true,
      limit: 100_000,
    });
    const all = await sales();
    for (const sale of all) {
      expect(sale.starts.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(sale.ends.getTime()).toBeGreaterThan(NOW.getTime());
    }
    expect(
      new Set(all.map((sale) => sale.ends.getTime())).size,
    ).toBeGreaterThan(1);
  });
});
