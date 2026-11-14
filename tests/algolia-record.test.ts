// Algolia's product records (docs/adr/0010-search.md, issue #115): pure
// functions, tested without Algolia or a database.
import { describe, expect, it } from "vitest";
import { locales } from "../cms/locales.ts";
import {
  buildRecord,
  INDEX_CAPACITY,
  MAX_RECORD_BYTES,
  productPopularity,
  RECORD_MODEL_REFERENCES,
  type RecordInput,
  recordBytes,
  recordModelKey,
  selectIndexed,
} from "../site/algolia-record.ts";

const perLocale = (value: string) =>
  Object.fromEntries(locales.map((l) => [l, `${value}-${l}`]));

const input = (overrides: Partial<RecordInput> = {}): RecordInput => ({
  id: 7,
  reference: "SP000007",
  brand: "Motoon",
  categoryId: 3,
  priceCents: 1999,
  showcase: false,
  showcaseNames: null,
  categoryNames: perLocale("Joint"),
  categorySlugs: perLocale("joint"),
  modelReferences: ["AB00K1-42", "CD 0001-07"],
  ...overrides,
});

describe("the index capacities", () => {
  it("stay within the free plan's 50,000 records together", () => {
    const total = Object.values(INDEX_CAPACITY).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(50_000);
    expect(INDEX_CAPACITY.production).toBe(45_000);
  });
});

describe("productPopularity", () => {
  it("is stable and within range", () => {
    expect(productPopularity(42)).toBe(productPopularity(42));
    for (let id = 1; id <= 1000; id++) {
      const p = productPopularity(id);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1_000_000);
    }
  });

  it("spreads products apart", () => {
    const scores = new Set(
      Array.from({ length: 1000 }, (_, i) => productPopularity(i + 1)),
    );
    expect(scores.size).toBeGreaterThan(990);
  });
});

describe("selectIndexed", () => {
  const products = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    showcase: i + 1 === 90 || i + 1 === 95,
  }));

  it("keeps every showcase product, then the most popular", () => {
    const ids = selectIndexed(products, 10);
    expect(ids).toHaveLength(10);
    expect(ids.slice(0, 2)).toEqual([90, 95]);
    const chosen = ids.slice(2).map(productPopularity);
    const lowestChosen = Math.min(...chosen);
    for (const p of products) {
      if (p.showcase || ids.includes(p.id)) continue;
      expect(productPopularity(p.id)).toBeLessThanOrEqual(lowestChosen);
    }
  });

  it("takes everything when the catalog is smaller than the index", () => {
    expect(selectIndexed(products, 1000)).toHaveLength(100);
  });

  it("refuses more showcase products than the index holds", () => {
    expect(() => selectIndexed(products, 1)).toThrow(/showcase/);
  });
});

describe("buildRecord", () => {
  it("holds the names and addresses of the ten languages", () => {
    const record = buildRecord(input());
    expect(record.objectID).toBe("7");
    expect(record.name_fr).toBe("Joint-fr Motoon SP000007");
    for (const locale of locales) {
      expect(record[`name_${locale}`]).toContain("SP000007");
      expect(record[`path_${locale}`]).toMatch(new RegExp(`^/${locale}/`));
    }
  });

  it("uses a showcase product's stored names, French when one is missing", () => {
    const record = buildRecord(
      input({ showcase: true, showcaseNames: { fr: "Bouton", en: "Knob" } }),
    );
    expect(record.name_en).toBe("Knob");
    expect(record.name_de).toBe("Bouton");
  });

  it("normalises model references as the model search does", () => {
    expect(buildRecord(input()).models).toEqual(["AB00K142", "CD000107"]);
    expect(recordModelKey("ab-12 c")).toBe("AB12C");
  });

  it("holds at most 500 models, the most popular", () => {
    const many = Array.from({ length: 2000 }, (_, i) => `AB${i}-01`);
    const record = buildRecord(input({ modelReferences: many }));
    expect(record.models).toHaveLength(RECORD_MODEL_REFERENCES);
    expect(record.models[0]).toBe("AB001");
    expect(recordBytes(record)).toBeLessThanOrEqual(MAX_RECORD_BYTES);
  });

  it("drops the least popular models to stay under the size limit", () => {
    const long = Array.from({ length: 500 }, (_, i) => `${"X".repeat(30)}${i}`);
    const record = buildRecord(input({ modelReferences: long }));
    expect(record.models.length).toBeLessThan(500);
    expect(record.models.length).toBeGreaterThan(0);
    expect(record.models[0]).toBe(`${"X".repeat(30)}0`);
    expect(recordBytes(record)).toBeLessThanOrEqual(MAX_RECORD_BYTES);
  });

  it("refuses a record over the limit even without models", () => {
    const huge = { fr: "N".repeat(MAX_RECORD_BYTES) };
    expect(() =>
      buildRecord(input({ showcase: true, showcaseNames: huge })),
    ).toThrow(/exceeds/);
  });
});
