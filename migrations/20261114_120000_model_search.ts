// The model search index (docs/adr/0010-search.md, issue #113): a B-tree on
// the model reference in upper case without spaces or dashes, the form
// site/search-key.ts compares queries in. The text_pattern_ops operator class
// lets it serve LIKE 'prefix%' whatever the database's collation. The expression
// here and MODEL_SEARCH_KEY in site/search-key.ts must stay identical, or the
// planner cannot use the index; tests/model-search.test.ts checks it does.
// Written by hand, like the other project tables' migrations.
import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE INDEX "appliance_models_search_key_idx"
      ON "appliance_models" ((upper(translate("reference", '- ', ''))) text_pattern_ops);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX "appliance_models_search_key_idx";
  `);
}
