// Sorted and filtered category pages: their addresses and rewrites (issue #148).
import { describe, expect, it } from "vitest";
import { locales } from "../cms/locales.ts";
import {
  ANY_BRAND,
  categoryViewPath,
  isPlainView,
  PLAIN_VIEW,
  parseViewEntry,
  VIEW_MARK,
  viewEntry,
  viewQuery,
} from "../site/addresses.ts";
import { listingRewrites } from "../site/listing-rewrites.ts";
import { tagsForProductChange } from "../site/tags.ts";

describe("views", () => {
  it("give no query for the plain view, and the same keys in every language", () => {
    expect(viewQuery(PLAIN_VIEW)).toBe("");
    expect(isPlainView(PLAIN_VIEW)).toBe(true);
    expect(viewQuery({ sort: "price-asc", brand: null })).toBe(
      "?sort=price-asc",
    );
    expect(viewQuery({ sort: "reference", brand: "bedoren" })).toBe(
      "?brand=bedoren",
    );
    expect(
      categoryViewPath("de", "riemen", 2, {
        sort: "price-desc",
        brand: "bedoren",
      }),
    ).toBe("/de/riemen/2?sort=price-desc&brand=bedoren");
    expect(categoryViewPath("fr", "courroie", 1, PLAIN_VIEW)).toBe(
      "/fr/courroie",
    );
  });

  it("read the internal route's segments, refusing anything else", () => {
    expect(parseViewEntry(`~price-asc~${ANY_BRAND}`)).toEqual({
      sort: "price-asc",
      brand: null,
    });
    expect(parseViewEntry("~reference~bedoren")).toEqual({
      sort: "reference",
      brand: "bedoren",
    });
    for (const view of [
      { sort: "price-desc", brand: "bedoren" },
      { sort: "price-asc", brand: null },
    ] as const)
      expect(parseViewEntry(viewEntry(view))).toEqual(view);
    for (const wrong of [
      "~price~-",
      "~price-asc~Bedoren",
      "~price-asc~be-doren",
      "price-asc~-",
      "~price-asc~-~x",
      "~price-asc",
    ])
      expect(parseViewEntry(wrong), wrong).toBeNull();
  });

  it("use a mark no product segment or page number can hold", () => {
    expect(`a${VIEW_MARK}b`).not.toMatch(/^[a-z0-9-]+$/);
  });
});

describe("listingRewrites", () => {
  const rules = listingRewrites();

  it("cover the three views on page 1 and numbered pages, most specific first", () => {
    expect(rules).toHaveLength(6);
    expect(rules.map((r) => r.has.map((h) => h.key).join("+"))).toEqual([
      "sort+brand",
      "sort+brand",
      "sort",
      "sort",
      "brand",
      "brand",
    ]);
  });

  it("only match the ten languages, never a search query, and never reference order", () => {
    for (const rule of rules) {
      for (const locale of locales) expect(rule.source).toContain(locale);
      expect(rule.missing).toEqual([{ type: "query", key: "q" }]);
      const sort = rule.has.find((h) => h.key === "sort");
      if (sort) expect(sort.value).not.toContain("reference");
    }
  });

  it("lead to the internal route, with reference order or any brand by default", () => {
    expect(rules.map((r) => r.destination)).toEqual([
      `/:lang/:section/~:sort~:brand/:page`,
      `/:lang/:section/~:sort~:brand/1`,
      `/:lang/:section/~:sort~-/:page`,
      `/:lang/:section/~:sort~-/1`,
      `/:lang/:section/~reference~:brand/:page`,
      `/:lang/:section/~reference~:brand/1`,
    ]);
  });
});

describe("price order", () => {
  const before = {
    id: 7,
    reference: "SK7",
    brand: 3,
    category: 2,
    priceCents: 1990,
  };

  it("is refreshed in the product's category when its price changes", () => {
    expect(
      tagsForProductChange(7, { ...before, priceCents: 1 }, before),
    ).toEqual(["product:7:price", "category:2:prices"]);
  });
});
