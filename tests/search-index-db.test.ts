// The search index's queue and reconcile against the database, with a fake
// Algolia (issue #115). Everything runs in one Payload transaction that is
// rolled back at the end, so the loaded catalog and the dev index's state are
// left as they were. Needs a database loaded by `npm run generate`.
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";
import {
  createLocalReq,
  getPayload,
  initTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from "payload";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Outside a Next.js request revalidateTag and after throw; the test needs neither.
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("next/server", () => ({
  after: () => {
    throw new Error("Not in a request.");
  },
}));

import { reconcile } from "../cms/search-index/sync.ts";
import config from "../payload.config.ts";
import type { IndexConnection } from "../site/algolia.ts";
import {
  INDEX_CAPACITY,
  type ProductRecord,
  selectIndexed,
} from "../site/algolia-record.ts";

for (const name of ["DATABASE_URL", "PAYLOAD_SECRET"]) {
  if (!process.env[name]) throw new Error(`${name} must be set for this test.`);
}

let payload: Payload;
beforeAll(async () => {
  payload = await getPayload({ config });
});
afterAll(async () => {
  await payload?.destroy();
});

type Sent = { path: string; body: unknown };

/** A fake Algolia that keeps an index's records, or fails every call. */
function fakeAlgolia(initial: string[] = []) {
  const records = new Map<string, ProductRecord | null>(
    initial.map((id) => [id, null]),
  );
  const calls: Sent[] = [];
  let failing = false;
  const fetch = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });
    if (failing) return new Response("down", { status: 503 });
    if (path.endsWith("/batch")) {
      for (const r of body.requests) {
        if (r.action === "addObject") records.set(r.body.objectID, r.body);
        else records.delete(r.body.objectID);
      }
      return Response.json({ taskID: 1 });
    }
    if (path.endsWith("/browse")) {
      return Response.json({
        hits: [...records.keys()].map((objectID) => ({ objectID })),
      });
    }
    return Response.json({ updatedAt: "now" });
  }) as unknown as typeof globalThis.fetch;
  const connection: IndexConnection = {
    client: { appId: "TEST", key: "test", fetch },
    environment: "dev",
    index: "products_dev",
  };
  return {
    records,
    calls,
    connection,
    fail: () => {
      failing = true;
    },
  };
}

type Session = PostgresAdapter["drizzle"];

/** Runs `body` in a transaction that is always rolled back. */
async function inRollback(
  body: (req: PayloadRequest, db: Session) => Promise<void>,
) {
  const req = await createLocalReq({}, payload);
  await initTransaction(req);
  const adapter = payload.db as unknown as PostgresAdapter;
  const session = adapter.sessions[String(await req.transactionID)];
  if (!session) throw new Error("No transaction.");
  try {
    await body(req, session.db as unknown as Session);
  } finally {
    await killTransaction(req);
  }
}

async function count(db: Session, table: string): Promise<number> {
  const { rows } = await db.execute<{ n: number }>(
    sql.raw(`SELECT count(*)::int AS n FROM ${table}`),
  );
  return rows[0]?.n ?? 0;
}

async function emptyState(db: Session) {
  await db.execute(sql`DELETE FROM search_index_state`);
  await db.execute(sql`DELETE FROM search_index_queue`);
}

