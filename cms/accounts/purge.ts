// The demo accounts' purge (issue #177, docs/adr/0014-customer-accounts.md):
// an account is deleted 30 days after its last sign-in, or after its
// creation when it never signed in, such as one an editor created. Its
// sessions, and its rows in Payload's own tables, go with it through their
// foreign keys' ON DELETE CASCADE (migrations/20261116_201311_customers.ts).
import { ACCOUNT_RETENTION_DAYS } from "../../site/account-rules.ts";
import type { Query } from "../sales/rotation.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The moment before which an account's last sign-in makes it expire. */
export const purgeCutoff = (now: Date): Date =>
  new Date(now.getTime() - ACCOUNT_RETENTION_DAYS * DAY_MS);

/** Deletes the expired accounts and returns how many it deleted. */
export async function purgeAccounts(db: Query, now: Date): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `DELETE FROM customers
      WHERE coalesce(last_sign_in_at, created_at) < $1
      RETURNING id`,
    [purgeCutoff(now)],
  );
  return rows.length;
}
