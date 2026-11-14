// Which cached reads a product save refreshes
// (docs/adr/0008-caching-and-partial-refresh.md, docs/adr/0011-languages-and-seo.md).
import { describe, expect, it } from "vitest";
import { PRODUCTS_PER_CATEGORY_PAGE } from "../site/addresses.ts";
import {
  categoryPageTags,
  MAX_CACHE_TAGS,
  referenceListTags,
  SHOWCASE_LIMIT,
  showcaseTags,
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

  it("refreshes the description, which the heading and the address share, and the category's listing, which shows the name, when the name changes", () => {
    expect(tagsForProductChange(7, { ...before, name: "X" }, before)).toEqual([
      "product:7:description",
      "category:2:listing",
    ]);
  });

  it.each([
    ["gains", before, { ...before, showcase: true }],
    ["loses", { ...before, showcase: true }, before],
  ])(
    "also refreshes the home page's showcase list when the product %s the showcase flag",
    (_, previous, doc) => {
      expect(tagsForProductChange(7, doc, previous)).toEqual([
        "product:7:description",
        "category:2:listing",
        "showcase",
      ]);
    },
  );

  it("refreshes the showcase list, ordered by reference, when a showcase product's reference changes, and not an ordinary product's", () => {
    const showcase = { ...before, showcase: true };
    expect(
      tagsForProductChange(7, { ...showcase, reference: "SK8" }, showcase),
    ).toContain("showcase");
    expect(
      tagsForProductChange(7, { ...before, reference: "SK8" }, before),
    ).not.toContain("showcase");
  });

  it("leaves the showcase list to the product's own tags on a showcase product's price or name edit, and alone on an ordinary product's", () => {
    const showcase = { ...before, showcase: true };
    expect(
      tagsForProductChange(7, { ...showcase, priceCents: 1 }, showcase),
    ).toEqual(["product:7:price"]);
    expect(
      tagsForProductChange(7, { ...showcase, name: "X" }, showcase),
    ).toEqual(["product:7:description", "category:2:listing"]);
    expect(
      tagsForProductChange(7, { ...before, priceCents: 1 }, before),
    ).toEqual(["product:7:price"]);
  });

  it("refreshes the showcase list when a new product is a showcase product", () => {
    expect(
      tagsForProductChange(7, { ...before, showcase: true }, undefined),
    ).toContain("showcase");
  });

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

describe("showcaseTags", () => {
  it("tags the list with itself, the catalog, each product's price and description, and each category and brand once", () => {
    expect(
      showcaseTags([
        { id: 30, categoryId: 2, brandId: 5 },
        { id: 10, categoryId: 1, brandId: 5 },
      ]),
    ).toEqual([
      "showcase",
      "catalog",
      "product:10:price",
      "product:30:price",
      "product:10:description",
      "product:30:description",
      "category:1",
      "category:2",
      "brand:5",
    ]);
  });

  it("matches the tags a showcase product's save refreshes", () => {
    const tags = showcaseTags([{ id: 7, categoryId: 2, brandId: 3 }]);
    const showcase = { ...before, showcase: true };
    for (const doc of [
      { ...showcase, priceCents: 1 },
      { ...showcase, name: "X" },
      { ...showcase, brand: 4 },
      { ...showcase, category: 5 },
      before,
    ])
      expect(
        tagsForProductChange(7, doc, showcase).some((tag) =>
          tags.includes(tag),
        ),
      ).toBe(true);
    expect(
      tagsForProductDelete(7, showcase).some((tag) => tags.includes(tag)),
    ).toBe(true);
  });

  it("stays within Next.js's limit at the cap, every product with its own category and brand", () => {
    const products = Array.from({ length: SHOWCASE_LIMIT }, (_, i) => ({
      id: i + 1,
      categoryId: i + 1,
      brandId: i + 1,
    }));
    expect(showcaseTags(products).length).toBeLessThanOrEqual(MAX_CACHE_TAGS);
  });

  it("refuses a list over the limit rather than an entry that misses refreshes", () => {
    const products = Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      categoryId: i + 1,
      brandId: i + 1,
    }));
    expect(() => showcaseTags(products)).toThrow("over the limit of 128");
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
