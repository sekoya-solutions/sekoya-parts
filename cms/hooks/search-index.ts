// Queues the Algolia records a save changes (docs/adr/0010-search.md, issue
// #115), inside the save's own transaction, then sends the queue once the
// response is sent. If that send fails or never runs, the queue stays, and
// the daily cron or the next build sends it (cms/search-index/sync.ts).
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { after } from "next/server";
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  Payload,
  PayloadRequest,
} from "payload";
import { writeConnectionFromEnvironment } from "../../site/algolia.ts";
import {
  queueBrand,
  queueCategory,
  queueProducts,
  reconcile,
} from "../search-index/sync.ts";

/** The save's transaction, so a rolled-back save queues nothing. */
async function transactionOf(req: PayloadRequest) {
  const adapter = req.payload.db as unknown as PostgresAdapter;
  const id = req.transactionID ? await req.transactionID : undefined;
  const session = id === undefined ? undefined : adapter.sessions[String(id)];
  return session ? session.db : adapter.drizzle;
}

/** Sends the queue now, if this environment has an index. */
export async function sendQueue(payload: Payload): Promise<void> {
  const connection = writeConnectionFromEnvironment(process.env);
  if (!connection) return;
  const adapter = payload.db as unknown as PostgresAdapter;
  await reconcile(adapter.drizzle, connection);
}

/**
 * Sends the queue after the response, in a Next.js request. Outside one (a
 * script or a test), after() throws, and the queue waits for the cron.
 */
function sendAfterResponse(payload: Payload): void {
  try {
    after(() =>
      sendQueue(payload).catch((error: unknown) => {
        console.error("Search index: the queue stays for the cron.", error);
      }),
    );
  } catch {
    // Not in a request: the daily cron or the next build sends the queue.
  }
}

export const queueProductAfterChange: CollectionAfterChangeHook = async ({
  doc,
  req,
}) => {
  await queueProducts(await transactionOf(req), [doc.id]);
  sendAfterResponse(req.payload);
  return doc;
};

export const queueProductAfterDelete: CollectionAfterDeleteHook = async ({
  id,
  req,
}) => {
  await queueProducts(await transactionOf(req), [Number(id)]);
  sendAfterResponse(req.payload);
};

// A brand's name is in its products' names. Its slug is not in the records.
export const queueBrandAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (operation === "update" && doc.name !== previousDoc?.name) {
    await queueBrand(await transactionOf(req), doc.id);
    sendAfterResponse(req.payload);
  }
  return doc;
};

// A category's name and slug, in the saved language, are in its products'
// names and addresses.
export const queueCategoryAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (
    operation === "update" &&
    (doc.name !== previousDoc?.name || doc.slug !== previousDoc?.slug)
  ) {
    await queueCategory(await transactionOf(req), doc.id);
    sendAfterResponse(req.payload);
  }
  return doc;
};
