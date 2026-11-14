// Keeps an environment's Algolia index in step with the catalog
// (docs/adr/0010-search.md, issue #115), in the project's own tables
// (migrations/20261114_150000_search_index.ts).
//
// - Payload's hooks queue the products a save changes, inside the save's
//   transaction (queueProducts and the like).
// - reconcile sends what the index lacks: the queued products, the products
//   selected but not yet sent, and the deletion of those no longer selected.
//   It runs after each save's response, on every Production and Preview
//   build, and from the daily cron, so a failed call is sent again later.
//
// Runs are serialised by an advisory lock, so two never send different
// versions of a record out of order. A queued row is removed only if it was
// not queued again meanwhile (its version is unchanged), so a save committed
// during a run is sent by the next one.
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";
import {
  applySettings,
  BATCH_SIZE,
  type BatchRequest,
  type IndexConnection,
  listObjectIds,
  sendBatch,
} from "../../site/algolia.ts";
import {
  buildRecord,
  INDEX_CAPACITY,
  RECORD_MODEL_REFERENCES,
  type RecordInput,
  selectIndexed,
} from "../../site/algolia-record.ts";

type Drizzle = PostgresAdapter["drizzle"];
type Execute = Pick<Drizzle, "execute">;

/** The advisory lock key of reconcile runs: an arbitrary constant. */
export const RECONCILE_LOCK = 115_001;

/** An int[] literal; ids are checked to be integers, so nothing is injected. */
function intArray(ids: readonly number[]): string {
  for (const id of ids) {
    if (!Number.isSafeInteger(id)) throw new Error(`Not an id: ${id}`);
  }
  return `{${ids.join(",")}}`;
}

/** Queues products, or queues them again with a new version. */
export async function queueProducts(
  db: Execute,
  ids: readonly number[],
): Promise<void> {
  if (ids.length === 0) return;
  await db.execute(sql`
    INSERT INTO search_index_queue (product_id, version)
    SELECT id, nextval('search_index_queue_version')
    FROM unnest(${intArray(ids)}::int[]) AS id
    ON CONFLICT (product_id) DO UPDATE SET version = EXCLUDED.version`);
}

/** Queues every product of a brand, whose name is in their records. */
export async function queueBrand(db: Execute, brandId: number): Promise<void> {
  await db.execute(sql`
    INSERT INTO search_index_queue (product_id, version)
    SELECT id, nextval('search_index_queue_version')
    FROM products WHERE brand_id = ${brandId}
    ON CONFLICT (product_id) DO UPDATE SET version = EXCLUDED.version`);
}

