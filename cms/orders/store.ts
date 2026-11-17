// The checkout's writes to the orders table (issue #187), and its reads of
// the draft or order a checkout cookie names. Plain SQL over Payload's own
// tables (cms/collections/orders.ts), as cms/accounts/saved-addresses.ts
// does for addresses:
// - a draft is found by the SHA-256 of the cookie's token, never by an id a
//   form sends, so no visitor reaches another's draft;
// - placing locks the draft's row first, in one transaction, so two
//   "Place order" from a double click or two tabs place it once: the second
//   waits, then finds it placed;
// - the number comes from the order_numbers sequence, so two orders never
//   share one.
// A draft or an order is read only for CHECKOUT_SECONDS after the last form
// sent, the cookie's lifetime, whatever the cookie's own expiry says.
import { randomBytes } from "node:crypto";
import {
  CHECKOUT_SECONDS,
  type DeliveryChoice,
  type DeliveryMethod,
  orderNumber,
} from "../../site/checkout-rules.ts";
import { pickupPoint } from "../../site/pickup-points.ts";
import { isCountry, type SavedAddress } from "../../site/saved-addresses.ts";
import type { Client, Pool } from "../accounts/saved-addresses.ts";
import type { Locale } from "../locales.ts";

/** An order line as placed: the catalog's values at that moment. */
export type PlacedLine = {
  product: number;
  reference: string;
  name: string;
  unitCents: number;
  quantity: number;
};

/** The amounts placed with an order, computed on the server. */
export type PlacedTotals = {
  promotionCode: string | null;
  subtotalCents: number;
  discountCents: number;
  deliveryCents: number;
  totalCents: number;
};

/** A draft or an order as the checkout pages read it. */
export type StoredCheckout = {
  id: number;
  status: "draft" | "placed";
  locale: Locale;
  customerId: number | null;
  choice: DeliveryChoice;
  number: string | null;
  lines: PlacedLine[];
  totals: PlacedTotals | null;
  placedAt: string | null;
};

type Row = {
  id: number;
  status: "draft" | "placed";
  locale: Locale;
  customer_id: number | null;
  number: string | null;
  address_name: string;
  address_line1: string;
  address_line2: string | null;
  address_postal_code: string;
  address_city: string;
  address_country: string;
  delivery_method: DeliveryMethod;
  pickup_point: string | null;
  promotion_code: string | null;
  subtotal_cents: string | null;
  discount_cents: string | null;
  delivery_cents: string | null;
  total_cents: string | null;
  placed_at: Date | null;
};

const COLUMNS = `id, status, locale, customer_id, number,
  address_name, address_line1, address_line2, address_postal_code,
  address_city, address_country, delivery_method, pickup_point,
  promotion_code, subtotal_cents, discount_cents, delivery_cents,
  total_cents, placed_at`;

/** Whether a row was changed within the cookie's lifetime. */
const FRESH = `updated_at > now() - make_interval(secs => ${CHECKOUT_SECONDS})`;

function toStored(row: Row, lines: PlacedLine[]): StoredCheckout | null {
  if (!isCountry(row.address_country)) return null;
  const address: SavedAddress = {
    label: "",
    name: row.address_name,
    line1: row.address_line1,
    line2: row.address_line2 ?? "",
    postalCode: row.address_postal_code,
    city: row.address_city,
    country: row.address_country,
  };
  const point =
    row.delivery_method === "pickup" ? pickupPoint(row.pickup_point) : null;
  return {
    id: row.id,
    status: row.status,
    locale: row.locale,
    customerId: row.customer_id,
    choice: { address, method: row.delivery_method, point },
    number: row.number,
    lines,
    totals:
      row.total_cents === null
        ? null
        : {
            promotionCode: row.promotion_code,
            subtotalCents: Number(row.subtotal_cents),
            discountCents: Number(row.discount_cents),
            deliveryCents: Number(row.delivery_cents),
            totalCents: Number(row.total_cents),
          },
    placedAt: row.placed_at ? row.placed_at.toISOString() : null,
  };
}

type Queryable = Pick<Client, "query">;

async function readLines(db: Queryable, id: number): Promise<PlacedLine[]> {
  const { rows } = await db.query<{
    product: string;
    reference: string;
    name: string;
    unit_cents: string;
    quantity: string;
  }>(
    `SELECT product, reference, name, unit_cents, quantity
       FROM orders_lines WHERE _parent_id = $1 ORDER BY _order`,
    [id],
  );
  return rows.map((row) => ({
    product: Number(row.product),
    reference: row.reference,
    name: row.name,
    unitCents: Number(row.unit_cents),
    quantity: Number(row.quantity),
  }));
}

/**
 * The draft or order a token's hash names, if a checkout form was sent for
 * it within the cookie's lifetime.
 */
export async function readCheckout(
  db: Queryable,
  hash: string,
): Promise<StoredCheckout | null> {
  const { rows } = await db.query<Row>(
    `SELECT ${COLUMNS} FROM orders WHERE token_hash = $1 AND ${FRESH}`,
    [hash],
  );
  const row = rows[0];
  if (!row) return null;
  return toStored(
    row,
    row.status === "placed" ? await readLines(db, row.id) : [],
  );
}

