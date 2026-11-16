// GET /api/accounts/purge (issue #177, docs/adr/0014-customer-accounts.md):
// the daily deletion of demo accounts 30 days after their last sign-in.
// Vercel's cron calls it with `Authorization: Bearer <CRON_SECRET>`
// (vercel.json); a signed-in editor can open it to run it at once. Anyone
// else gets 401, a signed-in customer included.
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { Endpoint } from "payload";
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
    const deleted = await purgeAccounts(adapter.pool, new Date());
    req.payload.logger.info({ msg: "Account purge", deleted });
    return Response.json({ deleted });
  },
};
