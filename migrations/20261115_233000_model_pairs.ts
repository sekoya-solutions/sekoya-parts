import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

// The index the part finder reads models from (issue #155): by brand, then
// appliance type, for a brand's types with their counts and a pair's models.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "appliance_models_brand_type_idx" ON "appliance_models" USING btree ("brand_id","appliance_type");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "appliance_models_brand_type_idx";`);
}
