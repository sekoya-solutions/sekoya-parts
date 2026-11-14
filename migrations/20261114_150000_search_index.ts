// The search index's queue and state (docs/adr/0010-search.md, issue #115).
// Project tables, written by hand like the other project tables' migrations.
//
// - search_index_queue: products whose Algolia record must be sent again,
//   written by Payload's hooks inside the save's own transaction, so a
//   rolled-back save queues nothing and a committed one is never lost.
// - search_index_state: the products each environment's index holds, as last
//   sent. A Neon branch reset copies another environment's rows, which this
//   environment ignores, so its index is then rebuilt.
//
// Neither references a catalog table, so queued deletions survive the
// product's deletion; scripts/generate.ts empties both when it reloads.
import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- Each queuing takes a new version, so a run removes only the rows it
    -- sent, not one queued again meanwhile.
    CREATE SEQUENCE "search_index_queue_version";
    CREATE TABLE "search_index_queue" (
      "product_id" integer PRIMARY KEY,
      "version" bigint NOT NULL
    );

    CREATE TABLE "search_index_state" (
      "environment" varchar NOT NULL
        CHECK ("environment" IN ('production', 'preview', 'dev')),
      "product_id" integer NOT NULL,
      CONSTRAINT "search_index_state_pkey" PRIMARY KEY ("environment", "product_id")
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "search_index_state";
    DROP TABLE "search_index_queue";
    DROP SEQUENCE "search_index_queue_version";
  `);
}
