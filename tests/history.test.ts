// The recently viewed products' stored history (issue #162): every read
// checks each entry, so a malformed or edited value is dropped, and real
// product addresses in each language pass the check.
import { describe, expect, it } from "vitest";
import { categories, productReference, slugify } from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import { productAddresses } from "../site/addresses.ts";
import { dictionaries } from "../site/dictionary.ts";
import {
  checkEntry,
  HISTORY_SIZE,
  type HistoryEntry,
  parseHistory,
  remember,
  shownHistory,
} from "../site/history.ts";
import { infoTexts } from "../site/info-texts.ts";

const entry = (id: number, locale: HistoryEntry["locale"] = "fr") => {
  const reference = productReference(id);
  return {
    reference,
    locale,
    name: `Courroie Zentrix ${reference}`,
    path: `/${locale}/courroie/courroie-zentrix-${reference.toLowerCase()}`,
  };
};

describe("checkEntry", () => {
  it("keeps every generated product's address and name, in each language and category", () => {
    for (const category of categories())
      for (const id of [1, 7, 99_999]) {
        const reference = productReference(id);
        const { names, paths } = productAddresses({
          reference,
          showcaseNames: null,
          categoryNames: category.names,
          categorySlugs: Object.fromEntries(
            locales.map((locale) => [locale, slugify(category.names[locale])]),
          ),
          brand: "Zentrix",
        });
        for (const locale of locales) {
          const stored = {
            reference,
            locale,
            name: names[locale],
            path: paths[locale],
          };
          expect(checkEntry(stored), paths[locale]).toEqual(stored);
        }
      }
  });

  it("keeps a showcase product's stored name with accents and punctuation", () => {
    const stored = {
      ...entry(3),
      name: "Joint de porte renforcé (hublot Ø 30 cm) « premium »",
    };
    expect(checkEntry(stored)).toEqual(stored);
  });

  it.each([
    ["not an object", "SP000001"],
    ["null", null],
    ["a missing field", { ...entry(1), name: undefined }],
    ["a lowercase reference", { ...entry(1), reference: "sp000001" }],
    [
      "an overlong reference",
      { ...entry(1), reference: `SP${"1".repeat(60)}` },
    ],
    ["an unknown language", { ...entry(1), locale: "xx" }],
    ["a blank name", { ...entry(1), name: "   " }],
    ["a name with a control character", { ...entry(1), name: "A\u0000B" }],
    ["an overlong name", { ...entry(1), name: "a".repeat(201) }],
    ["a name that is not a string", { ...entry(1), name: 12 }],
    ["a script address", { ...entry(1), path: "javascript:alert(1)" }],
    ["another site", { ...entry(1), path: "//evil.test/fr/a/b-sp000001" }],
    [
      "an absolute address",
      { ...entry(1), path: "https://evil.test/fr/a/b-sp000001" },
    ],
    ["another language's address", { ...entry(1), path: entry(1, "en").path }],
    ["another product's address", { ...entry(1), path: entry(2).path }],
    ["a query", { ...entry(1), path: `${entry(1).path}?x=1` }],
    ["a fragment", { ...entry(1), path: `${entry(1).path}#x` }],
    ["a back step", { ...entry(1), path: "/fr/../courroie-zentrix-sp000001" }],
    ["markup", { ...entry(1), path: '/fr/a/"><img-sp000001' }],
    [
      "an upper case address",
      { ...entry(1), path: entry(1).path.toUpperCase() },
    ],
  ])("drops %s", (_, value) => {
    expect(checkEntry(value)).toBeNull();
  });
});

describe("parseHistory", () => {
  it("reads nothing from an empty, broken or unexpected value", () => {
    for (const raw of [null, "", "{", "null", "42", '"x"', '{"a":1}'])
      expect(parseHistory(raw)).toEqual([]);
  });

  it("drops only the invalid entries and keeps the order", () => {
    const raw = JSON.stringify([
      entry(3),
      { ...entry(4), path: "javascript:alert(1)" },
      "junk",
      entry(5),
    ]);
    expect(parseHistory(raw)).toEqual([entry(3), entry(5)]);
  });

  it("keeps each reference once, its newest entry, and at most the history size", () => {
    const many = Array.from({ length: HISTORY_SIZE + 5 }, (_, i) =>
      entry(i + 1),
    );
    const raw = JSON.stringify([entry(2, "en"), ...many]);
    const read = parseHistory(raw);
    expect(read).toHaveLength(HISTORY_SIZE);
    expect(read[0]).toEqual(entry(2, "en"));
    expect(read.filter((e) => e.reference === entry(2).reference)).toHaveLength(
      1,
    );
  });
});

describe("remember", () => {
  it("puts the viewed product first, once, in the language just read", () => {
    const history = [entry(1), entry(2), entry(3)];
    expect(remember(history, entry(2, "en"))).toEqual([
      entry(2, "en"),
      entry(1),
      entry(3),
    ]);
  });

  it("drops the oldest beyond the history size", () => {
    const history = Array.from({ length: HISTORY_SIZE }, (_, i) =>
      entry(i + 1),
    );
    const next = remember(history, entry(50));
    expect(next).toHaveLength(HISTORY_SIZE);
    expect(next[0]).toEqual(entry(50));
    expect(next.at(-1)).toEqual(entry(HISTORY_SIZE - 1));
  });
});

describe("shownHistory", () => {
  it("shows the other products viewed in the page's language, newest first", () => {
    const history = [entry(1), entry(2, "en"), entry(3), entry(4)];
    expect(shownHistory(history, "fr", entry(3).reference)).toEqual([
      entry(1),
      entry(4),
    ]);
    expect(shownHistory(history, "en", entry(3).reference)).toEqual([
      entry(2, "en"),
    ]);
  });
});

describe("the privacy page", () => {
  it("says how to clear the history, with the button's own label, in every language", () => {
    for (const locale of locales) {
      const text = infoTexts[locale].privacy.sections
        .flatMap((section) => section.paragraphs)
        .join(" ");
      expect(text, locale).toContain(dictionaries[locale].recentlyViewedClear);
      expect(text, locale).toContain(String(HISTORY_SIZE));
    }
  });
});
