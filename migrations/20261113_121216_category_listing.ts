import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

// The index category pages read their products from, by category in
// reference order (issue #81).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "category_reference_idx" ON "products" USING btree ("category_id","reference");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "category_reference_idx";`);
}
