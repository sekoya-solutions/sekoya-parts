// Which cached reads a product save refreshes
// (docs/adr/0008-caching-and-partial-refresh.md, docs/adr/0011-languages-and-seo.md).
import { describe, expect, it } from "vitest";
import {
  referenceListTags,
  tagsForBrandChange,
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
    "refreshes the description, which the heading and the address share, when %s changes",
    (field) => {
      const doc = { ...before, [field]: field === "showcase" ? true : "X" };
      expect(tagsForProductChange(7, doc, before)).toEqual([
        "product:7:description",
      ]);
    },
  );

  it("refreshes the description and both references' lookups when the reference changes", () => {
    expect(
      tagsForProductChange(7, { ...before, reference: "SK8" }, before),
    ).toEqual([
      "product:7:description",
      "product-reference:SK7",
      "product-reference:SK8",
    ]);
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
    ).toEqual(["product:7:description"]);
  });

  it("refreshes every part and the reference's lookup of a new product, whose absence may be cached", () => {
    expect(tagsForProductChange(7, before, undefined)).toEqual([
      "product:7:price",
      "product:7:description",
      "product:7:references",
      "product-reference:SK7",
    ]);
  });
});

describe("tagsForProductDelete", () => {
  it("refreshes every part and the reference's lookup", () => {
    expect(tagsForProductDelete(7, before)).toEqual([
      "product:7:price",
      "product:7:description",
      "product:7:references",
      "product-reference:SK7",
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
