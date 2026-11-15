import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

// The index category pages sorted by price read from (issue #148): by
// category, then price, then reference, which breaks ties, so a page of 48
// is read in order without sorting the category's few thousand products.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "category_price_idx" ON "products" USING btree ("category_id","price_cents","reference");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "category_price_idx";`);
}
