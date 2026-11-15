// Merchandising data (issue #151): each product's availability and its sale,
// with the rules Payload checks on save and the pages read. Pure functions
// with no Payload or Next.js imports, so the unit tests read them too.
import type { Locale } from "../cms/locales.ts";

/** A product's availability, from which its delivery estimate follows. */
export const AVAILABILITIES = ["in-stock", "on-order", "out-of-stock"] as const;

export type Availability = (typeof AVAILABILITIES)[number];

/** A product's sale: a lower price between two dates, or none. */
export type Sale = {
  salePriceCents?: number | null;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
};

/**
 * Why a product's sale fields cannot be saved, or null when they can: either
 * none is set, or the three are, with a sale price that is a whole number of
 * cents below the regular price and a start before the end.
 */
export function saleError(sale: Sale, priceCents: number): string | null {
  const set = [sale.salePriceCents, sale.saleStartsAt, sale.saleEndsAt].filter(
    (value) => value !== null && value !== undefined && value !== "",
  ).length;
  if (set === 0) return null;
  if (set < 3)
    return "Set the sale price, its start and its end together, or none of them.";
  const cents = sale.salePriceCents as number;
  if (!Number.isInteger(cents) || cents < 0 || cents >= priceCents)
    return "The sale price must be a whole number of cents below the price.";
  const starts = Date.parse(sale.saleStartsAt as string);
  const ends = Date.parse(sale.saleEndsAt as string);
  if (!(starts < ends)) return "The sale must start before it ends.";
  return null;
}

/**
 * A sale read from SQL, whose dates may come back as Date objects, with its
 * dates as ISO strings like Payload's.
 */
export const dateStrings = (row: {
  salePriceCents?: unknown;
  saleStartsAt?: unknown;
  saleEndsAt?: unknown;
}): Sale => {
  const iso = (value: unknown) =>
    value instanceof Date
      ? value.toISOString()
      : typeof value === "string"
        ? value
        : null;
  return {
    salePriceCents:
      row.salePriceCents === null || row.salePriceCents === undefined
        ? null
        : Number(row.salePriceCents),
    saleStartsAt: iso(row.saleStartsAt),
    saleEndsAt: iso(row.saleEndsAt),
  };
};

/** The price shown at a moment: the sale's while it runs, else the regular one. */
export function priceAt(
  product: Sale & { priceCents: number },
  now: number,
): { cents: number; formerCents: number | null } {
  const { salePriceCents, saleStartsAt, saleEndsAt } = product;
  if (
    typeof salePriceCents === "number" &&
    saleStartsAt &&
    saleEndsAt &&
    Date.parse(saleStartsAt) <= now &&
    now < Date.parse(saleEndsAt)
  )
    return { cents: salePriceCents, formerCents: product.priceCents };
  return { cents: product.priceCents, formerCents: null };
}

/** The discount in whole percent, rounded down, as the badge shows it. */
export const discountPercent = (cents: number, formerCents: number): number =>
  Math.floor(((formerCents - cents) / formerCents) * 100);

/** The discount badge's text, such as "-33 %" in French. */
export const discountLabel = (
  locale: Locale,
  cents: number,
  formerCents: number,
): string =>
  `-${new Intl.NumberFormat(locale, { style: "percent" }).format(
    discountPercent(cents, formerCents) / 100,
  )}`;

/**
 * The next moment a sale among these products starts or ends, after now, or
 * null when none will. A cached part showing them expires then (ADR 0008).
 */
export function nextSaleChange(
  products: Iterable<Sale>,
  now: number,
): number | null {
  let next: number | null = null;
  for (const { saleStartsAt, saleEndsAt } of products)
    for (const date of [saleStartsAt, saleEndsAt]) {
      if (!date) continue;
      const time = Date.parse(date);
      if (time > now && (next === null || time < next)) next = time;
    }
  return next;
}

/**
 * Seconds before a sale date when a cached part showing it starts to
 * regenerate in the background: the version served meanwhile is still
 * correct, since the date has not come.
 */
export const REVALIDATE_MARGIN_SECONDS = 60;

/**
 * How long a cached part that shows prices may stay cached (ADR 0008): its
 * expire is the time left until the next sale start or end among the products
 * it depends on, after which the next request waits for a fresh render, and
 * its revalidate a margin shorter, since Next.js requires expire to be longer
 * than revalidate and serves the cached version during a revalidation. The
 * "max" profile when no date is coming.
 */
export const priceLifetime = (
  products: Iterable<Sale>,
  now: number,
): "max" | { revalidate: number; expire: number } =>
  lifetimeUntil(nextSaleChange(products, now), now);

/**
 * A cached part's lifetime up to a moment it must change at, such as a sale
 * or a promotion starting: expire then, revalidate a margin earlier (ADR
 * 0008); the "max" profile when nothing is coming.
 */
export function lifetimeUntil(
  next: number | null,
  now: number,
): "max" | { revalidate: number; expire: number } {
  if (next === null) return "max";
  const expire = Math.max(2, Math.ceil((next - now) / 1000));
  const revalidate = Math.max(1, expire - REVALIDATE_MARGIN_SECONDS);
  return { revalidate: Math.min(revalidate, expire - 1), expire };
}

/** The next 00:00 UTC after a moment, when the rotation's new sales start. */
export function nextBoundary(now: number): number {
  const day = new Date(now);
  return Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate() + 1,
  );
}

/** The availability's dictionary key. */
export const availabilityKey = (
  availability: Availability,
): "availabilityInStock" | "availabilityOnOrder" | "availabilityOutOfStock" =>
  (
    ({
      "in-stock": "availabilityInStock",
      "on-order": "availabilityOnOrder",
      "out-of-stock": "availabilityOutOfStock",
    }) as const
  )[availability];

/** The delivery estimate's dictionary key for an availability. */
export const deliveryKey = (
  availability: Availability,
): "deliveryInStock" | "deliveryOnOrder" | "deliveryOutOfStock" =>
  (
    ({
      "in-stock": "deliveryInStock",
      "on-order": "deliveryOnOrder",
      "out-of-stock": "deliveryOutOfStock",
    }) as const
  )[availability];
