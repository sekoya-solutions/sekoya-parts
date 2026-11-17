// The demo orders' purge (issue #187, docs/adr/0014-customer-accounts.md),
// run by the daily cron with the accounts' purge (cms/accounts/endpoint.ts):
// - a draft never placed, 24 hours after the last checkout form sent for it;
// - a guest's order, 30 days after it was placed. An account's orders go
//   with the account instead, deleted by the customer_orders_delete trigger
//   (migrations/20261117_120000_customer_orders.ts, issue #188).
// Their lines go with them through the foreign key's ON DELETE CASCADE
// (migrations/20261117_075041_orders.ts).
import {
  DRAFT_RETENTION_HOURS,
  ORDER_RETENTION_DAYS,
} from "../../site/checkout-rules.ts";
import type { Query } from "../sales/rotation.ts";

const HOUR_MS = 60 * 60 * 1000;

/** The moments before which a draft and a guest's order expire. */
export const orderCutoffs = (now: Date) => ({
  draft: new Date(now.getTime() - DRAFT_RETENTION_HOURS * HOUR_MS),
  placed: new Date(now.getTime() - ORDER_RETENTION_DAYS * 24 * HOUR_MS),
});

/** Deletes the expired drafts and guests' orders, and returns how many of each. */
export async function purgeOrders(
  db: Query,
  now: Date,
): Promise<{ drafts: number; orders: number }> {
  const cutoffs = orderCutoffs(now);
  const { rows } = await db.query<{ status: "draft" | "placed" }>(
    `DELETE FROM orders
      WHERE (status = 'draft' AND updated_at < $1)
         OR (status = 'placed' AND customer_id IS NULL AND placed_at < $2)
      RETURNING status`,
    [cutoffs.draft, cutoffs.placed],
  );
  return {
    drafts: rows.filter((row) => row.status === "draft").length,
    orders: rows.filter((row) => row.status === "placed").length,
  };
}
