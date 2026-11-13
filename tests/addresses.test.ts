// The site's addresses (docs/adr/0011-languages-and-seo.md, issue #73).
import { describe, expect, it } from "vitest";
import { categories, productReference } from "../catalog/generator.ts";
import { type Locale, locales } from "../cms/locales.ts";
import {
  type CategoryNaming,
  categoryPageCount,
  categoryPath,
  findCategory,
  isLocale,
  isPageSegment,
  isProductReference,
  languageAlternates,
  parseProductSegment,
  perLocale,
  productAddresses,
  productPath,
  productWords,
} from "../site/addresses.ts";

const ASCII_PATH =
  /^\/[a-z]{2}\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe("isLocale", () => {
  it("accepts the ten languages only", () => {
    for (const locale of locales) expect(isLocale(locale)).toBe(true);
    for (const value of ["", "FR", "en-GB", "xx", "product"])
      expect(isLocale(value)).toBe(false);
  });
});

describe("isProductReference", () => {
  it("accepts uppercase letters and digits only", () => {
    expect(isProductReference("SP000001")).toBe(true);
    expect(isProductReference(productReference(100_000))).toBe(true);
    for (const value of ["", "sp000001", "SP-1", "SP 1", "SPÉ1"])
      expect(isProductReference(value)).toBe(false);
  });

  it("needs a letter, so a number after a category slug is always a page", () => {
    for (const value of ["1", "2", "000123", "1234567"]) {
      expect(isProductReference(value)).toBe(false);
      expect(isPageSegment(value)).toBe(true);
    }
    for (const value of ["1A", "A1", "Z"])
      expect(isProductReference(value)).toBe(true);
  });
});

describe("productPath", () => {
  it("builds /<lang>/<category slug>/<words>-<reference> in lowercase", () => {
    expect(
      productPath(
        "fr",
        "joint-de-porte",
        "Joint de porte Zentrix SP000001",
        "SP000001",
      ),
    ).toBe("/fr/joint-de-porte/joint-de-porte-zentrix-sp000001");
  });

  it.each([
    ["de", "Weißer Riemen", "/de/weisser-riemen/weisser-riemen-sp000001"],
    ["pl", "Pompa odpływowa", "/pl/pompa-odplywowa/pompa-odplywowa-sp000001"],
    ["da", "Afløbspumpe", "/da/aflobspumpe/aflobspumpe-sp000001"],
    ["da", "Hængsel", "/da/haengsel/haengsel-sp000001"],
    [
      "fr",
      "Résistance élevée",
      "/fr/resistance-elevee/resistance-elevee-sp000001",
    ],
  ] as const)("turns %s %s into ASCII", (locale, name, path) => {
    expect(productPath(locale, name, name, "SP000001")).toBe(path);
  });

  it("gives lowercase ASCII addresses that read back to the reference, for every category in every language", () => {
    for (const category of categories()) {
      for (const locale of locales) {
        const name = `${category.names[locale]} Zentrix SP000042`;
        const path = productPath(
          locale,
          category.names[locale],
          name,
          "SP000042",
        );
        expect(path).toMatch(ASCII_PATH);
        const segment = path.split("/")[3] as string;
        expect(parseProductSegment(segment)).toBe("SP000042");
      }
    }
  });

  it("keeps only the reference when the name has no other words", () => {
    expect(productWords("SP000001", "SP000001")).toBe("");
    expect(productPath("en", "belt", "SP000001", "SP000001")).toBe(
      "/en/belt/sp000001",
    );
  });
});

describe("parseProductSegment", () => {
  it("reads the reference after the last hyphen, in any letter case", () => {
    expect(parseProductSegment("courroie-zentrix-sp000001")).toBe("SP000001");
    expect(parseProductSegment("Courroie-SP000001")).toBe("SP000001");
    expect(parseProductSegment("sp000001")).toBe("SP000001");
  });

  it("returns null when the last word cannot be a reference", () => {
    for (const segment of ["", "courroie-", "courroie-sp_1", "é"])
      expect(parseProductSegment(segment)).toBeNull();
  });
});

