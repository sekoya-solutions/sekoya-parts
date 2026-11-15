// Brand pages' addresses and cache tags (issue #147).
import { describe, expect, it } from "vitest";
import { categoryLocaleRows } from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import {
  BRAND_SLUG,
  BRAND_WORDS,
  brandIndexPath,
  brandPath,
  CATEGORY_SLUG,
  INFO_PAGES,
  INFO_SLUGS,
  isBrandWord,
  isModelWord,
  isReservedWord,
  isSearchWord,
  PRODUCTS_PER_CATEGORY_PAGE,
} from "../site/addresses.ts";
import { brandPageTags, MAX_CACHE_TAGS } from "../site/tags.ts";

describe("brand words", () => {
  it("are valid lowercase ASCII words in every language", () => {
    for (const locale of locales) {
      expect(BRAND_WORDS[locale]).toMatch(CATEGORY_SLUG);
      expect(BRAND_WORDS[locale]).not.toContain("-");
    }
  });

  it("are reserved, and never a model word, a search word, an information page or a generated category slug", () => {
    const infoSlugs = new Set(
      INFO_PAGES.flatMap((page) => Object.values(INFO_SLUGS[page])),
    );
    for (const word of Object.values(BRAND_WORDS)) {
      expect(isReservedWord(word), word).toBe(true);
      expect(isModelWord(word), word).toBe(false);
      expect(isSearchWord(word), word).toBe(false);
      expect(infoSlugs.has(word), word).toBe(false);
    }
    const words = new Set(Object.values(BRAND_WORDS));
    for (const [, slug] of categoryLocaleRows())
      expect(words.has(slug), slug).toBe(false);
  });

  it("are recognised in any language and letter case", () => {
    expect(isBrandWord("marques")).toBe(true);
    expect(isBrandWord("Brands")).toBe(true);
    expect(isBrandWord("marque")).toBe(false);
  });
});

describe("brand addresses", () => {
  it("put the index under the language's brand word", () => {
    expect(brandIndexPath("fr")).toBe("/fr/marques");
    expect(brandIndexPath("sv")).toBe("/sv/varumarken");
  });

  it("give page 1 without a number, then /<n>", () => {
    expect(brandPath("de", "norium")).toBe("/de/marken/norium");
    expect(brandPath("de", "norium", 1)).toBe("/de/marken/norium");
    expect(brandPath("en", "norium", 3)).toBe("/en/brands/norium/3");
  });

  it("only ever hold a slug that cannot end a brand word", () => {
    expect("norium").toMatch(BRAND_SLUG);
    expect("nor-ium").not.toMatch(BRAND_SLUG);
  });
});

describe("brandPageTags", () => {
  it("tags a page with its listing, its brand, the catalog, each price and each category once", () => {
    expect(brandPageTags(3, [30, 10, 20], [5, 2, 5])).toEqual([
      "brand:3:listing",
      "brand:3",
      "catalog",
      "product:10:price",
      "product:20:price",
      "product:30:price",
      "category:2",
      "category:5",
    ]);
  });

  it("stays under Next.js's tag limit on a full page of 48 products in 12 categories", () => {
    const ids = Array.from({ length: PRODUCTS_PER_CATEGORY_PAGE }, (_, i) => i);
    const categories = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(brandPageTags(1, ids, categories).length).toBeLessThanOrEqual(
      MAX_CACHE_TAGS,
    );
  });

  it("refuses a list over the limit rather than drop tags", () => {
    const ids = Array.from({ length: MAX_CACHE_TAGS }, (_, i) => i);
    expect(() => brandPageTags(1, ids, [])).toThrow(/over the limit/);
  });
});
