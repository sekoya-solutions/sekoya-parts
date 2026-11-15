// The part finder's addresses and reserved words (issue #155).
import { describe, expect, it } from "vitest";
import { applianceTypes, categoryLocaleRows } from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import {
  BRAND_WORDS,
  CATEGORY_SLUG,
  FINDER_WORDS,
  finderPath,
  INFO_PAGES,
  INFO_SLUGS,
  isApplianceType,
  isFinderWord,
  isModelWord,
  isReservedWord,
  isSearchWord,
  POPULAR_MODELS,
} from "../site/addresses.ts";

describe("finder words", () => {
  it("are valid category slug forms, reserved, and never another section's word or a generated category slug", () => {
    const others = new Set([
      ...Object.values(BRAND_WORDS),
      ...INFO_PAGES.flatMap((page) => Object.values(INFO_SLUGS[page])),
    ]);
    for (const locale of locales) {
      const word = FINDER_WORDS[locale];
      expect(word).toMatch(CATEGORY_SLUG);
      expect(isReservedWord(word), word).toBe(true);
      expect(isModelWord(word), word).toBe(false);
      expect(isSearchWord(word), word).toBe(false);
      expect(others.has(word), word).toBe(false);
    }
    const words = new Set(Object.values(FINDER_WORDS));
    for (const [, slug] of categoryLocaleRows())
      expect(words.has(slug), slug).toBe(false);
  });

  it("are recognised in any language and letter case", () => {
    expect(isFinderWord("trouver-une-piece")).toBe(true);
    expect(isFinderWord("Find-A-Part")).toBe(true);
    expect(isFinderWord("find")).toBe(false);
  });
});

describe("finderPath", () => {
  it("carries the choices made so far, in order, and nothing else", () => {
    expect(finderPath("fr")).toBe("/fr/trouver-une-piece");
    expect(finderPath("en", { brand: "bedoren" })).toBe(
      "/en/find-a-part?make=bedoren",
    );
    expect(
      finderPath("de", { brand: "bedoren", type: "oven", q: "ab 12" }),
    ).toBe("/de/teil-finden?make=bedoren&appliance=oven&q=ab+12");
    expect(finderPath("fr", { brand: "", type: undefined })).toBe(
      "/fr/trouver-une-piece",
    );
  });
});

describe("the finder's choices", () => {
  it("accept the generator's appliance types only", () => {
    for (const type of applianceTypes) expect(isApplianceType(type)).toBe(true);
    expect(isApplianceType("toaster")).toBe(false);
  });

  it("list 24 popular models (owner decision)", () => {
    expect(POPULAR_MODELS).toBe(24);
  });
});

describe("the finder's query parameters", () => {
  it("are none the category pages' rewrites react to, except q, which they never rewrite", async () => {
    const { FINDER_PARAMS } = await import("../site/addresses.ts");
    const { listingRewrites } = await import("../site/listing-rewrites.ts");
    const rewritten = new Set(
      listingRewrites().flatMap((rule) => rule.has.map((has) => has.key)),
    );
    for (const name of Object.values(FINDER_PARAMS))
      expect(rewritten.has(name), name).toBe(false);
    for (const rule of listingRewrites())
      expect(rule.missing).toContainEqual({
        type: "query",
        key: FINDER_PARAMS.q,
      });
  });
});
