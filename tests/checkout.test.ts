// The mock checkout's rules (issue #187): its three pages' words, reserved
// and distinct from every other section's word and category slug; the
// first step's answers; the cookie's token and its hash; the order number;
// each delivery method's price; the pickup points; and the purge's cutoffs.
import { describe, expect, it } from "vitest";
import { categoryLocaleRows } from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import { orderCutoffs } from "../cms/orders/purge.ts";
import { ORDER_PARAM } from "../site/account-rules.ts";
import {
  ACCOUNT_WORDS,
  accountPath,
  BRAND_WORDS,
  CART_WORDS,
  CATEGORY_SLUG,
  CHECKOUT_WORDS,
  CONFIRMATION_WORDS,
  checkoutPageOf,
  checkoutPagePath,
  FINDER_WORDS,
  FIT_WORDS,
  INFO_PAGES,
  INFO_SLUGS,
  isReservedWord,
  MODEL_WORDS,
  orderPath,
  PAYMENT_WORDS,
  SEARCH_WORDS,
  SIGN_OUT_WORDS,
  SIGN_UP_WORDS,
} from "../site/addresses.ts";
import { cartTotals } from "../site/cart-pricing.ts";
import {
  DEFAULT_PICKUP_CENTS,
  deliveryFor,
  isCheckoutNotice,
  newCheckoutToken,
  orderDate,
  orderNumber,
  parseDelivery,
  parseOrderNumber,
  tokenHash,
} from "../site/checkout-rules.ts";
import {
  PICKUP_POINTS,
  pickupPoint,
  pickupPointsIn,
} from "../site/pickup-points.ts";
import { COUNTRIES } from "../site/saved-addresses.ts";

const pages = [
  ["checkout", CHECKOUT_WORDS],
  ["payment", PAYMENT_WORDS],
  ["confirmation", CONFIRMATION_WORDS],
] as const;

describe("checkout words", () => {
  it("are valid category slug forms, reserved, and never another section's word or a generated category slug", () => {
    const others = new Set([
      ...Object.values(ACCOUNT_WORDS),
      ...Object.values(SIGN_UP_WORDS),
      ...Object.values(SIGN_OUT_WORDS),
      ...Object.values(BRAND_WORDS),
      ...Object.values(CART_WORDS),
      ...Object.values(FINDER_WORDS),
      ...Object.values(FIT_WORDS),
      ...Object.values(SEARCH_WORDS),
      ...Object.values(MODEL_WORDS),
      ...INFO_PAGES.flatMap((page) => Object.values(INFO_SLUGS[page])),
    ]);
    const categorySlugs = new Set(categoryLocaleRows().map(([, slug]) => slug));
    for (const [, words] of pages)
      for (const locale of locales) {
        const word = words[locale];
        expect(word).toMatch(CATEGORY_SLUG);
        expect(isReservedWord(word), word).toBe(true);
        expect(others.has(word), word).toBe(false);
        expect(categorySlugs.has(word), word).toBe(false);
      }
  });

  it("never name two checkout pages", () => {
    const seen = new Map<string, string>();
    for (const [page, words] of pages)
      for (const word of Object.values(words)) {
        expect(seen.get(word) ?? page, word).toBe(page);
        seen.set(word, page);
      }
  });

  it("are recognised in any language and letter case", () => {
    expect(checkoutPageOf("commande")).toBe("checkout");
    expect(checkoutPageOf("Checkout")).toBe("checkout");
    expect(checkoutPageOf("PAGAMENTO")).toBe("payment");
    expect(checkoutPageOf("bestellbestaetigung")).toBe("confirmation");
    expect(checkoutPageOf("commandes")).toBeNull();
  });

  it("build each page's address in its language", () => {
    expect(checkoutPagePath("fr", "checkout")).toBe("/fr/commande");
    expect(checkoutPagePath("en", "payment")).toBe("/en/payment");
    expect(checkoutPagePath("da", "confirmation")).toBe(
      "/da/ordrebekraeftelse",
    );
  });
});

const address = {
  name: "Ada Test",
  line1: "1 rue de la Démo",
  line2: "",
  postalCode: "69002",
  city: "Lyon",
  country: "FR" as const,
};

const form =
  (values: Record<string, string>) =>
  (name: string): unknown =>
    values[name] ?? null;

