// The cart's amounts (issue #169): delivery, the free-delivery threshold and
// a promotion code's discount. Pure functions with no Payload or Next.js
// import, so the unit tests, the cart route and the cart page share them.
// Every amount is in cents and computed on the server from the catalog and
// the values editors set in Payload (cms/globals/shop-settings.ts,
// cms/collections/promotion-codes.ts), never from the browser.

/** The demo values the seed migration loads, before an editor changes them. */
export const DEFAULT_DELIVERY_CENTS = 690;
export const DEFAULT_FREE_DELIVERY_FROM_CENTS = 4900;

/** Delivery as editors set it in Payload's "Shop settings". */
export type DeliverySettings = {
  deliveryCents: number;
  freeDeliveryFromCents: number;
};

export const PROMOTION_CODE_KINDS = ["percent", "amount"] as const;
export type PromotionCodeKind = (typeof PROMOTION_CODE_KINDS)[number];

/** A promotion code as the cart reads it from Payload. */
export type PromotionCode = {
  code: string;
  kind: PromotionCodeKind;
  /** For a percent code: 1 to 100. */
  percent?: number | null;
  /** For an amount code: the cents taken off. */
  amountCents?: number | null;
  /** The subtotal the code needs, in cents; none is no minimum. */
  minimumCents?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
};

/** The longest code accepted, in characters. */
export const CODE_LENGTH = 32;

/**
 * A code as a visitor typed it, in the form Payload stores: trimmed and in
 * capitals, letters, digits and hyphens only. Null for anything else.
 */
export function normalizeCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return code.length <= CODE_LENGTH && /^[A-Z0-9][A-Z0-9-]*$/.test(code)
    ? code
    : null;
}

/**
 * Why a code does not apply to a cart now, or null when it does:
 * - unknown: no such code, or one that has not started yet;
 * - expired: its end date has passed;
 * - minimum: the subtotal is below the code's minimum.
 */
export type CodeRefusal = "unknown" | "expired" | "minimum";

export function codeRefusal(
  code: PromotionCode | null,
  subtotalCents: number,
  now: number,
): CodeRefusal | null {
  if (!code) return "unknown";
  if (code.startsAt && now < Date.parse(code.startsAt)) return "unknown";
  if (code.endsAt && now >= Date.parse(code.endsAt)) return "expired";
  if (code.minimumCents && subtotalCents < code.minimumCents) return "minimum";
  return null;
}

/**
 * The cents a code takes off a subtotal: a percentage rounded to the nearest
 * cent, or a fixed amount, never more than the subtotal.
 */
export function discountCents(
  code: PromotionCode,
  subtotalCents: number,
): number {
  const off =
    code.kind === "percent"
      ? Math.round((subtotalCents * (code.percent ?? 0)) / 100)
      : (code.amountCents ?? 0);
  return Math.max(0, Math.min(off, subtotalCents));
}

/** What the cart page shows below its lines. */
export type CartTotals = {
  subtotalCents: number;
  discountCents: number;
  deliveryCents: number;
  totalCents: number;
  /** What is left to spend for free delivery, or 0 once it is reached. */
  leftForFreeDeliveryCents: number;
};

/**
 * The cart's totals. Free delivery is reached on the subtotal after the
 * discount, so a code never unlocks it on its own (owner decision,
 * 2026-11-16). A cart with nothing to order has no delivery.
 */
export function cartTotals(
  subtotalCents: number,
  code: PromotionCode | null,
  delivery: DeliverySettings,
): CartTotals {
  const discount = code ? discountCents(code, subtotalCents) : 0;
  const afterDiscount = subtotalCents - discount;
  const left =
    subtotalCents === 0
      ? 0
      : Math.max(0, delivery.freeDeliveryFromCents - afterDiscount);
  const deliveryCents =
    subtotalCents === 0 || left === 0 ? 0 : delivery.deliveryCents;
  return {
    subtotalCents,
    discountCents: discount,
    deliveryCents,
    totalCents: afterDiscount + deliveryCents,
    leftForFreeDeliveryCents: left,
  };
}
