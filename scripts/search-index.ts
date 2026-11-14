// Brings this environment's Algolia index in step with its database
// (cms/search-index/sync.ts, issue #115). Production and Preview builds run
// it after the migrations (scripts/build.js), so a reset branch or a reloaded
// catalog refills its index with no step by hand; locally, `npm run
// search-index` does the same for dev, and `-- --all` sends every record again.
// Run through Payload's command line: payload run <this file>.
//
// An Algolia failure does not fail the build: the previous records stay
// searchable, the queue keeps what was not sent, and the daily cron retries.
import config from "@payload-config";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { getPayload } from "payload";
import { reconcile } from "../cms/search-index/sync.ts";
import {
  AlgoliaError,
  writeConnectionFromEnvironment,
} from "../site/algolia.ts";

const connection = writeConnectionFromEnvironment(process.env);
if (!connection) {
  console.log("Search index: skipped, Algolia is not set up here.");
  process.exit(0);
}

const payload = await getPayload({ config });
try {
  const adapter = payload.db as unknown as PostgresAdapter;
  const started = performance.now();
  const result = await reconcile(adapter.drizzle, connection, {
    all: process.argv.includes("--all"),
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `Search index ${result.index}: ${result.sent} sent, ${result.deleted} deleted, ${result.requests} requests${result.rebuilt ? ", rebuilt" : ""}, in ${seconds} s.`,
  );
} catch (error) {
  if (!(error instanceof AlgoliaError)) throw error;
  console.warn(`Search index: not updated, the cron retries. ${error.message}`);
} finally {
  await payload.destroy();
}
process.exit(0);
