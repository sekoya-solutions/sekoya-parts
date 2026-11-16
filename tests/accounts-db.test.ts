// The demo accounts on a migrated database (issue #177): Payload's
// customers collection with its rules on usernames and passwords, the
// lockout, the last sign-in the purge reads, the purge itself and the cap
// the database's trigger holds.
//
// The test's own accounts get a random username and are deleted afterwards.
// The purge and the cap run inside a transaction that is rolled back, so
// they change no other account, even on the dev database.

import { randomBytes } from "node:crypto";
import {
  AuthenticationError,
  Forbidden,
  getPayload,
  LockedAuth,
  type Payload,
  ValidationError,
} from "payload";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { purgeAccounts } from "../cms/accounts/purge.ts";
import { CUSTOMER_COLLECTION } from "../cms/collections/customers.ts";
import config from "../payload.config.ts";
import { MAX_ACCOUNTS, MAX_LOGIN_ATTEMPTS } from "../site/account-rules.ts";

// No silent skip: without a database this test fails.
for (const name of ["DATABASE_URL", "PAYLOAD_SECRET"]) {
  if (!process.env[name]) throw new Error(`${name} must be set for this test.`);
}

const PASSWORD = "correct horse battery";
const prefix = `t177-${randomBytes(4).toString("hex")}`;
const created: number[] = [];

let payload: Payload;
let client: pg.Client;

beforeAll(async () => {
  payload = await getPayload({ config });
  client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
});

afterAll(async () => {
  if (payload && created.length > 0)
    await payload.delete({
      collection: CUSTOMER_COLLECTION,
      where: { id: { in: created } },
      overrideAccess: true,
    });
  await client?.end();
  await payload?.destroy();
});

async function account(name: string, password = PASSWORD) {
  const doc = await payload.create({
    collection: CUSTOMER_COLLECTION,
    data: { username: `${prefix}-${name}`, password },
    overrideAccess: true,
  });
  created.push(doc.id);
  return doc;
}

describe("the customers collection", () => {
  it("refuses a short password and a malformed username", async () => {
    await expect(
      payload.create({
        collection: CUSTOMER_COLLECTION,
        data: { username: `${prefix}-short`, password: "elevenchars" },
        overrideAccess: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      payload.create({
        collection: CUSTOMER_COLLECTION,
        data: { username: "no spaces allowed", password: PASSWORD },
        overrideAccess: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("stores no email address and records each sign-in", async () => {
    const doc = await account("signin");
    expect(doc.email ?? null).toBeNull();
    expect(doc.lastSignInAt ?? null).toBeNull();
    const before = Date.now();
    const result = await payload.login({
      collection: CUSTOMER_COLLECTION,
      data: { username: doc.username, password: PASSWORD },
    });
    expect(result.token).toBeTruthy();
    const after = await payload.findByID({
      collection: CUSTOMER_COLLECTION,
      id: doc.id,
      overrideAccess: true,
    });
    expect(Date.parse(after.lastSignInAt ?? "")).toBeGreaterThanOrEqual(
      before - 1000,
    );
  });

  it("locks an account after five failed sign-ins, even to its password", async () => {
    const doc = await account("locked");
    for (let attempt = 0; attempt < MAX_LOGIN_ATTEMPTS; attempt++)
      await expect(
        payload.login({
          collection: CUSTOMER_COLLECTION,
          data: { username: doc.username, password: "not the password" },
        }),
      ).rejects.toBeInstanceOf(AuthenticationError);
    await expect(
      payload.login({
        collection: CUSTOMER_COLLECTION,
        data: { username: doc.username, password: PASSWORD },
      }),
    ).rejects.toBeInstanceOf(LockedAuth);
  });

  it("is refused to a customer through Payload's API", async () => {
    await expect(
      payload.find({
        collection: CUSTOMER_COLLECTION,
        limit: 1,
        overrideAccess: false,
        user: { id: 1, collection: CUSTOMER_COLLECTION },
      }),
    ).rejects.toBeInstanceOf(Forbidden);
  });
});

/** Runs a check in a transaction that is always rolled back. */
async function rolledBack(check: () => Promise<void>) {
  await client.query("BEGIN");
  try {
    await check();
  } finally {
    await client.query("ROLLBACK");
  }
}

describe("the purge", () => {
  it("deletes accounts 30 days after their last sign-in, with their sessions", async () => {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    await rolledBack(async () => {
      const insert = async (
        name: string,
        lastSignIn: Date | null,
        createdAt: Date,
      ) =>
        (
          await client.query<{ id: number }>(
            `INSERT INTO customers (username, last_sign_in_at, created_at)
             VALUES ($1, $2, $3) RETURNING id`,
            [`${prefix}-${name}`, lastSignIn, createdAt],
          )
        ).rows[0]?.id;
      const old = await insert(
        "old",
        new Date(now.getTime() - 31 * day),
        new Date(now.getTime() - 60 * day),
      );
      const recent = await insert(
        "recent",
        new Date(now.getTime() - 29 * day),
        new Date(now.getTime() - 60 * day),
      );
      const never = await insert(
        "never",
        null,
        new Date(now.getTime() - 31 * day),
      );
      const fresh = await insert("fresh", null, new Date(now.getTime() - day));
      await client.query(
        `INSERT INTO customers_sessions (_order, _parent_id, id, expires_at)
         VALUES (1, $1, $2, $3)`,
        [old, `${prefix}-session`, now],
      );
      await purgeAccounts(client, now);
      const { rows } = await client.query<{ id: number }>(
        "SELECT id FROM customers WHERE id = ANY($1)",
        [[old, recent, never, fresh]],
      );
      expect(rows.map((row) => row.id).sort()).toEqual([recent, fresh].sort());
      const sessions = await client.query(
        "SELECT 1 FROM customers_sessions WHERE _parent_id = $1",
        [old],
      );
      expect(sessions.rowCount).toBe(0);
    });
  });
});

describe("the cap", () => {
  it(`refuses an account past ${MAX_ACCOUNTS}`, async () => {
    await rolledBack(async () => {
      // Fills the table up to the cap without the trigger, which would count
      // the rows once per insert, then turns it on again.
      await client.query("ALTER TABLE customers DISABLE TRIGGER customers_cap");
      await client.query(
        `INSERT INTO customers (username)
         SELECT $1 || '-cap-' || n
           FROM generate_series(1, $2 - (SELECT count(*) FROM customers)) n`,
        [prefix, MAX_ACCOUNTS],
      );
      await client.query("ALTER TABLE customers ENABLE TRIGGER customers_cap");
      const count = await client.query<{ n: string }>(
        "SELECT count(*) AS n FROM customers",
      );
      expect(Number(count.rows[0]?.n)).toBe(MAX_ACCOUNTS);
      await expect(
        client.query("INSERT INTO customers (username) VALUES ($1)", [
          `${prefix}-one-too-many`,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("lets an account in below the cap", async () => {
    await rolledBack(async () => {
      await client.query("INSERT INTO customers (username) VALUES ($1)", [
        `${prefix}-below-cap`,
      ]);
    });
  });
});
