// Which page parts a product save refreshes
// (docs/adr/0008-caching-and-partial-refresh.md).
import { describe, expect, it } from "vitest";
import { tagsForProductChange } from "../site/tags.ts";

const before = {
  id: 7,
  reference: "SK-7",
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

  it.each(["name", "showcase", "reference"] as const)(
    "refreshes the description, which the heading shares, when %s changes",
    (field) => {
      const doc = { ...before, [field]: field === "showcase" ? true : "X" };
      expect(tagsForProductChange(7, doc, before)).toEqual([
        "product:7:description",
      ]);
    },
  );

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

  it("refreshes every part of a new product, whose absence may be cached", () => {
    expect(tagsForProductChange(7, before, undefined)).toEqual([
      "product:7:price",
      "product:7:description",
      "product:7:references",
    ]);
  });
});
