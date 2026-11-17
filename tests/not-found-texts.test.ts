// The 404 page's labels (issue #209): site/not-found-texts.ts copies four
// labels per language so the 404's browser script never imports the
// dictionaries; this fails when a copy differs from its dictionary, or when a
// language is missing, so the dictionaries stay the labels' source.
import { describe, expect, it } from "vitest";
import { locales } from "../cms/locales.ts";
import { dictionaries } from "../site/dictionary.ts";
import { NOT_FOUND_KEYS, NOT_FOUND_TEXTS } from "../site/not-found-texts.ts";

describe("the 404 page's labels", () => {
  it("cover the ten languages and no other", () => {
    expect(Object.keys(NOT_FOUND_TEXTS).sort()).toEqual([...locales].sort());
  });

  it.each(locales)("%s matches its dictionary", (locale) => {
    const expected = Object.fromEntries(
      NOT_FOUND_KEYS.map((key) => [key, dictionaries[locale][key]]),
    );
    expect(NOT_FOUND_TEXTS[locale]).toEqual(expected);
  });
});
