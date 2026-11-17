// Writes to a demo account's saved addresses (issue #178), the rows of
// customers_addresses that Payload's addresses array reads back.
//
// Each write runs in one transaction that first locks the account's row, so
// two writes to one account, from two tabs, run one after the other: the
// second sees the first's rows, and the cap of MAX_ADDRESSES holds. Payload's
// own update rewrites the whole array, so two of them at once could lose an
// address or pass the cap; the admin's path has maxRows instead.
//
// An edit or a removal names an address and its account together, so an
// account can never reach another's address.
import { randomBytes } from "node:crypto";
import {
  MAX_ADDRESSES,
  type SavedAddress,
} from "../../site/saved-addresses.ts";

/** A connection that can hold a transaction: a pg Pool's client. */
export type Client = {
  query<R>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
  /** true destroys the connection instead of returning it to the pool. */
  release(destroy?: boolean): void;
};

export type Pool = { connect(): Promise<Client> };

export type AddressWrite =
  | { kind: "add"; address: SavedAddress }
  | { kind: "edit"; id: string; address: SavedAddress }
  | { kind: "remove"; id: string };

export type AddressOutcome =
  | "saved"
  | "removed"
  | "full"
  | "missing"
  | "no-account";

/** An address's id, in the 24 hexadecimal digits Payload gives array rows. */
export const newAddressId = (): string => randomBytes(12).toString("hex");

const values = (address: SavedAddress) => [
  address.label || null,
  address.name,
  address.line1,
  address.line2 || null,
  address.postalCode,
  address.city,
  address.country,
];

async function apply(
  client: Client,
  customerId: number,
  write: AddressWrite,
): Promise<AddressOutcome> {
  const account = await client.query(
    "SELECT id FROM customers WHERE id = $1 FOR UPDATE",
    [customerId],
  );
  if (account.rows.length === 0) return "no-account";

  if (write.kind === "add") {
    const { rows } = await client.query<{ count: number; last: number }>(
      `SELECT count(*)::int AS count, coalesce(max(_order), 0)::int AS last
         FROM customers_addresses WHERE _parent_id = $1`,
      [customerId],
    );
    const { count = 0, last = 0 } = rows[0] ?? {};
    if (count >= MAX_ADDRESSES) return "full";
    await client.query(
      `INSERT INTO customers_addresses
         (_order, _parent_id, id, label, name, line1, line2, postal_code, city, country)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [last + 1, customerId, newAddressId(), ...values(write.address)],
    );
    return "saved";
  }

  if (write.kind === "edit") {
    const { rowCount } = await client.query(
      `UPDATE customers_addresses
          SET label = $3, name = $4, line1 = $5, line2 = $6,
              postal_code = $7, city = $8, country = $9
        WHERE id = $1 AND _parent_id = $2`,
      [write.id, customerId, ...values(write.address)],
    );
    return rowCount ? "saved" : "missing";
  }

  const { rowCount } = await client.query(
    "DELETE FROM customers_addresses WHERE id = $1 AND _parent_id = $2",
    [write.id, customerId],
  );
  return rowCount ? "removed" : "missing";
}

/** Applies one write to an account's addresses, under the account's lock. */
export async function writeAddress(
  pool: Pool,
  customerId: number,
  write: AddressWrite,
): Promise<AddressOutcome> {
  const client = await pool.connect();
  let outcome: AddressOutcome;
  try {
    await client.query("BEGIN");
    outcome = await apply(client, customerId, write);
    if (outcome === "saved" || outcome === "removed") {
      await client.query(
        "UPDATE customers SET updated_at = now() WHERE id = $1",
        [customerId],
      );
      await client.query("COMMIT");
    } else await client.query("ROLLBACK");
  } catch (error) {
    // A client whose rollback fails too is destroyed rather than returned
    // to the pool in an open transaction.
    const rolledBack = await client.query("ROLLBACK").then(
      () => true,
      () => false,
    );
    client.release(!rolledBack);
    throw error;
  }
  client.release();
  return outcome;
}