/** Queues every product of a category, whose names and slugs are in their records. */
export async function queueCategory(
  db: Execute,
  categoryId: number,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO search_index_queue (product_id, version)
    SELECT id, nextval('search_index_queue_version')
    FROM products WHERE category_id = ${categoryId}
    ON CONFLICT (product_id) DO UPDATE SET version = EXCLUDED.version`);
}

type InputRow = {
  id: number;
  reference: string;
  brand: string;
  category_id: number;
  price_cents: number;
  showcase: boolean;
  category_names: Record<string, string>;
  category_slugs: Record<string, string>;
  showcase_names: Record<string, string> | null;
  models: string[];
};

/** What the records of these products are built from, read in one query. */
export async function readRecordInputs(
  db: Execute,
  ids: readonly number[],
): Promise<RecordInput[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.execute<InputRow>(sql`
    SELECT p.id, p.reference, b.name AS brand, p.category_id,
      p.price_cents::float8 AS price_cents,
      coalesce(p.showcase, false) AS showcase,
      (SELECT json_object_agg(cl._locale, cl.name) FROM categories_locales cl
        WHERE cl._parent_id = p.category_id) AS category_names,
      (SELECT json_object_agg(cl._locale, cl.slug) FROM categories_locales cl
        WHERE cl._parent_id = p.category_id) AS category_slugs,
      CASE WHEN p.showcase THEN
        (SELECT json_object_agg(pl._locale, pl.name) FROM products_locales pl
          WHERE pl._parent_id = p.id AND pl.name IS NOT NULL)
      END AS showcase_names,
      ARRAY(SELECT m.reference FROM compatibility c
        JOIN appliance_models m ON m.id = c.model_id
        WHERE c.product_id = p.id AND c.rank <= ${RECORD_MODEL_REFERENCES}
        ORDER BY c.rank) AS models
    FROM products p JOIN brands b ON b.id = p.brand_id
    WHERE p.id = ANY(${intArray(ids)}::int[])
    ORDER BY p.id`);
  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    brand: row.brand,
    categoryId: row.category_id,
    priceCents: row.price_cents,
    showcase: row.showcase,
    showcaseNames: row.showcase_names,
    categoryNames: row.category_names ?? {},
    categorySlugs: row.category_slugs ?? {},
    modelReferences: row.models,
  }));
}

export type ReconcileResult = {
  index: string;
  /** Whether the index's content was read from Algolia, its state being unknown. */
  rebuilt: boolean;
  sent: number;
  deleted: number;
  requests: number;
};

const chunk = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

/**
 * Brings the connection's index in step with the database. With `all`, every
 * selected product is sent again, as after a catalog reload.
 */
export async function reconcile(
  drizzle: Pick<Drizzle, "transaction">,
  connection: IndexConnection,
  options: {
    all?: boolean;
    /** Tests only: a smaller index than the environment's. */
    capacity?: number;
  } = {},
): Promise<ReconcileResult> {
  const { environment, index } = connection;
  return drizzle.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${RECONCILE_LOCK})`);

    const queued = (
      await tx.execute<{ product_id: number; version: string }>(sql`
        SELECT product_id, version::text FROM search_index_queue`)
    ).rows;
    const products = (
      await tx.execute<{ id: number; showcase: boolean }>(sql`
        SELECT id, coalesce(showcase, false) AS showcase FROM products`)
    ).rows;
    const selected = new Set(
      selectIndexed(products, options.capacity ?? INDEX_CAPACITY[environment]),
    );
    const state = new Set(
      (
        await tx.execute<{ product_id: number }>(sql`
          SELECT product_id FROM search_index_state
          WHERE environment = ${environment}`)
      ).rows.map((row) => row.product_id),
    );

    // No state for this environment: a new index, a branch reset from
    // another environment, or a reloaded catalog. Its content is read from
    // Algolia, and every selected product is sent again.
    const rebuilt = state.size === 0;
    let requests = 0;
    let held = state;
    if (rebuilt) {
      await applySettings(connection);
      held = new Set((await listObjectIds(connection)).map(Number));
      requests += 1 + Math.max(1, Math.ceil(held.size / 1000));
    }

    const queuedIds = new Set(queued.map((row) => row.product_id));
    const resend = options.all || rebuilt;
    const toSend = [...selected].filter(
      (id) => resend || queuedIds.has(id) || !held.has(id),
    );
    const toDelete = [...held].filter((id) => !selected.has(id));

    for (const ids of chunk(toSend, BATCH_SIZE)) {
      const inputs = await readRecordInputs(tx, ids);
      const batch: BatchRequest[] = inputs.map((input) => ({
        action: "addObject",
        body: buildRecord(input),
      }));
      await sendBatch(connection, batch);
      requests++;
    }
    for (const ids of chunk(toDelete, BATCH_SIZE)) {
      await sendBatch(
        connection,
        ids.map((id) => ({
          action: "deleteObject",
          body: { objectID: String(id) },
        })),
      );
      requests++;
    }

    // The state becomes the selection, which the index now holds.
    if (toDelete.length > 0) {
      await tx.execute(sql`
        DELETE FROM search_index_state WHERE environment = ${environment}
          AND product_id = ANY(${intArray(toDelete)}::int[])`);
    }
    const added = [...selected].filter((id) => !state.has(id));
    for (const ids of chunk(added, 10_000)) {
      await tx.execute(sql`
        INSERT INTO search_index_state (environment, product_id)
        SELECT ${environment}, unnest(${intArray(ids)}::int[])
        ON CONFLICT DO NOTHING`);
    }
    // Rows queued again during the run keep their new version, and stay.
    for (const rows of chunk(queued, 10_000)) {
      await tx.execute(sql`
        DELETE FROM search_index_queue q
        USING unnest(
          ${intArray(rows.map((r) => r.product_id))}::int[],
          ${`{${rows.map((r) => r.version).join(",")}}`}::bigint[]
        ) AS done(product_id, version)
        WHERE q.product_id = done.product_id AND q.version = done.version`);
    }

    return {
      index,
      rebuilt,
      sent: toSend.length,
      deleted: toDelete.length,
      requests,
    };
  });
}
