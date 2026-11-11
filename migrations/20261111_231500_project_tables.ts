// The project's own tables, which Payload does not manage
// (docs/adr/0006-content-management.md, docs/adr/0007-catalog-data-model.md).
// Written by hand: Payload generates migrations only for its collections.
// The generator assigns the model ids, so they are plain integers.
import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "appliance_models" (
      "id" integer PRIMARY KEY,
      "brand_id" integer NOT NULL REFERENCES "brands" ("id") ON DELETE RESTRICT,
      "reference" varchar NOT NULL,
      "appliance_type" varchar NOT NULL,
      CONSTRAINT "appliance_models_brand_reference_unique" UNIQUE ("brand_id", "reference")
    );

    -- Popularity rank 1 is the most popular. The key, product then rank, serves
    -- the product page; the second index, model then product, serves the model page.
    CREATE TABLE "compatibility" (
      "product_id" integer NOT NULL REFERENCES "products" ("id") ON DELETE CASCADE,
      "rank" integer NOT NULL CHECK ("rank" >= 1),
      "model_id" integer NOT NULL REFERENCES "appliance_models" ("id") ON DELETE CASCADE,
      CONSTRAINT "compatibility_pkey" PRIMARY KEY ("product_id", "rank"),
      CONSTRAINT "compatibility_model_product_unique" UNIQUE ("model_id", "product_id")
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "compatibility";
    DROP TABLE "appliance_models";
  `);
}
