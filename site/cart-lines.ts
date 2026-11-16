// The cart as the server reads it (issues #168 and #169): its lines with the
// catalog's names, prices and availability, the shop's delivery values and
// the promotion code the visitor applied, all read from Payload on each
// request, never from the browser (docs/adr/0013-visitor-state.md). Shared by
// the cart page and the cart route, which checks a code against the same
// subtotal the page shows.
import config from "@payload-config";
import { type PostgresAdapter, sql } from "@payloadcms/db-postgres";
import { getPayload } from "payload";
import type { Product } from "../cms/payload-types.ts";
import type { CartLine } from "./cart.ts";
import {
  DEFAULT_DELIVERY_CENTS,
  DEFAULT_FREE_DELIVERY_FROM_CENTS,
  type DeliverySettings,
  type PromotionCode,
} from "./cart-pricing.ts";
import { type Availability, priceAt } from "./merchandising.ts";
import { type ProductRoute, readProduct } from "./product.tsx";

/** A cart line as the page shows it, with what the catalog says now. */
export type ShownLine = {
  route: ProductRoute;
  quantity: number;
  cents: number;
  formerCents: number | null;
  availability: Availability;
};

/** Whether a line can be ordered, and so counts in the subtotal. */
export const counted = (line: Pick<ShownLine, "availability">): boolean =>
  line.availability !== "out-of-stock";

/** The subtotal of the lines that can be ordered, in cents. */
export const subtotalCents = (
  lines: readonly Pick<ShownLine, "availability" | "cents" | "quantity">[],
): number =>
  lines
    .filter(counted)
    .reduce((sum, line) => sum + line.cents * line.quantity, 0);

/**
 * The cart's lines with the catalog's data, in the cart's order. A product
 * no longer in the catalog is left out.
 */
export async function readLines(
  cart: readonly CartLine[],
): Promise<ShownLine[]> {
  if (cart.length === 0) return [];
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "products",
    where: { id: { in: cart.map((line) => line.id) } },
    locale: "all",
    depth: 1,
    limit: cart.length,
    pagination: false,
  });
  const byId = new Map<number, Product>(docs.map((doc) => [doc.id, doc]));
  const now = Date.now();
  return cart.flatMap((line) => {
    const product = byId.get(line.id);
    if (!product) return [];
    const { cents, formerCents } = priceAt(product, now);
    return [
      {
        route: readProduct(product).route,
        quantity: line.quantity,
        cents,
        formerCents,
        availability: product.availability,
      },
    ];
  });
}

/** The delivery values editors set in Payload's "Shop settings". */
export async function readDelivery(): Promise<DeliverySettings> {
  const payload = await getPayload({ config });
  const settings = await payload.findGlobal({
    slug: "shop-settings",
    depth: 0,
  });
  return {
    deliveryCents: settings.deliveryCents ?? DEFAULT_DELIVERY_CENTS,
    freeDeliveryFromCents:
      settings.freeDeliveryFromCents ?? DEFAULT_FREE_DELIVERY_FROM_CENTS,
  };
}

/** How many "Complete your repair" suggestions the cart page shows. */
export const SUGGESTIONS = 4;

/** A suggestion as the cart page shows it. */
export type Suggestion = {
  route: ProductRoute;
  price: { cents: number; formerCents: number | null };
};

/**
 * "Complete your repair" (issue #169): the related products of the cart's
 * lines (catalog/related.ts), those related to the most lines first, then
 * by their best rank, leaving out what the cart holds and what cannot be
 * ordered.
 */
export async function readSuggestions(
  cart: readonly CartLine[],
): Promise<Suggestion[]> {
  if (cart.length === 0) return [];
  const payload = await getPayload({ config });
  const db = (payload.db as unknown as PostgresAdapter).drizzle;
  const inCart = cart.map((line) => line.id);
  // A few more than shown, for those out of stock.
  const { rows } = await db.execute<{ related_id: number }>(sql`
    SELECT related_id FROM related_products
     WHERE product_id IN ${inCart}
       AND related_id NOT IN ${inCart}
     GROUP BY related_id
     ORDER BY count(*) DESC, min(rank), related_id
     LIMIT ${SUGGESTIONS * 3}
  `);
  const ids = rows.map((row) => Number(row.related_id));
  if (ids.length === 0) return [];
  const { docs } = await payload.find({
    collection: "products",
    where: {
      id: { in: ids },
      availability: { not_equals: "out-of-stock" },
    },
    locale: "all",
    depth: 1,
    pagination: false,
  });
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const now = Date.now();
  return ids
    .flatMap((id) => byId.get(id) ?? [])
    .slice(0, SUGGESTIONS)
    .map((doc) => ({
      route: readProduct(doc).route,
      price: priceAt(doc, now),
    }));
}

/** A promotion code by its normalized text, or null when there is none. */
export async function readCode(code: string): Promise<PromotionCode | null> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "promotion-codes",
    where: { code: { equals: code } },
    depth: 0,
    limit: 1,
    pagination: false,
  });
  const doc = docs[0];
  if (!doc) return null;
  return {
    code: doc.code,
    kind: doc.kind,
    percent: doc.percent,
    amountCents: doc.amountCents,
    minimumCents: doc.minimumCents,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
  };
}
