// Merchandising rules (issue #151): sale validation, the price shown at a
// moment, and how long a part that shows prices may stay cached (ADR 0008).
import { describe, expect, it } from "vitest";
import {
  discountPercent,
  nextBoundary,
  priceAt,
  priceLifetime,
  saleError,
} from "../site/merchandising.ts";

const NOW = Date.parse("2026-11-15T21:30:00Z");
const sale = {
  priceCents: 2990,
  salePriceCents: 1990,
  saleStartsAt: "2026-11-16T00:00:00Z",
  saleEndsAt: "2026-11-23T00:00:00Z",
};
const none = { salePriceCents: null, saleStartsAt: null, saleEndsAt: null };

describe("saleError", () => {
  it("accepts no sale, or a complete one below the price", () => {
    expect(saleError(none, 2990)).toBeNull();
    expect(saleError(sale, 2990)).toBeNull();
  });

  it("refuses a partial sale, a price not below the regular one, and a sale that ends first", () => {
    expect(saleError({ ...none, salePriceCents: 1990 }, 2990)).toMatch(
      /together/,
    );
    expect(saleError({ ...sale, salePriceCents: 2990 }, 2990)).toMatch(/below/);
    expect(saleError({ ...sale, salePriceCents: 19.5 }, 2990)).toMatch(/whole/);
    expect(saleError({ ...sale, saleEndsAt: sale.saleStartsAt }, 2990)).toMatch(
      /start before/,
    );
  });
});

describe("priceAt", () => {
  it("gives the regular price before, the sale price during, and the regular price from the end", () => {
    expect(priceAt(sale, NOW)).toEqual({ cents: 2990, formerCents: null });
    expect(priceAt(sale, Date.parse(sale.saleStartsAt))).toEqual({
      cents: 1990,
      formerCents: 2990,
    });
    expect(priceAt(sale, Date.parse(sale.saleEndsAt))).toEqual({
      cents: 2990,
      formerCents: null,
    });
  });

  it("rounds the discount down", () => {
    expect(discountPercent(1990, 2990)).toBe(33);
  });
});

describe("priceLifetime", () => {
  it("is the max profile when no sale date is coming", () => {
    expect(priceLifetime([none], NOW)).toBe("max");
    expect(
      priceLifetime(
        [
          {
            ...sale,
            saleEndsAt: "2026-11-15T00:00:00Z",
            saleStartsAt: "2026-11-14T00:00:00Z",
          },
        ],
        NOW,
      ),
    ).toBe("max");
  });

  it("ends at the next sale date among the products, start or end", () => {
    const soon = { ...sale, saleStartsAt: "2026-11-15T22:00:00Z" };
    expect(priceLifetime([none, sale, soon], NOW)).toEqual({
      revalidate: 1800,
      expire: 1800,
    });
    const running = {
      ...sale,
      saleStartsAt: "2026-11-10T00:00:00Z",
      saleEndsAt: "2026-11-15T21:31:00Z",
    };
    expect(priceLifetime([running], NOW)).toEqual({
      revalidate: 60,
      expire: 60,
    });
  });

  it("is never 0, which would mean no cache", () => {
    const now = Date.parse(sale.saleStartsAt) - 100;
    expect(priceLifetime([sale], now)).toEqual({ revalidate: 1, expire: 1 });
  });
});

describe("nextBoundary", () => {
  it("is the next 00:00 UTC", () => {
    expect(nextBoundary(NOW)).toBe(Date.parse("2026-11-16T00:00:00Z"));
    expect(nextBoundary(Date.parse("2026-11-16T00:00:00Z"))).toBe(
      Date.parse("2026-11-17T00:00:00Z"),
    );
  });
});
