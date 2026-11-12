// The site's addresses (docs/adr/0011-languages-and-seo.md, issue #73).
import { describe, expect, it } from "vitest";
import { categories, productReference } from "../catalog/generator.ts";
import { type Locale, locales } from "../cms/locales.ts";
import {
  isLocale,
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
