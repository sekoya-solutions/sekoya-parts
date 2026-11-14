// The index settings each environment's Algolia index last received
// (docs/adr/0010-search.md, issue #119): a fingerprint of indexSettings
// (site/algolia.ts), so a reconcile run applies changed settings to an index
// that already exists, with no step by hand. A project table, written by hand
// like the other search index tables.
import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "search_index_settings" (
      "environment" varchar PRIMARY KEY
        CHECK ("environment" IN ('production', 'preview', 'dev')),
      "fingerprint" varchar NOT NULL
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE "search_index_settings";`);
}
