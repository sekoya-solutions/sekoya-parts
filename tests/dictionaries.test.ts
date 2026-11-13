// Interface labels (docs/adr/0011-languages-and-seo.md): every key of the
// French source exists in all ten dictionaries, with text, and no dictionary
// has a key that French lacks.
import { describe, expect, it } from "vitest";
import { applianceTypes } from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import {
  applianceTypeName,
  type Dictionary,
  dictionaries,
  fill,
  placeholders,
} from "../site/dictionary.ts";

describe("dictionaries", () => {
  const sourceKeys = Object.keys(dictionaries.fr).sort();

  it.each(locales)("%s has every key, each with text", (locale) => {
    const dictionary = dictionaries[locale] as Record<string, unknown>;
    expect(Object.keys(dictionary).sort()).toEqual(sourceKeys);
    for (const key of sourceKeys) {
      const value = dictionary[key];
      expect(typeof value).toBe("string");
      expect(String(value).trim()).not.toBe("");
    }
  });
});

describe("labels with placeholders", () => {
  it.each(locales)("%s uses the same placeholders as French", (locale) => {
    for (const [key, value] of Object.entries(dictionaries.fr))
      expect(
        placeholders(dictionaries[locale][key as keyof Dictionary]),
        `${locale} ${key}`,
      ).toEqual(placeholders(value));
  });

  it("fills each placeholder and refuses a missing value", () => {
    expect(fill("Page {page} sur {pages}", { page: 2, pages: "2 000" })).toBe(
      "Page 2 sur 2 000",
    );
    expect(() => fill("{count} modèles", {})).toThrow("No value for {count}");
  });
});

describe("appliance types", () => {
  it.each(locales)("%s names each of the eight types", (locale) => {
    for (const type of applianceTypes)
      expect(applianceTypeName(dictionaries[locale], type).trim()).not.toBe("");
  });
});