describe("productAddresses", () => {
  const names = perLocale((locale) => `Courroie ${locale}`);
  const slugs = perLocale((locale) => `courroie-${locale}`);

  it("builds an ordinary product's name and address in each language", () => {
    const { names: built, paths } = productAddresses({
      reference: "SP000007",
      showcaseNames: null,
      categoryNames: names,
      categorySlugs: slugs,
      brand: "Zentrix",
    });
    for (const locale of locales) {
      expect(built[locale]).toBe(`Courroie ${locale} Zentrix SP000007`);
      expect(paths[locale]).toBe(
        `/${locale}/courroie-${locale}/courroie-${locale}-zentrix-sp000007`,
      );
    }
  });

  it("uses a showcase product's stored name, else its French one", () => {
    const { names: built, paths } = productAddresses({
      reference: "SP000007",
      showcaseNames: { fr: "Courroie renforcée", en: "Reinforced belt" },
      categoryNames: names,
      categorySlugs: slugs,
      brand: "Zentrix",
    });
    expect(built.en).toBe("Reinforced belt");
    expect(built.de).toBe("Courroie renforcée");
    expect(paths.en).toBe("/en/courroie-en/reinforced-belt-sp000007");
    expect(paths.de).toBe("/de/courroie-de/courroie-renforcee-sp000007");
  });

  it("falls back to the French category, and fails when French is missing too", () => {
    const { paths } = productAddresses({
      reference: "SP000007",
      showcaseNames: null,
      categoryNames: { fr: "Courroie" },
      categorySlugs: { fr: "courroie" },
      brand: "Zentrix",
    });
    expect(paths.sv).toBe("/sv/courroie/courroie-zentrix-sp000007");
    expect(() =>
      productAddresses({
        reference: "SP000007",
        showcaseNames: null,
        categoryNames: { en: "Belt" },
        categorySlugs: { en: "belt" },
        brand: "Zentrix",
      }),
    ).toThrow("No category name in fr or in French.");
  });
});

describe("languageAlternates", () => {
  it("lists the ten versions and the x-default", () => {
    const paths = perLocale((locale: Locale) => `/${locale}`);
    const alternates = languageAlternates(paths, "/");
    expect(Object.keys(alternates)).toEqual([...locales, "x-default"]);
    expect(alternates["x-default"]).toBe("/");
  });
});

describe("category pages", () => {
  it("puts page 1 at /<lang>/<slug> and page n at /<lang>/<slug>/<n>", () => {
    expect(categoryPath("fr", "joint-de-porte")).toBe("/fr/joint-de-porte");
    expect(categoryPath("fr", "joint-de-porte", 1)).toBe("/fr/joint-de-porte");
    expect(categoryPath("en", "door-seal", 7)).toBe("/en/door-seal/7");
  });

  it("counts 48 products a page, and one page for an empty category", () => {
    expect(categoryPageCount(0)).toBe(1);
    expect(categoryPageCount(1)).toBe(1);
    expect(categoryPageCount(48)).toBe(1);
    expect(categoryPageCount(49)).toBe(2);
    expect(categoryPageCount(8_333)).toBe(174);
  });

  it("reads only digits as a page segment", () => {
    for (const value of ["sp000001", "bouton-norium-sp000001", "1a", "-1", ""])
      expect(isPageSegment(value)).toBe(false);
  });

  it("tells every generated product segment apart from a page segment", () => {
    const naming = categories()[0];
    if (!naming) throw new Error("No category.");
    for (const id of [1, 2, 99_999, 100_000]) {
      const reference = productReference(id);
      for (const locale of locales) {
        const { paths } = productAddresses({
          reference,
          showcaseNames: null,
          categoryNames: naming.names,
          categorySlugs: naming.names,
          brand: "Norium",
        });
        const segment = paths[locale].split("/")[3] as string;
        expect(isPageSegment(segment), segment).toBe(false);
        expect(parseProductSegment(segment)).toBe(reference);
      }
    }
  });
});

describe("findCategory", () => {
  const make = (
    id: number,
    slug: (locale: Locale) => string,
  ): CategoryNaming => ({
    id,
    names: perLocale((locale) => `Name ${id} ${locale}`),
    slugs: perLocale(slug),
  });
  const seal = make(1, (locale) =>
    locale === "fr" ? "joint" : `seal-${locale}`,
  );
  const filter = make(2, () => "filter");
  const list = [seal, filter];

  it("finds a slug in the address's language, in any letter case", () => {
    expect(findCategory(list, "fr", "joint")).toBe(seal);
    expect(findCategory(list, "fr", "JOINT")).toBe(seal);
    expect(findCategory(list, "de", "filter")).toBe(filter);
  });

  it("finds another language's slug, for the page to redirect", () => {
    expect(findCategory(list, "de", "joint")).toBe(seal);
    expect(findCategory(list, "fr", "seal-en")).toBe(seal);
  });

  it("prefers the address's language when two categories share a word", () => {
    const clash = make(3, (locale) =>
      locale === "en" ? "joint" : `clash-${locale}`,
    );
    expect(findCategory([clash, seal], "fr", "joint")).toBe(seal);
    expect(findCategory([clash, seal], "en", "joint")).toBe(clash);
  });

  it("finds nothing for an unknown slug", () => {
    expect(findCategory(list, "fr", "nothing")).toBeNull();
    expect(findCategory(list, "fr", "")).toBeNull();
  });
});
