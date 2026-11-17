// The demo orders on a migrated database (issue #187): drafts saved and read
// back by their token's hash, placing under the row's lock so two requests
// place a draft once, a refusal that changes nothing, the purge and the cap
// the database's trigger holds; and, since issue #188, a customer's orders
// read by the account alone and deleted with it.
//
// The test's own rows get random token hashes and are deleted afterwards.
// The purge and the cap run inside a transaction that is rolled back, so
// they change no other row, even on the dev database.
import { randomBytes, randomInt } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { purgeAccounts, purgeCutoff } from "../cms/accounts/purge.ts";
import { purgeOrders } from "../cms/orders/purge.ts";
import {
  customerOrder,
  customerOrders,
  type Placement,
  placeOrder,
  readCheckout,
  saveDraft,
} from "../cms/orders/store.ts";
import {
  CHECKOUT_SECONDS,
  type DeliveryChoice,
  MAX_ORDERS,
} from "../site/checkout-rules.ts";
import { pickupPoint } from "../site/pickup-points.ts";

// No silent skip: without a database this test fails.
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL must be set for this test.");

const hashes: string[] = [];
const newHash = () => {
  const hash = randomBytes(32).toString("hex");
  hashes.push(hash);
  return hash;
};

const home: DeliveryChoice = {
  address: {
    label: "",
    name: "Test Order",
    line1: "1 rue de la Démo",
    line2: "",
    postalCode: "75001",
    city: "Paris",
    country: "FR",
  },
  method: "home",
  point: null,
};

const placement: Placement = {
  lines: [
    {
      product: 1,
      reference: "SP000001",
      name: "Pièce A",
      unitCents: 1250,
      quantity: 2,
    },
    {
      product: 2,
      reference: "SP000002",
      name: "Pièce B",
      unitCents: 990,
      quantity: 1,
    },
  ],
  totals: {
    promotionCode: null,
    subtotalCents: 3490,
    discountCents: 0,
    deliveryCents: 690,
    totalCents: 4180,
  },
  customerId: null,
};

let pool: pg.Pool;
let client: pg.PoolClient;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  client = await pool.connect();
});

afterAll(async () => {
  if (hashes.length > 0)
    await client?.query("DELETE FROM orders WHERE token_hash = ANY($1)", [
      hashes,
    ]);
  client?.release();
  await pool?.end();
});

async function rolledBack(run: () => Promise<void>) {
  await client.query("BEGIN");
  try {
    await run();
  } finally {
    await client.query("ROLLBACK");
  }
}

describe("drafts", () => {
  it("are created, then updated in place, and read back by their hash", async () => {
    const hash = newHash();
    expect(
      await saveDraft(pool, hash, {
        locale: "fr",
        customerId: null,
        choice: home,
      }),
    ).toBe("saved");
    const point = pickupPoint("FR-2");
    expect(
      await saveDraft(pool, hash, {
        locale: "en",
        customerId: null,
        choice: { ...home, method: "pickup", point },
      }),
    ).toBe("saved");
    const rows = await client.query(
      "SELECT count(*)::int AS n FROM orders WHERE token_hash = $1",
      [hash],
    );
    expect(rows.rows[0]?.n).toBe(1);
    const stored = await readCheckout(pool, hash);
    expect(stored).toMatchObject({
      status: "draft",
      locale: "en",
      number: null,
      choice: { address: home.address, method: "pickup", point },
    });
  });

  it("are not read once the cookie's lifetime has passed", async () => {
    const hash = newHash();
    await saveDraft(pool, hash, {
      locale: "fr",
      customerId: null,
      choice: home,
    });
    await client.query(
      `UPDATE orders SET updated_at = now() - make_interval(secs => $2)
        WHERE token_hash = $1`,
      [hash, CHECKOUT_SECONDS + 60],
    );
    expect(await readCheckout(pool, hash)).toBeNull();
  });

  it("are never another hash's", async () => {
    const hash = newHash();
    await saveDraft(pool, hash, {
      locale: "fr",
      customerId: null,
      choice: home,
    });
    expect(await readCheckout(pool, newHash())).toBeNull();
  });
});

