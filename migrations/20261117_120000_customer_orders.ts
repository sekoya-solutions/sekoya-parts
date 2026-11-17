// An account's orders go with the account (issue #188, ADR 0014): a trigger
// deletes them, drafts included, before the customers row is deleted, so
// "Delete my account", the daily purge (cms/accounts/purge.ts) and an
// editor's deletion in the admin all take them. Their lines go with them
// through orders_lines' ON DELETE CASCADE.
//
// A trigger rather than a cascading foreign key (owner decision,
// 2026-11-17): Payload's generated schema gives orders.customer_id
// ON DELETE SET NULL, and a later generated migration would set it back.
// Triggers are outside that schema, like orders_cap. Written by hand, with no
// schema snapshot, since the generated schema does not change.
// tests/orders-db.test.ts checks it.
import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE FUNCTION customer_orders_delete() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     DELETE FROM orders WHERE customer_id = OLD.id;
     RETURN OLD;
   END $$;
   CREATE TRIGGER customer_orders_delete BEFORE DELETE ON customers
     FOR EACH ROW EXECUTE FUNCTION customer_orders_delete();`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TRIGGER customer_orders_delete ON customers;
   DROP FUNCTION customer_orders_delete();`);
}
