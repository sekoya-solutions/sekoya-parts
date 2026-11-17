// The mock checkout's rules (issue #187): what its forms may send, the
// delivery methods and their prices, the draft's cookie and the caps. Shared
// by the checkout route, the checkout pages, Payload's orders collection and
// the tests. Pure values and functions with no Payload or Next.js imports.
//
// Nothing is ever charged or delivered (AGENTS.md, section 1). Every amount
// is computed on the server from the catalog and "Shop settings", never
// taken from the browser: the payment form's total only lets the route
// notice that prices changed since the page was shown.
import { createHash, randomBytes } from "node:crypto";
import type { DeliverySettings } from "./cart-pricing.ts";
import { type PickupPoint, pickupPoint } from "./pickup-points.ts";
import { parseAddress, type SavedAddress } from "./saved-addresses.ts";

/** The cookie naming the visitor's draft order by a random token. */
export const CHECKOUT_COOKIE = "checkout_v1";

/**
 * How long the cookie, and the draft or order it names, can be read: 2
 * hours from the last checkout form sent, like a customer's session.
 */
export const CHECKOUT_SECONDS = 2 * 60 * 60;

/** Stored orders, drafts included, past which the checkout closes (owner decision, 2026-11-17). */
export const MAX_ORDERS = 20_000;

/** Hours after its last change at which the daily purge deletes a draft never placed. */
export const DRAFT_RETENTION_HOURS = 24;

/** Days after it was placed at which the daily purge deletes a guest's order (ADR 0014). */
export const ORDER_RETENTION_DAYS = 30;

export const DELIVERY_METHODS = ["home", "pickup"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const isDeliveryMethod = (value: unknown): value is DeliveryMethod =>
  typeof value === "string" &&
  (DELIVERY_METHODS as readonly string[]).includes(value);

/** The pickup point's price before an editor changes it (owner decision, 2026-11-17). */
export const DEFAULT_PICKUP_CENTS = 390;

/** Delivery as "Shop settings" holds it, both methods. */
export type ShopDelivery = DeliverySettings & { pickupCents: number };

/** The delivery values a method's totals use: the same free-delivery threshold. */
export const deliveryFor = (
  method: DeliveryMethod,
  shop: ShopDelivery,
): DeliverySettings => ({
  deliveryCents: method === "pickup" ? shop.pickupCents : shop.deliveryCents,
  freeDeliveryFromCents: shop.freeDeliveryFromCents,
});

/** The first step's answers, as a draft stores them. */
export type DeliveryChoice = {
  address: SavedAddress;
  method: DeliveryMethod;
  /** The pickup point, for that method only. */
  point: PickupPoint | null;
};

/**
 * Why the first step's answers are refused:
 * - address: a field is missing or wrong (the browser checks them first);
 * - method: no delivery method, or one the page does not offer;
 * - point: the pickup method with no point, or one in another country than
 *   the address's.
 */
export type DeliveryProblem = "address" | "method" | "point";

/**
 * The first step's answers from a form, or why they are refused. The address
 * comes from `address` when it is given (a signed-in customer's saved one),
 * otherwise from the form's own fields.
 */
export function parseDelivery(
  read: (name: string) => unknown,
  saved: SavedAddress | null = null,
):
  | { choice: DeliveryChoice }
  | { problem: DeliveryProblem; address: SavedAddress | null } {
  const parsed = saved ? { address: saved } : parseAddress(read);
  if (!("address" in parsed)) return { problem: "address", address: null };
  const { address } = parsed;
  const method = read("method");
  if (!isDeliveryMethod(method)) return { problem: "method", address };
  if (method === "home") return { choice: { address, method, point: null } };
  const point = pickupPoint(read("point"));
  if (!point || point.country !== address.country)
    return { problem: "point", address };
  return { choice: { address, method, point } };
}

/** A new draft's token: 32 random bytes, as the cookie holds them. */
export const newCheckoutToken = (): string =>
  randomBytes(32).toString("base64url");

/** A token as the cookie holds it: 43 base64url characters. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * What the database stores of a token: its SHA-256, so the orders table
 * alone never lets anyone read another visitor's draft. Null for a value
 * that cannot be a token.
 */
export function tokenHash(token: unknown): string | null {
  if (typeof token !== "string" || !TOKEN.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

/** An order's number from its place in the sequence: SP-000042. */
export const orderNumber = (sequence: number): string =>
  `SP-${String(sequence).padStart(6, "0")}`;

/** An order number as orderNumber writes it, read from an address. */
const ORDER_NUMBER = /^SP-\d{6,}$/;

/** The order number an address names, or null for any other value. */
export const parseOrderNumber = (value: unknown): string | null =>
  typeof value === "string" && ORDER_NUMBER.test(value) ? value : null;

/**
 * The day an order was placed, in the page's language and in the Europe/Paris
 * time zone, the shop's, so it reads the same whatever the server's zone.
 */
export const orderDate = (iso: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));

/**
 * What the checkout route answers, as the checkout pages' notice:
 * - address, method, point: the first step's answers were refused;
 * - empty: the cart holds nothing that can be ordered;
 * - expired: no draft, or one older than CHECKOUT_SECONDS;
 * - changed: a price, the promotion code or delivery changed since the
 *   payment page was shown, which now shows the new total;
 * - closed: MAX_ORDERS orders are stored;
 * - error: anything else.
 */
export const CHECKOUT_NOTICES = [
  "address",
  "method",
  "point",
  "empty",
  "expired",
  "changed",
  "closed",
  "error",
] as const;

export type CheckoutNotice = (typeof CHECKOUT_NOTICES)[number];

export const isCheckoutNotice = (value: unknown): value is CheckoutNotice =>
  typeof value === "string" &&
  (CHECKOUT_NOTICES as readonly string[]).includes(value);

/** The checkout pages' query parameter naming a notice. */
export const CHECKOUT_NOTICE_PARAM = "notice";

/** Where both checkout forms post: app/(site)/api/checkout/route.ts. */
export const CHECKOUT_ROUTE = "/api/checkout";

/** The first step's choice of a signed-in customer's saved address, or a new one. */
export const NEW_ADDRESS = "new";