describe("placing an order", () => {
  it("gives it a number, its lines and its totals", async () => {
    const hash = newHash();
    await saveDraft(pool, hash, {
      locale: "fr",
      customerId: null,
      choice: home,
    });
    const result = await placeOrder(pool, hash, async () => placement);
    expect(result.outcome).toBe("placed");
    const number = "number" in result ? result.number : "";
    expect(number).toMatch(/^SP-\d{6,}$/);
    const stored = await readCheckout(pool, hash);
    expect(stored).toMatchObject({
      status: "placed",
      number,
      lines: placement.lines,
      totals: placement.totals,
    });
    expect(stored?.placedAt).not.toBeNull();
    // The cookie now names a placed order: the next draft needs a new token.
    expect(
      await saveDraft(pool, hash, {
        locale: "fr",
        customerId: null,
        choice: home,
      }),
    ).toBe("placed");
  });

  it("places a draft once when two requests place it at the same time", async () => {
    const hash = newHash();
    await saveDraft(pool, hash, {
      locale: "fr",
      customerId: null,
      choice: home,
    });
    // The first holds the row's lock while it computes; the second waits for
    // it, then finds the order placed.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: () => void = () => {};
    const inside = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = placeOrder(pool, hash, async () => {
      entered();
      await held;
      return placement;
    });
    await inside;
    let computedTwice = false;
    const second = placeOrder(pool, hash, async () => {
      computedTwice = true;
      return placement;
    });
    // The first is released only once the second is seen waiting for the
    // row's lock, so the test fails if placing takes no lock.
    const deadline = Date.now() + 15_000;
    for (;;) {
      const waiting = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%'
            AND query LIKE '%token_hash%'`,
      );
      if ((waiting.rows[0]?.n ?? 0) > 0) break;
      if (Date.now() > deadline) {
        release();
        await Promise.allSettled([first, second]);
        throw new Error("The second request never waited for the row's lock.");
      }
    }
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a.outcome).toBe("placed");
    expect(b.outcome).toBe("already");
    expect("number" in b && "number" in a && b.number === a.number).toBe(true);
    expect(computedTwice).toBe(false);
    const lines = await client.query(
      `SELECT count(*)::int AS n FROM orders_lines l
         JOIN orders o ON o.id = l._parent_id WHERE o.token_hash = $1`,
      [hash],
    );
    expect(lines.rows[0]?.n).toBe(placement.lines.length);
  });

  it("changes nothing when the computation refuses it", async () => {
    const hash = newHash();
    await saveDraft(pool, hash, {
      locale: "fr",
      customerId: null,
      choice: home,
    });
    expect(
      await placeOrder(pool, hash, async () => ({ refused: "changed" })),
    ).toEqual({ outcome: "changed" });
    expect(await readCheckout(pool, hash)).toMatchObject({
      status: "draft",
      number: null,
    });
  });

  it("refuses a hash with no fresh draft", async () => {
    expect(await placeOrder(pool, newHash(), async () => placement)).toEqual({
      outcome: "expired",
    });
  });
});

describe("the purge", () => {
  it("deletes drafts after 24 hours and guests' orders after 30 days, nothing else", async () => {
    const now = new Date();
    await rolledBack(async () => {
      const insert = async (
        status: "draft" | "placed",
        updatedHoursAgo: number,
        placedDaysAgo: number | null,
        customer: boolean,
      ) => {
        const customerId = customer
          ? (
              await client.query<{ id: number }>(
                "INSERT INTO customers (username) VALUES ($1) RETURNING id",
                [`t187-${randomBytes(4).toString("hex")}`],
              )
            ).rows[0]?.id
          : null;
        const { rows } = await client.query<{ id: number }>(
          `INSERT INTO orders
             (token_hash, status, locale, customer_id, address_name,
              address_line1, address_postal_code, address_city,
              address_country, delivery_method, updated_at, placed_at)
           VALUES ($1, $2, 'fr', $3, 'T', 'L', '75001', 'Paris', 'FR', 'home',
                   now() - make_interval(hours => $4),
                   CASE WHEN $5::int IS NULL THEN NULL
                        ELSE now() - make_interval(days => $5::int) END)
           RETURNING id`,
          [newHash(), status, customerId, updatedHoursAgo, placedDaysAgo],
        );
        return rows[0]?.id;
      };
      const oldDraft = await insert("draft", 25, null, false);
      const freshDraft = await insert("draft", 23, null, false);
      const oldGuest = await insert("placed", 0, 31, false);
      const freshGuest = await insert("placed", 0, 29, false);
      const oldCustomer = await insert("placed", 0, 31, true);

      await purgeOrders(client, now);
      const { rows } = await client.query<{ id: number }>(
        "SELECT id FROM orders WHERE id = ANY($1)",
        [[oldDraft, freshDraft, oldGuest, freshGuest, oldCustomer]],
      );
      expect(rows.map((row) => row.id).sort()).toEqual(
        [freshDraft, freshGuest, oldCustomer].sort(),
      );
    });
  });
});

describe("the cap", () => {
  const draftRow = (hash: string) =>
    client.query(
      `INSERT INTO orders
         (token_hash, locale, address_name, address_line1,
          address_postal_code, address_city, address_country, delivery_method)
       VALUES ($1, 'fr', 'T', 'L', '75001', 'Paris', 'FR', 'home')`,
      [hash],
    );

  it(`refuses an order past ${MAX_ORDERS}, drafts included`, async () => {
    await rolledBack(async () => {
      // Fills the table up to the cap without the trigger, which would count
      // the rows once per insert, then turns it on again.
      await client.query("ALTER TABLE orders DISABLE TRIGGER orders_cap");
      await client.query(
        `INSERT INTO orders
           (token_hash, locale, address_name, address_line1,
            address_postal_code, address_city, address_country, delivery_method)
         SELECT md5(random()::text || n), 'fr', 'T', 'L', '75001', 'Paris',
                'FR', 'home'
           FROM generate_series(1, $1 - (SELECT count(*) FROM orders)) n`,
        [MAX_ORDERS],
      );
      await client.query("ALTER TABLE orders ENABLE TRIGGER orders_cap");
      const count = await client.query<{ n: string }>(
        "SELECT count(*) AS n FROM orders",
      );
      expect(Number(count.rows[0]?.n)).toBe(MAX_ORDERS);
      await expect(draftRow(newHash())).rejects.toMatchObject({
        code: "23514",
      });
    });
  });

  it("lets a draft in below the cap", async () => {
    await rolledBack(async () => {
      await draftRow(newHash());
    });
  });
});

describe("a customer's orders", () => {
  const newCustomer = async (lastSignIn: Date | null = null) =>
    (
      await client.query<{ id: number }>(
        `INSERT INTO customers (username, last_sign_in_at)
         VALUES ($1, $2) RETURNING id`,
        [`t188-${randomBytes(4).toString("hex")}`, lastSignIn],
      )
    ).rows[0]?.id as number;

  // A row as the checkout leaves it: a draft, or an order placed a given
  // number of days ago with its number, total and one line.
  const insertOrder = async (
    customerId: number | null,
    placedDaysAgo: number | null,
  ) => {
    const placed = placedDaysAgo !== null;
    const number = placed
      ? `SP-9${String(randomInt(10 ** 8)).padStart(8, "0")}`
      : null;
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO orders
         (token_hash, status, locale, customer_id, number, address_name,
          address_line1, address_postal_code, address_city, address_country,
          delivery_method, subtotal_cents, discount_cents, delivery_cents,
          total_cents, placed_at)
       VALUES ($1, $2, 'fr', $3, $4, 'T', 'L', '75001', 'Paris', 'FR', 'home',
               $5, 0, 0, $5,
               CASE WHEN $6::int IS NULL THEN NULL
                    ELSE now() - make_interval(days => $6::int) END)
       RETURNING id`,
      [
        newHash(),
        placed ? "placed" : "draft",
        customerId,
        number,
        placed ? 1000 + (placedDaysAgo ?? 0) : null,
        placedDaysAgo,
      ],
    );
    const id = rows[0]?.id as number;
    if (placed)
      await client.query(
        `INSERT INTO orders_lines
           (_order, _parent_id, id, product, reference, name, unit_cents, quantity)
         VALUES (1, $1, $2, 1, 'SP000001', 'Pièce A', 1000, 1)`,
        [id, randomBytes(12).toString("hex")],
      );
    return { id, number: number ?? "" };
  };

  const remaining = async (ids: number[]) =>
    (
      await client.query<{ id: number }>(
        "SELECT id FROM orders WHERE id = ANY($1)",
        [ids],
      )
    ).rows
      .map((row) => row.id)
      .sort();

  it("lists the customer's placed orders only, newest first, up to the limit", async () => {
    await rolledBack(async () => {
      const customer = await newCustomer();
      const other = await newCustomer();
      const older = await insertOrder(customer, 3);
      const newest = await insertOrder(customer, 1);
      const middle = await insertOrder(customer, 2);
      await insertOrder(customer, null);
      await insertOrder(other, 0);
      await insertOrder(null, 0);

      const listed = await customerOrders(client, customer, 10);
      expect(listed.map((order) => order.number)).toEqual([
        newest.number,
        middle.number,
        older.number,
      ]);
      expect(listed[0]?.totalCents).toBe(1001);
      expect(Date.parse(listed[0]?.placedAt ?? "")).not.toBeNaN();
      expect(
        (await customerOrders(client, customer, 2)).map((o) => o.number),
      ).toEqual([newest.number, middle.number]);
    });
  });

  it("reads one order for its customer only", async () => {
    await rolledBack(async () => {
      const customer = await newCustomer();
      const other = await newCustomer();
      const order = await insertOrder(customer, 0);
      expect(await customerOrder(client, customer, order.number)).toMatchObject(
        {
          status: "placed",
          number: order.number,
          lines: [{ reference: "SP000001", quantity: 1 }],
          totals: { totalCents: 1000 },
        },
      );
      expect(await customerOrder(client, other, order.number)).toBeNull();
      expect(await customerOrder(client, customer, "SP-000000")).toBeNull();
    });
  });

  it("are deleted with the account, drafts and lines included, and no one else's", async () => {
    await rolledBack(async () => {
      const customer = await newCustomer();
      const other = await newCustomer();
      const placed = await insertOrder(customer, 0);
      const draft = await insertOrder(customer, null);
      const others = await insertOrder(other, 0);
      const guest = await insertOrder(null, 0);

      // As "Delete my account" does, through Payload's delete.
      await client.query("DELETE FROM customers WHERE id = $1", [customer]);
      expect(
        await remaining([placed.id, draft.id, others.id, guest.id]),
      ).toEqual([others.id, guest.id].sort());
      const lines = await client.query(
        "SELECT 1 FROM orders_lines WHERE _parent_id = $1",
        [placed.id],
      );
      expect(lines.rows).toHaveLength(0);
    });
  });

  it("are deleted by the daily purge with an expired account, and kept with a current one", async () => {
    const now = new Date();
    await rolledBack(async () => {
      const day = 24 * 60 * 60 * 1000;
      const expired = await newCustomer(
        new Date(purgeCutoff(now).getTime() - day),
      );
      const current = await newCustomer(now);
      const gone = await insertOrder(expired, 40);
      const kept = await insertOrder(current, 40);

      await purgeAccounts(client, now);
      expect(await remaining([gone.id, kept.id])).toEqual([kept.id]);
    });
  });
});
