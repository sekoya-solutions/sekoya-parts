import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

// The index brand pages read their products from, by brand in reference
// order (issue #147), like category_reference_idx for the category pages.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "brand_reference_idx" ON "products" USING btree ("brand_id","reference");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "brand_reference_idx";`);
}
