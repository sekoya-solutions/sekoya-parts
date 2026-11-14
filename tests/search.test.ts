// The search box's query rules and the search page's addresses
// (docs/adr/0010-search.md, issue #113).
import { describe, expect, it } from "vitest";
import {
  categoryLocaleRows,
  MODEL_COUNT,
  modelRows,
} from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import {
  CATEGORY_SLUG,
  isModelWord,
  isReservedWord,
  isSearchWord,
  SEARCH_WORDS,
  searchPath,
} from "../site/addresses.ts";
import { MAX_QUERY_LENGTH, queryOf, searchKey } from "../site/search-key.ts";

describe("search words", () => {
  it("are valid lowercase ASCII words in every language", () => {
    for (const locale of locales) {
      expect(SEARCH_WORDS[locale]).toMatch(CATEGORY_SLUG);
      expect(SEARCH_WORDS[locale]).not.toContain("-");
    }
  });

  it("never equal a model word or a generated category slug", () => {
    for (const word of Object.values(SEARCH_WORDS))
      expect(isModelWord(word), word).toBe(false);
    for (const [, slug] of categoryLocaleRows())
      expect(isReservedWord(slug), slug).toBe(false);
  });

  it("are recognised in any language and letter case", () => {
    expect(isSearchWord("recherche")).toBe(true);
    expect(isSearchWord("Suche")).toBe(true);
    expect(isSearchWord("searches")).toBe(false);
    expect(isReservedWord("appareil")).toBe(true);
    expect(isReservedWord("search")).toBe(true);
  });

  it("build the results page's address, with the query encoded", () => {
    expect(searchPath("fr")).toBe("/fr/recherche");
    expect(searchPath("de", "ab 12&x")).toBe("/de/suche?q=ab%2012%26x");
  });
});

describe("search key", () => {
  it("is the query in upper case, without spaces or dashes", () => {
    expect(searchKey("ab00k1-42")).toBe("AB00K142");
    expect(searchKey(" ab00k1 42 ")).toBe("AB00K142");
    expect(searchKey("AB–00K1—42")).toBe("AB00K142");
    expect(searchKey("ＡＢ００")).toBe("AB00");
  });

  it("is null for a query no model reference can match", () => {
    expect(searchKey("")).toBeNull();
    expect(searchKey("- -")).toBeNull();
    expect(searchKey("joint de porte")).toBe("JOINTDEPORTE");
    expect(searchKey("joint d'porte")).toBeNull();
    expect(searchKey("AB%")).toBeNull();
    expect(searchKey("a_b")).toBeNull();
    expect(searchKey("straße")).toBeNull();
    expect(searchKey("A".repeat(MAX_QUERY_LENGTH))).toBe(
      "A".repeat(MAX_QUERY_LENGTH),
    );
    expect(searchKey("A".repeat(MAX_QUERY_LENGTH + 1))).toBeNull();
  });

  it("finds every generated model reference from its own form", () => {
    let checked = 0;
    for (const [, , reference] of modelRows(1, "small")) {
      if (checked++ % 1000 !== 0) continue;
      expect(searchKey(reference)).toBe(reference.replaceAll("-", ""));
      expect(searchKey(reference.toLowerCase())).toBe(
        reference.replaceAll("-", ""),
      );
    }
    expect(checked).toBe(MODEL_COUNT);
  });
});

describe("query parameter", () => {
  it("is the first q, trimmed, or empty", () => {
    expect(queryOf(undefined)).toBe("");
    expect(queryOf("  ab12 ")).toBe("ab12");
    expect(queryOf(["x", "y"])).toBe("x");
    expect(queryOf([])).toBe("");
  });
});
