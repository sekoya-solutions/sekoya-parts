// The cart's amounts (issue #169): delivery, the free-delivery threshold
// reached after the discount, and a promotion code's checks and discount.
import { describe, expect, it } from "vitest";
import {
  type CartTotals,
  cartTotals,
  codeRefusal,
  discountCents,
  normalizeCode,
  type PromotionCode,
} from "../site/cart-pricing.ts";
import { isCartRefusal, isCartSuccess } from "../site/cart-status.ts";

const delivery = { deliveryCents: 690, freeDeliveryFromCents: 4900 };
const demo10: PromotionCode = { code: "DEMO10", kind: "percent", percent: 10 };
const now = Date.parse("2026-11-16T12:00:00Z");

describe("normalizeCode", () => {
  it("trims a typed code and puts it in capitals", () => {
    expect(normalizeCode("  demo10 ")).toBe("DEMO10");
    expect(normalizeCode("ete-2026")).toBe("ETE-2026");
  });

  it("refuses anything a code cannot be", () => {
    for (const value of ["", "  ", "-DEMO", "DEMO 10", "DÉMO", "A".repeat(33)])
      expect(normalizeCode(value)).toBeNull();
    expect(normalizeCode(null)).toBeNull();
    expect(normalizeCode(10)).toBeNull();
  });
});

describe("codeRefusal", () => {
  it("accepts a running code", () => {
    expect(codeRefusal(demo10, 1000, now)).toBeNull();
  });

  it("calls a missing or not yet started code unknown", () => {
    expect(codeRefusal(null, 1000, now)).toBe("unknown");
    expect(
      codeRefusal({ ...demo10, startsAt: "2026-12-01T00:00:00Z" }, 1000, now),
    ).toBe("unknown");
  });

  it("calls a code past its end expired, from its end on", () => {
    const ended = { ...demo10, endsAt: "2026-09-01T00:00:00Z" };
    expect(codeRefusal(ended, 1000, now)).toBe("expired");
    expect(codeRefusal(ended, 1000, Date.parse(ended.endsAt))).toBe("expired");
    expect(codeRefusal(ended, 1000, Date.parse(ended.endsAt) - 1)).toBeNull();
  });

  it("checks the minimum against the subtotal", () => {
    const minimum = { ...demo10, minimumCents: 3000 };
    expect(codeRefusal(minimum, 2999, now)).toBe("minimum");
    expect(codeRefusal(minimum, 3000, now)).toBeNull();
  });
});

describe("discountCents", () => {
  it("rounds a percentage to the nearest cent", () => {
    expect(discountCents(demo10, 1995)).toBe(200);
    expect(discountCents(demo10, 1994)).toBe(199);
  });

  it("never takes off more than the subtotal", () => {
    const amount: PromotionCode = {
      code: "FIVE",
      kind: "amount",
      amountCents: 500,
    };
    expect(discountCents(amount, 2000)).toBe(500);
    expect(discountCents(amount, 300)).toBe(300);
    expect(discountCents({ ...demo10, percent: 100 }, 300)).toBe(300);
  });
});

describe("cartTotals", () => {
  const totals = (subtotal: number, code: PromotionCode | null = null) =>
    cartTotals(subtotal, code, delivery);

  it("charges delivery below the threshold and says what is left", () => {
    expect(totals(3000)).toEqual<CartTotals>({
      subtotalCents: 3000,
      discountCents: 0,
      deliveryCents: 690,
      totalCents: 3690,
      leftForFreeDeliveryCents: 1900,
    });
  });

  it("delivers free from the threshold on", () => {
    expect(totals(4900)).toMatchObject({
      deliveryCents: 0,
      totalCents: 4900,
      leftForFreeDeliveryCents: 0,
    });
  });

  it("reaches the threshold on the subtotal after the discount", () => {
    // 50.00 € less 10% is 45.00 €: below 49 €, so delivery is charged.
    expect(totals(5000, demo10)).toEqual<CartTotals>({
      subtotalCents: 5000,
      discountCents: 500,
      deliveryCents: 690,
      totalCents: 5190,
      leftForFreeDeliveryCents: 400,
    });
    expect(totals(5445, demo10)).toMatchObject({
      discountCents: 545,
      deliveryCents: 0,
      totalCents: 4900,
    });
  });

  it("has no delivery for a cart with nothing to order", () => {
    expect(totals(0)).toMatchObject({
      deliveryCents: 0,
      totalCents: 0,
      leftForFreeDeliveryCents: 0,
    });
  });
});

describe("cart statuses", () => {
  it("names the code refusals as refusals", () => {
    for (const status of ["code-unknown", "code-expired", "code-minimum"])
      expect(isCartRefusal(status)).toBe(true);
    expect(isCartRefusal("code-applied")).toBe(false);
    expect(isCartSuccess("code-applied")).toBe(true);
    expect(isCartSuccess("code-removed")).toBe(true);
    expect(isCartSuccess("code-expired")).toBe(false);
  });
});
