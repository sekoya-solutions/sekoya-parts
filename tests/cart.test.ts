// The cart cookie (issue #168, ADR 0013): every read checks each line, so a
// malformed or edited value gives a valid cart, and the caps hold.
import { describe, expect, it } from "vitest";
import { categoryLocaleRows } from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import {
  BRAND_WORDS,
  CART_WORDS,
  CATEGORY_SLUG,
  cartPath,
  FIT_WORDS,
  INFO_PAGES,
  INFO_SLUGS,
  isCartWord,
  isReservedWord,
  MODEL_WORDS,
  SEARCH_WORDS,
} from "../site/addresses.ts";
import {
  addToCart,
  CART_COOKIE,
  CART_LINES,
  cartCookieValue,
  cartCount,
  MAX_QUANTITY,
  parseCart,
  parseProductId,
  parseQuantity,
  removeFromCart,
  serializeCart,
  setQuantity,
} from "../site/cart.ts";

const full = Array.from({ length: CART_LINES }, (_, i) => ({
  id: i + 1,
  quantity: MAX_QUANTITY,
}));

describe("parseCart", () => {
  it("reads back what serializeCart writes", () => {
    const cart = [
      { id: 12, quantity: 2 },
      { id: 99_999, quantity: 1 },
    ];
    expect(parseCart(serializeCart(cart))).toEqual(cart);
  });

  it("gives an empty cart for no value or a value of another shape", () => {
    for (const raw of [
      null,
      undefined,
      "",
      "abc",
      "[1,2]",
      "1-2",
      ":",
      "_",
      ".",
      "1:2",
    ])
      expect(parseCart(raw)).toEqual([]);
  });

  it("drops malformed lines and keeps the others", () => {
    expect(
      parseCart("1_2.x_1.3_0.0_4.05_1.-6_1.7_1.5 _1.8_1_1.9_2.10:1"),
    ).toEqual([
      { id: 1, quantity: 2 },
      { id: 7, quantity: 1 },
      { id: 9, quantity: 2 },
    ]);
  });

  it("caps a quantity and merges a product listed twice", () => {
    expect(parseCart("4_500.5_60.5_60")).toEqual([
      { id: 4, quantity: MAX_QUANTITY },
      { id: 5, quantity: MAX_QUANTITY },
    ]);
  });

  it("keeps the first CART_LINES products only", () => {
    const raw = `${serializeCart(full)}.${CART_LINES + 1}:1`;
    expect(parseCart(raw)).toEqual(full);
  });

  it("refuses ids too large for a product and overlong values", () => {
    expect(parseCart("9999999999_1")).toEqual([]);
    expect(parseCart(`1_1.${"2_1.".repeat(2000)}`)).toEqual([]);
  });

  it("fits a full cart well within a browser's 4,096 bytes per cookie", () => {
    const big = Array.from({ length: CART_LINES }, (_, i) => ({
      id: 100_000 - i,
      quantity: MAX_QUANTITY,
    }));
    expect(serializeCart(big).length).toBeLessThan(600);
  });
});

describe("addToCart", () => {
  it("adds a new product last and grows an existing line up to the cap", () => {
    const one = addToCart([], 5, 2);
    expect(one).toEqual({ cart: [{ id: 5, quantity: 2 }], refused: null });
    const two = addToCart(one.cart, 6, 1);
    expect(two.cart.map((line) => line.id)).toEqual([5, 6]);
    expect(addToCart(two.cart, 5, 98).cart[0]).toEqual({
      id: 5,
      quantity: MAX_QUANTITY,
    });
  });

  it("refuses a new product in a full cart, but grows a line already in it", () => {
    expect(addToCart(full, CART_LINES + 1, 1)).toEqual({
      cart: full,
      refused: "full",
    });
    const lower = full.map((line) => ({ ...line, quantity: 1 }));
    expect(addToCart(lower, 1, 1).refused).toBeNull();
  });
});

describe("setQuantity and removeFromCart", () => {
  const cart = [
    { id: 1, quantity: 1 },
    { id: 2, quantity: 3 },
  ];
  it("changes one line in place", () => {
    expect(setQuantity(cart, 2, 7)).toEqual([
      { id: 1, quantity: 1 },
      { id: 2, quantity: 7 },
    ]);
    expect(setQuantity(cart, 3, 7)).toEqual(cart);
  });
  it("removes one line", () => {
    expect(removeFromCart(cart, 1)).toEqual([{ id: 2, quantity: 3 }]);
  });
  it("counts the items", () => {
    expect(cartCount(cart)).toBe(4);
    expect(cartCount([])).toBe(0);
  });
});

describe("form values", () => {
  it("reads quantities from 1 to MAX_QUANTITY only", () => {
    expect(parseQuantity("1")).toBe(1);
    expect(parseQuantity(" 99 ")).toBe(99);
    for (const bad of ["0", "100", "-1", "1.5", "1e2", "", "abc", null, 3.5])
      expect(parseQuantity(bad)).toBeNull();
  });
  it("reads product ids as positive integers only", () => {
    expect(parseProductId("42")).toBe(42);
    for (const bad of ["0", "042", "-1", "1.0", "", "9999999999", undefined])
      expect(parseProductId(bad)).toBeNull();
  });
});

describe("cartCookieValue", () => {
  it("finds the cart among other cookies, by its exact name", () => {
    expect(cartCookieValue(`a=1; ${CART_COOKIE}=1_2.3_4; b=2`)).toBe("1_2.3_4");
    expect(cartCookieValue(`x${CART_COOKIE}=1_1`)).toBeNull();
    expect(cartCookieValue("")).toBeNull();
  });
});

describe("cart words", () => {
  it("are valid category slug forms, reserved, and never another section's word or a generated category slug", () => {
    const others = new Set([
      ...Object.values(BRAND_WORDS),
      ...Object.values(FIT_WORDS),
      ...Object.values(SEARCH_WORDS),
      ...Object.values(MODEL_WORDS),
      ...INFO_PAGES.flatMap((page) => Object.values(INFO_SLUGS[page])),
    ]);
    for (const locale of locales) {
      const word = CART_WORDS[locale];
      expect(word).toMatch(CATEGORY_SLUG);
      expect(isReservedWord(word), word).toBe(true);
      expect(others.has(word), word).toBe(false);
      expect(cartPath(locale)).toBe(`/${locale}/${word}`);
    }
    const words = new Set(Object.values(CART_WORDS));
    for (const [, slug] of categoryLocaleRows())
      expect(words.has(slug), slug).toBe(false);
  });

  it("are recognised in any language and letter case", () => {
    expect(isCartWord("mon-panier")).toBe(true);
    expect(isCartWord("Cart")).toBe(true);
    expect(isCartWord("panier")).toBe(false);
  });
});
