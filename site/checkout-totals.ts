// What an order would cost now (issue #187): the cart's lines that can be
// ordered, read from the catalog, the promotion code the visitor applied if
// it still applies, and the chosen delivery method's price from "Shop
// settings". Shared by the payment page, which shows it, and the checkout
// route, which places the order with it, so both compute the same amount
// from the same sources and never from the browser.

import config from "@payload-config";
import { getPayload } from "payload";
import type { CartLine } from "./cart.ts";
import {
  counted,
  readCode,
  readLines,
  type ShownLine,
  subtotalCents,
} from "./cart-lines.ts";
import {
  type CartTotals,
  cartTotals,
  codeRefusal,
  DEFAULT_DELIVERY_CENTS,
  DEFAULT_FREE_DELIVERY_FROM_CENTS,
  normalizeCode,
  type PromotionCode,
} from "./cart-pricing.ts";
import {
  DEFAULT_PICKUP_CENTS,
  type DeliveryMethod,
  deliveryFor,
  type ShopDelivery,
} from "./checkout-rules.ts";

/** Both delivery prices and the free-delivery threshold, from "Shop settings". */
export async function readShopDelivery(): Promise<ShopDelivery> {
  const payload = await getPayload({ config });
  const settings = await payload.findGlobal({
    slug: "shop-settings",
    depth: 0,
  });
  return {
    deliveryCents: settings.deliveryCents ?? DEFAULT_DELIVERY_CENTS,
    freeDeliveryFromCents:
      settings.freeDeliveryFromCents ?? DEFAULT_FREE_DELIVERY_FROM_CENTS,
    pickupCents: settings.pickupCents ?? DEFAULT_PICKUP_CENTS,
  };
}

export type CheckoutTotals = {
  /** The lines that can be ordered, in the cart's order. */
  lines: ShownLine[];
  /** The applied code, when it still applies to this subtotal. */
  code: PromotionCode | null;
  totals: CartTotals;
};

/**
 * The order's lines and totals for a cart, a promotion code cookie's value
 * and a delivery method. Lines out of stock are left out, as the cart page
 * leaves them out of its subtotal.
 */
export async function checkoutTotals(
  cart: readonly CartLine[],
  appliedCode: string | undefined,
  method: DeliveryMethod,
  shop?: ShopDelivery,
): Promise<CheckoutTotals> {
  const applied = normalizeCode(appliedCode);
  const [all, code, settings] = await Promise.all([
    readLines(cart),
    applied ? readCode(applied) : null,
    shop ?? readShopDelivery(),
  ]);
  const lines = all.filter(counted);
  const subtotal = subtotalCents(lines);
  const applies = code && codeRefusal(code, subtotal, Date.now()) === null;
  const kept = applies ? code : null;
  return {
    lines,
    code: kept,
    totals: cartTotals(subtotal, kept, deliveryFor(method, settings)),
  };
}
