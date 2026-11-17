// Saved addresses on a migrated database (issue #178): the writes the
// account route makes, under the account's lock; the cap held when writes
// race; no account reaching another's address; and the addresses deleted
// with their account, by "Delete my account" and by the purge.
//
// The test's own accounts get a random username and are deleted afterwards.
// The purge runs inside a transaction that is rolled back, so it changes no
// other account, even on the dev database.
import { randomBytes } from "node:crypto";
import { getPayload, type Payload } from "payload";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { purgeAccounts } from "../cms/accounts/purge.ts";
import { writeAddress } from "../cms/accounts/saved-addresses.ts";
import { CUSTOMER_COLLECTION } from "../cms/collections/customers.ts";
import config from "../payload.config.ts";
import { MAX_ADDRESSES, type SavedAddress } from "../site/saved-addresses.ts";

// No silent skip: without a database this test fails.
for (const name of ["DATABASE_URL", "PAYLOAD_SECRET"]) {
  if (!process.env[name]) throw new Error(`${name} must be set for this test.`);
}

const PASSWORD = "correct horse battery";
const prefix = `t178-${randomBytes(4).toString("hex")}`;
const created: number[] = [];

let payload: Payload;
let pool: pg.Pool;

const address = (city: string): SavedAddress => ({
  label: "",
  name: "Marie Dupont",
  line1: "12 rue des Lilas",
  line2: "",
  postalCode: "75011",
  city,
  country: "FR",
});

beforeAll(async () => {
  payload = await getPayload({ config });
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
});

afterAll(async () => {
  if (payload && created.length > 0)
    await payload.delete({
      collection: CUSTOMER_COLLECTION,
      where: { id: { in: created } },
      overrideAccess: true,
    });
  await pool?.end();
  await payload?.destroy();
});

async function account(name: string) {
  const doc = await payload.create({
    collection: CUSTOMER_COLLECTION,
    data: { username: `${prefix}-${name}`, password: PASSWORD },
    overrideAccess: true,
  });
  created.push(doc.id);
  return doc.id;
}

/** The addresses Payload reads back, in their order. */
async function stored(id: number) {
  const doc = await payload.findByID({
    collection: CUSTOMER_COLLECTION,
    id,
    depth: 0,
    overrideAccess: true,
  });
  return doc.addresses ?? [];
}

const rowsOf = async (id: number) =>
  Number(
    (
      await pool.query<{ count: string }>(
        "SELECT count(*) FROM customers_addresses WHERE _parent_id = $1",
        [id],
      )
    ).rows[0]?.count,
  );

describe("saved addresses", () => {
  it("are added in order up to the cap, then refused", async () => {
    const id = await account("cap");
    for (let n = 1; n <= MAX_ADDRESSES; n++)
      expect(
        await writeAddress(pool, id, {
          kind: "add",
          address: address(`C${n}`),
        }),
      ).toBe("saved");
    expect(
      await writeAddress(pool, id, { kind: "add", address: address("extra") }),
    ).toBe("full");
    const addresses = await stored(id);
    expect(addresses.map((a) => a.city)).toEqual([
      "C1",
      "C2",
      "C3",
      "C4",
      "C5",
    ]);
    expect(addresses[0]).toMatchObject({
      name: "Marie Dupont",
      postalCode: "75011",
      country: "FR",
    });
  });

  it("hold the cap when another write to the account has not committed yet", async () => {
    // Another write holds the account's lock and has added the last address
    // the cap allows, uncommitted. The add must wait for it, then see that
    // address and refuse; without the lock it would see four and save.
    const id = await account("race");
    for (let n = 1; n < MAX_ADDRESSES; n++)
      await writeAddress(pool, id, { kind: "add", address: address(`C${n}`) });
    const other = await pool.connect();
    let add: Promise<string> | null = null;
    try {
      await other.query("BEGIN");
      await other.query("SELECT id FROM customers WHERE id = $1 FOR UPDATE", [
        id,
      ]);
      await other.query(
        `INSERT INTO customers_addresses
           (_order, _parent_id, id, name, line1, postal_code, city, country)
         VALUES (99, $1, $2, 'X', 'X', '1', 'Other', 'FR')`,
        [id, randomBytes(12).toString("hex")],
      );
      let settled = false;
      add = writeAddress(pool, id, {
        kind: "add",
        address: address("Late"),
      }).finally(() => {
        settled = true;
      });
      // Waits on a signal: the add's query shown waiting for a lock by the
      // database, or the add ending first, which only happens without the
      // lock. One light query every 50 ms, for 10 s at most.
      const blocker = (
        await other.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
      ).rows[0]?.pid;
      for (let tries = 0; tries < 200 && !settled; tries++) {
        const { rows } = await pool.query<{ waiting: number }>(
          `SELECT count(*)::int AS waiting FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid))`,
          [blocker],
        );
        if ((rows[0]?.waiting ?? 0) > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await other.query("COMMIT");
      other.release();
    } catch (error) {
      other.release(true);
      throw error;
    }
    expect(await add).toBe("full");
    expect(await rowsOf(id)).toBe(MAX_ADDRESSES);
  });

  it("are edited and removed by their own account only", async () => {
    const owner = await account("owner");
    const other = await account("other");
    await writeAddress(pool, owner, { kind: "add", address: address("Lyon") });
    const [saved] = await stored(owner);
    const addressId = saved?.id as string;

    expect(
      await writeAddress(pool, other, {
        kind: "edit",
        id: addressId,
        address: address("Stolen"),
      }),
    ).toBe("missing");
    expect(
      await writeAddress(pool, other, { kind: "remove", id: addressId }),
    ).toBe("missing");
    expect((await stored(owner))[0]?.city).toBe("Lyon");

    expect(
      await writeAddress(pool, owner, {
        kind: "edit",
        id: addressId,
        address: { ...address("Nantes"), line2: "Bât. B", label: "Maison" },
      }),
    ).toBe("saved");
    expect((await stored(owner))[0]).toMatchObject({
      id: addressId,
      city: "Nantes",
      line2: "Bât. B",
      label: "Maison",
    });
    expect(
      await writeAddress(pool, owner, { kind: "remove", id: addressId }),
    ).toBe("removed");
    expect(await stored(owner)).toEqual([]);
    expect(
      await writeAddress(pool, owner, { kind: "remove", id: addressId }),
    ).toBe("missing");
  });

  it("are refused to an account that no longer exists", async () => {
    expect(
      await writeAddress(pool, -1, { kind: "add", address: address("X") }),
    ).toBe("no-account");
  });

  it("go with their account when it is deleted", async () => {
    const id = await account("deleted");
    await writeAddress(pool, id, { kind: "add", address: address("Lille") });
    expect(await rowsOf(id)).toBe(1);
    await payload.delete({
      collection: CUSTOMER_COLLECTION,
      id,
      overrideAccess: true,
    });
    expect(await rowsOf(id)).toBe(0);
  });

  it("go with their account when the purge deletes it", async () => {
    const id = await account("purged");
    await writeAddress(pool, id, { kind: "add", address: address("Metz") });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE customers SET last_sign_in_at = now() - interval '31 days' WHERE id = $1",
        [id],
      );
      expect(await purgeAccounts(client, new Date())).toBeGreaterThanOrEqual(1);
      const { rows } = await client.query<{ count: string }>(
        "SELECT count(*) FROM customers_addresses WHERE _parent_id = $1",
        [id],
      );
      expect(Number(rows[0]?.count)).toBe(0);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
