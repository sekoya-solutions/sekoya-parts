// GET /api/accounts/purge (issue #177, docs/adr/0014-customer-accounts.md):
// the daily deletion of demo accounts 30 days after their last sign-in, and
// since issue #187 of the drafts and guests' orders that expired
// (cms/orders/purge.ts), so the shop needs no other cron.
// Vercel's cron calls it with `Authorization: Bearer <CRON_SECRET>`
// (vercel.json); a signed-in editor can open it to run it at once. Anyone
// else gets 401, a signed-in customer included.
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { Endpoint } from "payload";
import { purgeOrders } from "../orders/purge.ts";
import { mayRun } from "../translation/endpoint.ts";
import { purgeAccounts } from "./purge.ts";

export const ACCOUNT_PURGE_PATH = "/accounts/purge";

export const accountPurgeEndpoint: Endpoint = {
  path: ACCOUNT_PURGE_PATH,
  method: "get",
  handler: async (req) => {
    const allowed = mayRun(
      { user: req.user, authorization: req.headers.get("authorization") },
      process.env.CRON_SECRET,
    );
    if (!allowed)
      return Response.json({ message: "Unauthorized." }, { status: 401 });

    const adapter = req.payload.db as unknown as PostgresAdapter;
    const now = new Date();
    const deleted = await purgeAccounts(adapter.pool, now);
    const orders = await purgeOrders(adapter.pool, now);
    req.payload.logger.info({ msg: "Account purge", deleted, ...orders });
    return Response.json({ deleted, ...orders });
  },
};