describe("the search index on the database", () => {
  it("rebuilds an unknown index, then sends nothing when nothing changed", async () => {
    await inRollback(async (_req, db) => {
      await emptyState(db);
      // A stale record from another catalog, which must go.
      const algolia = fakeAlgolia(["999999999"]);

      const first = await reconcile(db, algolia.connection);
      expect(first).toMatchObject({ rebuilt: true, deleted: 1 });
      expect(first.sent).toBe(INDEX_CAPACITY.dev);
      expect(algolia.records.size).toBe(INDEX_CAPACITY.dev);
      expect(algolia.records.has("999999999")).toBe(false);
      expect(await count(db, "search_index_state")).toBe(INDEX_CAPACITY.dev);

      // Every showcase product is in, with its ten names.
      const { rows } = await db.execute<{ id: number }>(
        sql`SELECT id FROM products WHERE showcase`,
      );
      for (const { id } of rows) {
        const record = algolia.records.get(String(id));
        expect(record?.showcase).toBe(true);
        expect(record?.name_da).toBeTruthy();
      }
      for (const record of algolia.records.values()) {
        expect(record?.models.length).toBeLessThanOrEqual(500);
      }

      algolia.calls.length = 0;
      const second = await reconcile(db, algolia.connection);
      expect(second).toMatchObject({
        rebuilt: false,
        sent: 0,
        deleted: 0,
        requests: 0,
      });
      expect(algolia.calls).toHaveLength(0);
    });
  });

  it("sends a saved product's new price, and only that record", async () => {
    await inRollback(async (req, db) => {
      await emptyState(db);
      const algolia = fakeAlgolia();
      await reconcile(db, algolia.connection);
      const id = Number([...algolia.records.keys()][5]);

      await payload.update({
        collection: "products",
        id,
        data: { priceCents: 12_345 },
        req,
      });
      expect(await count(db, "search_index_queue")).toBe(1);

      algolia.calls.length = 0;
      const result = await reconcile(db, algolia.connection);
      expect(result).toMatchObject({ sent: 1, deleted: 0, requests: 1 });
      expect(algolia.records.get(String(id))?.priceCents).toBe(12_345);
      expect(await count(db, "search_index_queue")).toBe(0);
    });
  });

  it("swaps the least popular record out when a product becomes showcase", async () => {
    await inRollback(async (req, db) => {
      await emptyState(db);
      const algolia = fakeAlgolia();
      await reconcile(db, algolia.connection);

      const { rows } = await db.execute<{ id: number; showcase: boolean }>(
        sql`SELECT id, coalesce(showcase, false) AS showcase FROM products`,
      );
      const before = selectIndexed(rows, INDEX_CAPACITY.dev);
      const outsider = rows.find((r) => !before.includes(r.id));
      if (!outsider) throw new Error("Every product is indexed.");
      const dropped = before.at(-1);

      await payload.update({
        collection: "products",
        id: outsider.id,
        data: { showcase: true },
        req,
      });
      const result = await reconcile(db, algolia.connection);
      expect(result).toMatchObject({ sent: 1, deleted: 1 });
      expect(algolia.records.get(String(outsider.id))?.showcase).toBe(true);
      expect(algolia.records.has(String(dropped))).toBe(false);
      expect(algolia.records.size).toBe(INDEX_CAPACITY.dev);
    });
  });

  it("keeps the queue and the state when Algolia fails", async () => {
    await inRollback(async (req, db) => {
      await emptyState(db);
      const algolia = fakeAlgolia();
      await reconcile(db, algolia.connection);
      const id = Number([...algolia.records.keys()][3]);
      await payload.update({
        collection: "products",
        id,
        data: { priceCents: 777 },
        req,
      });

      algolia.fail();
      await expect(reconcile(db, algolia.connection)).rejects.toThrow(/503/);
      expect(await count(db, "search_index_queue")).toBe(1);
      expect(await count(db, "search_index_state")).toBe(INDEX_CAPACITY.dev);
    });
  });

  it("queues nothing for a save that is rolled back", async () => {
    await inRollback(async (_req, db) => {
      await emptyState(db);
      const inner = await createLocalReq({}, payload);
      await initTransaction(inner);
      await payload.update({
        collection: "products",
        id: 2,
        data: { priceCents: 1 },
        req: inner,
      });
      await killTransaction(inner);
      expect(await count(db, "search_index_queue")).toBe(0);
    });
  });

  it("queues every product of a renamed brand", async () => {
    await inRollback(async (req, db) => {
      await emptyState(db);
      const brand = await payload.findByID({
        collection: "brands",
        id: 1,
        req,
      });
      await payload.update({
        collection: "brands",
        id: 1,
        data: { name: `${brand.name} Renamed` },
        req,
      });
      const { rows } = await db.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM products WHERE brand_id = 1`,
      );
      expect(await count(db, "search_index_queue")).toBe(rows[0]?.n);
    });
  });
});
