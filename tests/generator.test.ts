// The generator alone, without a database (docs/adr/0007-catalog-data-model.md).
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  brandRows,
  categories,
  categoryLocaleRows,
  compatibilityRows,
  MILLION_PRODUCT_ID,
  MODEL_COUNT,
  modelRows,
  productLocaleRows,
  productRows,
  type ScaleName,
  scales,
  slugify,
} from "../catalog/generator.ts";
import { showcaseProducts } from "../catalog/showcase.ts";
import { locales } from "../cms/locales.ts";

function digest(seed: number, scale: ScaleName): string {
  const hash = createHash("sha256");
  const tables: Iterable<readonly unknown[]>[] = [
    categoryLocaleRows(),
    brandRows(seed, scale),
    productRows(seed, scale),
    productLocaleRows(scale),
    modelRows(seed, scale),
    compatibilityRows(seed, scale),
  ];
  for (const rows of tables) {
    for (const row of rows) hash.update(`${row.join("\t")}\n`);
    hash.update("--\n");
  }
  return hash.digest("hex");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("determinism", () => {
  it("gives the same catalog for the same seed and scale, without Math.random", () => {
    vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("The generator must not use Math.random.");
    });
    expect(digest(1, "small")).toBe(digest(1, "small"));
  });

  it("gives a different catalog for another seed", () => {
    expect(digest(2, "small")).not.toBe(digest(1, "small"));
  });
});

describe("compatibility", () => {
  it("gives the million-model product every model once, with ranks from 1", () => {
    const seen = new Uint8Array(MODEL_COUNT + 1);
    let expectedRank = 1;
    for (const [productId, rank, modelId] of compatibilityRows(1, "small")) {
      if (productId !== MILLION_PRODUCT_ID) break;
      expect(rank).toBe(expectedRank++);
      expect(seen[modelId]).toBe(0);
      seen[modelId] = 1;
    }
    expect(expectedRank - 1).toBe(1_000_000);
    expect(seen.slice(1).every((flag) => flag === 1)).toBe(true);
  });

  it("gives every other product 1 to 50 distinct models, ranked from 1", () => {
    const perProduct = new Map<
      number,
      { ranks: number[]; models: Set<number> }
    >();
    for (const [productId, rank, modelId] of compatibilityRows(1, "small")) {
      if (productId === MILLION_PRODUCT_ID) continue;
      const entry = perProduct.get(productId) ?? {
        ranks: [],
        models: new Set(),
      };
      entry.ranks.push(rank);
      entry.models.add(modelId);
      perProduct.set(productId, entry);
      expect(modelId).toBeGreaterThanOrEqual(1);
      expect(modelId).toBeLessThanOrEqual(MODEL_COUNT);
    }
    expect(perProduct.size).toBe(scales.small.products - 1);
    for (const { ranks, models } of perProduct.values()) {
      expect(ranks.length).toBeGreaterThanOrEqual(1);
      expect(ranks.length).toBeLessThanOrEqual(50);
      expect(ranks).toEqual(ranks.map((_, index) => index + 1));
      expect(models.size).toBe(ranks.length);
    }
  });
});

describe("rows", () => {
  it("marks the listed showcase products only, each in its listed category, at every scale and seed", () => {
    const listed = new Map(showcaseProducts.map((p) => [p.id, p.categoryId]));
    for (const scale of ["small", "full"] as const) {
      for (const seed of [1, 2]) {
        const marked = new Map<number, number>();
        for (const [id, , , categoryId, , showcase] of productRows(
          seed,
          scale,
        )) {
          if (showcase) marked.set(id, categoryId);
        }
        expect(marked).toEqual(listed);
      }
    }
  });

  it("lists one showcase product per category, within the small catalog", () => {
    const categoryIds = showcaseProducts.map((p) => p.categoryId).sort();
    expect(categoryIds).toEqual(
      categories()
        .map((c) => c.id)
        .sort(),
    );
    for (const { id } of showcaseProducts) {
      expect(id).toBeGreaterThanOrEqual(1);
      expect(id).toBeLessThanOrEqual(scales.small.products);
    }
  });

  it("stores the French text of the showcase products only, with words for their address", () => {
    for (const scale of ["small", "full"] as const) {
      const rows = [...productLocaleRows(scale)];
      expect(rows.map(([, , , id]) => id).sort()).toEqual(
        showcaseProducts.map((p) => p.id).sort(),
      );
      for (const [name, description, locale, id] of rows) {
        expect(locale).toBe("fr");
        expect(name.trim()).toBe(name);
        expect(description.trim()).toBe(description);
        expect(description.length).toBeGreaterThan(name.length);
        // The address words come from the name (site/addresses.ts).
        expect(slugify(name), String(id)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      }
    }
  });

  // The showcase only adds its flag: for seed 1, the categories it fixes are
  // the ones already drawn, so every other value is the catalog loaded before
  // issue #98 (these digests were taken from that generator).
  it("keeps every product's other values for seed 1", () => {
    const before = {
      small: "39dbc92cb40f51b217f34e87fe57ba517075b18429c5a6bf8f84d609258a9337",
      full: "ca8cdf7dcf40d42398816e6e191ba25554c0c500835a073ab3900f497f8b9a8d",
    };
    for (const scale of ["small", "full"] as const) {
      const hash = createHash("sha256");
      for (const row of productRows(1, scale)) {
        hash.update(`${[...row.slice(0, 5), false].join("\t")}\n`);
      }
      expect(hash.digest("hex")).toBe(before[scale]);
    }
  });

  it("gives unique product and model references", () => {
    const products = new Set<string>();
    for (const [, reference] of productRows(1, "small"))
      products.add(reference);
    expect(products.size).toBe(scales.small.products);

    const models = new Set<string>();
    for (const [, , reference] of modelRows(1, "small")) models.add(reference);
    expect(models.size).toBe(MODEL_COUNT);
  });

  it("gives every scale its number of unique brands", () => {
    for (const scale of Object.keys(scales) as ScaleName[]) {
      const rows = brandRows(1, scale);
      expect(rows).toHaveLength(scales[scale].brands);
      expect(new Set(rows.map(([, name]) => name)).size).toBe(rows.length);
      expect(new Set(rows.map(([, , slug]) => slug)).size).toBe(rows.length);
    }
  });

  it("names every category in every language, with ASCII slugs unique per language", () => {
    const rows = [...categoryLocaleRows()];
    for (const locale of locales) {
      const slugs = rows
        .filter(([, , l]) => l === locale)
        .map(([, slug]) => slug);
      expect(slugs.length).toBeGreaterThan(0);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const slug of slugs)
        expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("slugifies letters that Unicode does not decompose", () => {
    expect(slugify("Pompa odpływowa")).toBe("pompa-odplywowa");
    expect(slugify("Afløbspumpe")).toBe("aflobspumpe");
    expect(slugify("Hængsel")).toBe("haengsel");
    expect(slugify("Żarówka")).toBe("zarowka");
  });
});
