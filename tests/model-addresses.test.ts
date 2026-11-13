// Model addresses and reference page addresses
// (docs/adr/0009-compatible-references.md, docs/adr/0011-languages-and-seo.md,
// issue #79).
import { describe, expect, it } from "vitest";
import {
  brandRows,
  categoryLocaleRows,
  MODEL_COUNT,
  modelRows,
} from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import {
  BRAND_SLUG,
  CATEGORY_SLUG,
  isModelWord,
  MODEL_REFERENCE,
  MODEL_WORDS,
  modelPath,
  modelPaths,
  parseModelSegment,
  parsePageNumber,
  REFERENCES_PER_PAGE,
  referencePageCount,
  referencePagePath,
  referencePageRanks,
} from "../site/addresses.ts";

describe("model words", () => {
  it("are valid lowercase ASCII words in every language", () => {
    for (const locale of locales) {
      expect(MODEL_WORDS[locale]).toMatch(CATEGORY_SLUG);
      expect(MODEL_WORDS[locale]).not.toContain("-");
    }
  });

  it("never equal a generated category slug, in any language", () => {
    for (const [, slug] of categoryLocaleRows())
      expect(isModelWord(slug), slug).toBe(false);
  });

  it("are recognised in any language and letter case", () => {
    expect(isModelWord("appareil")).toBe(true);
    expect(isModelWord("Geraet")).toBe(true);
    expect(isModelWord("p")).toBe(false);
    expect(isModelWord("")).toBe(false);
  });
});

describe("generated keys", () => {
  it("give every brand a slug that follows the brand slug rule", () => {
    for (const scale of ["small", "full"] as const)
      for (const [, , slug] of brandRows(1, scale))
        expect(slug).toMatch(BRAND_SLUG);
  });

  it("give every model a reference that follows the model reference rule", () => {
    let count = 0;
    for (const [, , reference] of modelRows(1, "full")) {
      if (!MODEL_REFERENCE.test(reference))
        throw new Error(`Model reference ${reference} breaks the rule.`);
      count++;
    }
    expect(count).toBe(MODEL_COUNT);
  });
});

describe("modelPath", () => {
  const key = { brandSlug: "norium", reference: "AB00K1-42" };

  it("builds /<lang>/<model word>/<brand>-<reference> in lowercase", () => {
    expect(modelPath("fr", key)).toBe("/fr/appareil/norium-ab00k1-42");
    expect(modelPath("de", key)).toBe("/de/geraet/norium-ab00k1-42");
  });

  it("reads back to the same key in every language", () => {
    for (const [locale, path] of Object.entries(modelPaths(key))) {
      expect(
        path.startsWith(`/${locale}/${MODEL_WORDS[locale as "fr"]}/`),
      ).toBe(true);
      expect(parseModelSegment(path.split("/")[3] as string)).toEqual(key);
    }
  });
});

describe("parseModelSegment", () => {
  it("splits the brand at the first hyphen, whatever the letter case", () => {
    expect(parseModelSegment("norium-ab00k1-42")).toEqual({
      brandSlug: "norium",
      reference: "AB00K1-42",
    });
    expect(parseModelSegment("NORIUM-AB00K1-42")).toEqual({
      brandSlug: "norium",
      reference: "AB00K1-42",
    });
    expect(parseModelSegment("norium-x")).toEqual({
      brandSlug: "norium",
      reference: "X",
    });
  });

  it.each([
    "norium",
    "-ab00k1-42",
    "norium-",
    "norium--ab00k1",
    "norium-ab00k1-",
    "norium-ab_00",
    "nor_ium-ab00",
    "noriüm-ab00",
    "",
  ])("refuses %j", (segment) => {
    expect(parseModelSegment(segment)).toBeNull();
  });
});

describe("reference pages", () => {
  it("map page n to ranks (n − 1) × 500 + 1 to n × 500, from rank 1", () => {
    expect(REFERENCES_PER_PAGE).toBe(500);
    expect(referencePageRanks(1)).toEqual({ first: 1, last: 500 });
    expect(referencePageRanks(3)).toEqual({ first: 1001, last: 1500 });
    expect(referencePageRanks(2000)).toEqual({
      first: 999_501,
      last: 1_000_000,
    });
  });

  it("count the pages a number of references needs", () => {
    expect(referencePageCount(0)).toBe(0);
    expect(referencePageCount(1001)).toBe(3);
    expect(referencePageCount(1_000_000)).toBe(2000);
  });

  it("sit at the product's address followed by /<n>", () => {
    expect(referencePagePath("/fr/bouton/bouton-norium-sp000001", 2)).toBe(
      "/fr/bouton/bouton-norium-sp000001/2",
    );
  });

  it("read only a positive whole number with no sign or leading zero", () => {
    expect(parsePageNumber("1")).toBe(1);
    expect(parsePageNumber("2000")).toBe(2000);
    for (const value of ["", "0", "01", "-1", "+1", "1.0", "1e3", "a", " 1"])
      expect(parsePageNumber(value), value).toBeNull();
  });
});