describe("the delivery step's answers", () => {
  it("take home delivery with the form's address", () => {
    const parsed = parseDelivery(form({ ...address, method: "home" }));
    expect(parsed).toEqual({
      choice: {
        address: { ...address, label: "" },
        method: "home",
        point: null,
      },
    });
  });

  it("take a pickup point in the address's country", () => {
    const parsed = parseDelivery(
      form({ ...address, method: "pickup", point: "FR-2" }),
    );
    expect(parsed).toMatchObject({
      choice: { method: "pickup", point: { id: "FR-2", city: "Lyon" } },
    });
  });

  it("refuse a pickup point in another country, or none, keeping the address", () => {
    for (const point of ["DE-1", "", "XX-1"]) {
      const parsed = parseDelivery(
        form({ ...address, method: "pickup", point }),
      );
      expect(parsed).toEqual({
        problem: "point",
        address: { ...address, label: "" },
      });
    }
  });

  it("refuse a missing or unknown method", () => {
    expect(parseDelivery(form({ ...address }))).toMatchObject({
      problem: "method",
    });
    expect(parseDelivery(form({ ...address, method: "drone" }))).toMatchObject({
      problem: "method",
    });
  });

  it("refuse an address with a wrong field", () => {
    expect(
      parseDelivery(form({ ...address, postalCode: "", method: "home" })),
    ).toEqual({ problem: "address", address: null });
    expect(
      parseDelivery(form({ ...address, country: "US", method: "home" })),
    ).toEqual({ problem: "address", address: null });
  });

  it("use a saved address rather than the form's fields", () => {
    const saved = {
      ...address,
      label: "Maison",
      city: "Paris",
      postalCode: "75001",
    };
    const parsed = parseDelivery(
      form({ method: "pickup", point: "FR-1" }),
      saved,
    );
    expect(parsed).toMatchObject({
      choice: { address: saved, point: { id: "FR-1" } },
    });
  });
});

describe("the checkout cookie's token", () => {
  it("is random and hashed for the database, never stored as such", () => {
    const token = newCheckoutToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newCheckoutToken()).not.toBe(token);
    const hash = tokenHash(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(tokenHash(token)).toBe(hash);
  });

  it("is refused in any other form", () => {
    for (const value of [undefined, "", "short", `${newCheckoutToken()}x`, 42])
      expect(tokenHash(value)).toBeNull();
  });
});

describe("orders", () => {
  it("are numbered from the sequence", () => {
    expect(orderNumber(1)).toBe("SP-000001");
    expect(orderNumber(1234567)).toBe("SP-1234567");
  });

  it("charge each method's price, both free from the same threshold", () => {
    const shop = {
      deliveryCents: 690,
      freeDeliveryFromCents: 4900,
      pickupCents: DEFAULT_PICKUP_CENTS,
    };
    expect(DEFAULT_PICKUP_CENTS).toBe(390);
    expect(
      cartTotals(2000, null, deliveryFor("home", shop)).deliveryCents,
    ).toBe(690);
    expect(
      cartTotals(2000, null, deliveryFor("pickup", shop)).deliveryCents,
    ).toBe(390);
    expect(
      cartTotals(4900, null, deliveryFor("pickup", shop)).deliveryCents,
    ).toBe(0);
  });

  it("name their notices", () => {
    expect(isCheckoutNotice("changed")).toBe(true);
    expect(isCheckoutNotice("paid")).toBe(false);
  });
});

describe("pickup points", () => {
  it("are five per country an address may be in, with unique ids", () => {
    for (const country of COUNTRIES)
      expect(pickupPointsIn(country), country).toHaveLength(5);
    expect(new Set(PICKUP_POINTS.map((point) => point.id)).size).toBe(
      PICKUP_POINTS.length,
    );
  });

  it("are found by their id only", () => {
    expect(pickupPoint("SE-3")).toMatchObject({ country: "SE", city: "Malmö" });
    expect(pickupPoint("se-3")).toBeNull();
    expect(pickupPoint(3)).toBeNull();
  });
});

describe("the purge", () => {
  it("cuts drafts at 24 hours and guests' orders at 30 days", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    expect(orderCutoffs(now)).toEqual({
      draft: new Date("2026-11-16T12:00:00Z"),
      placed: new Date("2026-10-18T12:00:00Z"),
    });
  });
});

describe("order history (issue #188)", () => {
  it("reads an order number from an address, and nothing else", () => {
    expect(parseOrderNumber(orderNumber(42))).toBe("SP-000042");
    expect(parseOrderNumber("SP-1234567")).toBe("SP-1234567");
    for (const value of [
      "SP-42",
      "sp-000042",
      "SP-000042 ",
      "1",
      "",
      null,
      ["SP-000042"],
    ])
      expect(parseOrderNumber(value)).toBeNull();
  });

  it("links an order on the account address in each language", () => {
    for (const locale of locales)
      expect(orderPath(locale, "SP-000042")).toBe(
        `${accountPath(locale)}?${ORDER_PARAM}=SP-000042`,
      );
  });

  it("dates an order in the shop's time zone, whatever the server's", () => {
    // 23:30 UTC on 31 December is already 1 January in Paris.
    expect(orderDate("2026-12-31T23:30:00.000Z", "fr")).toBe("1 janvier 2027");
    expect(orderDate("2026-11-17T08:00:00.000Z", "en")).toBe(
      "November 17, 2026",
    );
  });
});