const choiceValues = (choice: DeliveryChoice) => [
  choice.address.name,
  choice.address.line1,
  choice.address.line2 || null,
  choice.address.postalCode,
  choice.address.city,
  choice.address.country,
  choice.method,
  choice.point?.id ?? null,
  choice.point?.city ?? null,
  choice.point?.postalCode ?? null,
];

/** Whether an error is the orders_cap trigger's refusal. */
const isCapError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: unknown }).code === "23514" &&
  String((error as { message?: unknown }).message).includes("orders_cap");

/**
 * - saved: the draft was created or updated;
 * - placed: the token names an order already placed, so the route starts a
 *   new draft under a new token;
 * - closed: MAX_ORDERS orders are stored.
 */
export type DraftOutcome = "saved" | "placed" | "closed";

/** Creates or updates the draft a token's hash names, with the first step's answers. */
export async function saveDraft(
  db: Queryable,
  hash: string,
  draft: { locale: Locale; customerId: number | null; choice: DeliveryChoice },
): Promise<DraftOutcome> {
  const values = [
    hash,
    draft.locale,
    draft.customerId,
    ...choiceValues(draft.choice),
  ];
  const updated = await db.query<{ status: string }>(
    `UPDATE orders
        SET locale = $2, customer_id = $3,
            address_name = $4, address_line1 = $5, address_line2 = $6,
            address_postal_code = $7, address_city = $8, address_country = $9,
            delivery_method = $10, pickup_point = $11, pickup_city = $12,
            pickup_postal_code = $13, updated_at = now()
      WHERE token_hash = $1 AND status = 'draft'
      RETURNING status`,
    values,
  );
  if (updated.rows.length > 0) return "saved";
  try {
    // ON CONFLICT: the hash names an order already placed.
    const inserted = await db.query(
      `INSERT INTO orders
         (token_hash, locale, customer_id, address_name, address_line1,
          address_line2, address_postal_code, address_city, address_country,
          delivery_method, pickup_point, pickup_city, pickup_postal_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (token_hash) DO NOTHING
       RETURNING id`,
      values,
    );
    return inserted.rows.length > 0 ? "saved" : "placed";
  } catch (error) {
    if (isCapError(error)) return "closed";
    throw error;
  }
}

/** What placing an order needs from the catalog, computed under the draft's lock. */
export type Placement =
  | { lines: PlacedLine[]; totals: PlacedTotals; customerId: number | null }
  | { refused: "empty" | "changed" | "choice" };

/**
 * - placed: the order was placed now, with its number;
 * - already: the token names an order placed before, a double click's second
 *   request: nothing changes;
 * - expired: no draft within the cookie's lifetime;
 * - the refusals of `compute`.
 */
export type PlaceOutcome =
  | { outcome: "placed" | "already"; number: string }
  | { outcome: "expired" | "empty" | "changed" | "choice" };

const newLineId = (): string => randomBytes(12).toString("hex");

async function place(
  client: Client,
  hash: string,
  compute: (draft: StoredCheckout) => Promise<Placement>,
): Promise<{ result: PlaceOutcome; commit: boolean }> {
  const { rows } = await client.query<Row>(
    `SELECT ${COLUMNS} FROM orders
      WHERE token_hash = $1 AND ${FRESH} FOR UPDATE`,
    [hash],
  );
  const row = rows[0];
  const stored = row ? toStored(row, []) : null;
  if (!row || !stored) return { result: { outcome: "expired" }, commit: false };
  if (row.status === "placed" && row.number)
    return {
      result: { outcome: "already", number: row.number },
      commit: false,
    };
  const placement = await compute(stored);
  if ("refused" in placement)
    return { result: { outcome: placement.refused }, commit: false };

  const sequence = await client.query<{ n: string }>(
    "SELECT nextval('order_numbers') AS n",
  );
  const number = orderNumber(Number(sequence.rows[0]?.n));
  const { totals } = placement;
  await client.query(
    `UPDATE orders
        SET status = 'placed', number = $2, customer_id = $3,
            promotion_code = $4, subtotal_cents = $5, discount_cents = $6,
            delivery_cents = $7, total_cents = $8,
            placed_at = now(), updated_at = now()
      WHERE id = $1`,
    [
      row.id,
      number,
      placement.customerId,
      totals.promotionCode,
      totals.subtotalCents,
      totals.discountCents,
      totals.deliveryCents,
      totals.totalCents,
    ],
  );
  for (const [index, line] of placement.lines.entries())
    await client.query(
      `INSERT INTO orders_lines
         (_order, _parent_id, id, product, reference, name, unit_cents, quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        index + 1,
        row.id,
        newLineId(),
        line.product,
        line.reference,
        line.name,
        line.unitCents,
        line.quantity,
      ],
    );
  return { result: { outcome: "placed", number }, commit: true };
}

/**
 * Places the draft a token's hash names, under its row's lock. `compute`
 * reads the cart against the catalog and refuses when there is nothing to
 * order or the total is not the one the visitor saw.
 */
export async function placeOrder(
  pool: Pool,
  hash: string,
  compute: (draft: StoredCheckout) => Promise<Placement>,
): Promise<PlaceOutcome> {
  const client = await pool.connect();
  let outcome: { result: PlaceOutcome; commit: boolean };
  try {
    await client.query("BEGIN");
    outcome = await place(client, hash, compute);
    await client.query(outcome.commit ? "COMMIT" : "ROLLBACK");
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
  return outcome.result;
}
