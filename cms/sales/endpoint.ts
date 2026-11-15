// GET /api/sales/run (issue #151): the daily sale rotation. Vercel's cron
// calls it with `Authorization: Bearer <CRON_SECRET>` (vercel.json); a
// signed-in user can open it to run it at once. Anyone else gets 401. New
// sales start at the next 00:00 UTC, so the run's time within its hour never
// matters, and their prices are refreshed before then (cms/sales/rotation.ts).
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { Endpoint } from "payload";
import { nextBoundary } from "../../site/merchandising.ts";
import { refresh } from "../hooks/refresh.ts";
import { mayRun } from "../translation/endpoint.ts";
import {
  MAX_NEW_SALES_PER_RUN,
  paced,
  rotateSales,
  rotationTags,
} from "./rotation.ts";

export const SALES_RUN_PATH = "/sales/run";

export const salesRunEndpoint: Endpoint = {
  path: SALES_RUN_PATH,
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
    const startsAt = new Date(nextBoundary(now.getTime()));
    const sales = await rotateSales(adapter.pool, {
      now,
      startsAt,
      spread: false,
      limit: MAX_NEW_SALES_PER_RUN,
    });
    const refreshed = await paced(rotationTags(sales), (tag) => refresh([tag]));
    const result = {
      added: sales.length,
      startsAt: startsAt.toISOString(),
      refreshed,
    };
    req.payload.logger.info({ msg: "Sales run", ...result });
    return Response.json(result);
  },
};
