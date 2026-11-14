// GET /api/search-index/run (issue #115): brings this environment's Algolia
// index in step with the database (cms/search-index/sync.ts). The daily
// Vercel cron calls it with `Authorization: Bearer <CRON_SECRET>`
// (vercel.json), so a send that failed after a save is retried; a signed-in
// user can open it to run it at once. Anyone else gets 401. An Algolia
// failure answers 502, so Vercel's cron log shows it.
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { Endpoint } from "payload";
import {
  AlgoliaError,
  writeConnectionFromEnvironment,
} from "../../site/algolia.ts";
import { mayRun } from "../translation/endpoint.ts";
import { reconcile } from "./sync.ts";

export const SEARCH_INDEX_RUN_PATH = "/search-index/run";

export const searchIndexRunEndpoint: Endpoint = {
  path: SEARCH_INDEX_RUN_PATH,
  method: "get",
  handler: async (req) => {
    const allowed = mayRun(
      { user: req.user, authorization: req.headers.get("authorization") },
      process.env.CRON_SECRET,
    );
    if (!allowed)
      return Response.json({ message: "Unauthorized." }, { status: 401 });

    const connection = writeConnectionFromEnvironment(process.env);
    if (!connection)
      return Response.json(
        { message: "Algolia is not set up in this environment." },
        { status: 503 },
      );
    try {
      const adapter = req.payload.db as unknown as PostgresAdapter;
      const result = await reconcile(adapter.drizzle, connection);
      req.payload.logger.info({ msg: "Search index run", ...result });
      return Response.json(result);
    } catch (error) {
      if (!(error instanceof AlgoliaError)) throw error;
      req.payload.logger.error({
        msg: "Search index run",
        error: error.message,
      });
      return Response.json({ message: error.message }, { status: 502 });
    }
  },
};
