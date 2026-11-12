// Interface labels (docs/adr/0011-languages-and-seo.md): every key of the
// French source exists in all ten dictionaries, with text, and no dictionary
// has a key that French lacks.
import { describe, expect, it } from "vitest";
import { locales } from "../cms/locales.ts";
import { dictionaries } from "../site/dictionary.ts";

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
