// Which cached reads a product save refreshes
// (docs/adr/0008-caching-and-partial-refresh.md, docs/adr/0011-languages-and-seo.md).
import { describe, expect, it } from "vitest";
import { PRODUCTS_PER_CATEGORY_PAGE } from "../site/addresses.ts";
import {
  categoryPageTags,
  MAX_CACHE_TAGS,
  referenceListTags,
  tagsForBrandChange,
  tagsForCategoryChange,
  tagsForProductChange,
  tagsForProductDelete,
} from "../site/tags.ts";

const before = {
  id: 7,
  reference: "SK7",
  brand: 3,
  category: 2,
  priceCents: 1990,
  showcase: false,
  name: null,
  description: null,
};

describe("tagsForProductChange", () => {
  it("refreshes only the price when the price changes", () => {
    expect(
      tagsForProductChange(7, { ...before, priceCents: 2490 }, before),
    ).toEqual(["product:7:price"]);
  });

  it("refreshes only the description when the description changes", () => {
    expect(
      tagsForProductChange(7, { ...before, description: "Neuf" }, before),
    ).toEqual(["product:7:description"]);
  });

  it.each(["name", "showcase"] as const)(
    "refreshes the description, which the heading and the address share, and the category's listing, which shows the name, when %s changes",
    (field) => {
      const doc = { ...before, [field]: field === "showcase" ? true : "X" };
      expect(tagsForProductChange(7, doc, before)).toEqual([
        "product:7:description",
        "category:2:listing",
      ]);
    },
  );

  it("refreshes the description, both references' lookups and the listing, whose order follows references, when the reference changes", () => {
    expect(
      tagsForProductChange(7, { ...before, reference: "SK8" }, before),
    ).toEqual([
      "product:7:description",
      "product-reference:SK7",
      "product-reference:SK8",
      "category:2:listing",
    ]);
  });

  it("refreshes the listings of the old and the new category when the product moves", () => {
    expect(
      tagsForProductChange(7, { ...before, category: { id: 5 } }, before),
    ).toEqual([
      "product:7:description",
      "category:2:listing",
      "category:5:listing",
    ]);
  });

  it("leaves the listing alone when only the price or the description changes", () => {
    expect(
      tagsForProductChange(
        7,
        { ...before, priceCents: 1, description: "Neuf" },
        before,
      ),
    ).not.toContain("category:2:listing");
  });

  it("refreshes both when the price and the description change", () => {
    expect(
      tagsForProductChange(
        7,
        { ...before, priceCents: 1, description: "Neuf" },
        before,
      ),
    ).toEqual(["product:7:price", "product:7:description"]);
  });

  it("refreshes nothing when nothing changed", () => {
    expect(tagsForProductChange(7, { ...before }, before)).toEqual([]);
  });

  it("compares relationships by id, whether populated or not", () => {
    const populated = { ...before, brand: { id: 3, name: "Brand" } };
    expect(tagsForProductChange(7, populated, before)).toEqual([]);
    expect(
      tagsForProductChange(7, { ...before, brand: { id: 4 } }, before),
    ).toEqual(["product:7:description", "category:2:listing"]);
  });

  it("refreshes every part, the reference's lookup of a new product, whose absence may be cached, and the listing it joins", () => {
    expect(tagsForProductChange(7, before, undefined)).toEqual([
      "product:7:price",
      "product:7:description",
      "product:7:references",
      "product-reference:SK7",
      "category:2:listing",
    ]);
  });
});

describe("tagsForProductDelete", () => {
  it("refreshes every part, the reference's lookup and the listing it leaves", () => {
    expect(tagsForProductDelete(7, before)).toEqual([
      "product:7:price",
      "product:7:description",
      "product:7:references",
      "product-reference:SK7",
      "category:2:listing",
    ]);
  });
});

describe("tagsForBrandChange", () => {
  it("refreshes the brand and the model lookups of its old and new slugs", () => {
    expect(
      tagsForBrandChange(3, { slug: "norium" }, { slug: "noryum" }),
    ).toEqual(["brand:3", "brand-slug:noryum", "brand-slug:norium"]);
  });

  it("names a slug once when it does not change, and handles a new brand", () => {
    expect(
      tagsForBrandChange(3, { slug: "norium" }, { slug: "norium" }),
    ).toEqual(["brand:3", "brand-slug:norium"]);
    expect(tagsForBrandChange(4, { slug: "velto" })).toEqual([
      "brand:4",
      "brand-slug:velto",
    ]);
  });
});

describe("referenceListTags", () => {
  it("tags a list with its product's references, the catalog and each brand once", () => {
    expect(referenceListTags(1, [5, 2, 5, 9, 2])).toEqual([
      "product:1:references",
      "catalog",
      "brand:2",
      "brand:5",
      "brand:9",
    ]);
  });
});

describe("tagsForCategoryChange", () => {
  it("refreshes the category and the list of categories, which a new one joins", () => {
    expect(tagsForCategoryChange(4)).toEqual(["category:4", "categories"]);
  });
});

describe("categoryPageTags", () => {
  it("tags a page with its listing, its category, the catalog, each price and each brand once", () => {
    expect(categoryPageTags(2, [30, 10, 20], [5, 2, 5])).toEqual([
      "category:2:listing",
      "category:2",
      "catalog",
      "product:10:price",
      "product:20:price",
      "product:30:price",
      "brand:2",
      "brand:5",
    ]);
  });

  it("stays within Next.js's limit when every product of a full page has its own brand", () => {
    const ids = Array.from(
      { length: PRODUCTS_PER_CATEGORY_PAGE },
      (_, i) => i + 1,
    );
    const tags = categoryPageTags(1, ids, ids);
    expect(tags).toHaveLength(3 + 2 * PRODUCTS_PER_CATEGORY_PAGE);
    expect(tags.length).toBeLessThanOrEqual(MAX_CACHE_TAGS);
  });

  it("refuses a list over the limit rather than an entry that misses refreshes", () => {
    const ids = Array.from({ length: 70 }, (_, i) => i + 1);
    expect(() => categoryPageTags(1, ids, ids)).toThrow(
      "over the limit of 128",
    );
  });
});

describe("MAX_CACHE_TAGS", () => {
  it("is the limit of the installed Next.js", async () => {
    const { NEXT_CACHE_TAG_MAX_ITEMS } = await import(
      "next/dist/lib/constants.js"
    );
    expect(MAX_CACHE_TAGS).toBe(NEXT_CACHE_TAG_MAX_ITEMS);
  });
});
