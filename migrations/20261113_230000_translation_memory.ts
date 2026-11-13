// The translation memory and the run lease of the translation sweep
// (issue #104). Project tables, written by hand like
// 20261111_231500_project_tables.ts. No catalog table references them and
// scripts/generate.ts does not list them in its TRUNCATE, so a catalog
// reload keeps every translation already paid for.
import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- One DeepL translation of one French text into one language, keyed by
    -- the SHA-256 hash of the French text, in hexadecimal.
    CREATE TABLE "translation_memory" (
      "locale" varchar NOT NULL,
      "source_hash" char(64) NOT NULL CHECK ("source_hash" ~ '^[0-9a-f]{64}$'),
      "translation" text NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "translation_memory_pkey" PRIMARY KEY ("locale", "source_hash")
    );

    -- A single row: the time until which a running sweep holds the lease.
    CREATE TABLE "translation_lease" (
      "id" integer PRIMARY KEY CHECK ("id" = 1),
      "held_until" timestamptz NOT NULL
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "translation_lease";
    DROP TABLE "translation_memory";
  `);
}
