// The fit check's addresses, input checks and answers (issue #161), with no
// database: an input that cannot match is refused before any query.
import { describe, expect, it } from "vitest";
import { categoryLocaleRows } from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import {
  BRAND_WORDS,
  CATEGORY_SLUG,
  FINDER_WORDS,
  FIT_WORDS,
  fitPath,
  INFO_PAGES,
  INFO_SLUGS,
  isFitWord,
  isModelWord,
  isReservedWord,
  isSearchWord,
} from "../site/addresses.ts";
import { dictionaries, placeholders } from "../site/dictionary.ts";
import { checkFit, fitResponse } from "../site/fit.ts";

describe("fit words", () => {
  it("are valid category slug forms, reserved, and never another section's word or a generated category slug", () => {
    const others = new Set([
      ...Object.values(BRAND_WORDS),
      ...Object.values(FINDER_WORDS),
      ...INFO_PAGES.flatMap((page) => Object.values(INFO_SLUGS[page])),
    ]);
    for (const locale of locales) {
      const word = FIT_WORDS[locale];
      expect(word).toMatch(CATEGORY_SLUG);
      expect(isReservedWord(word), word).toBe(true);
      expect(isModelWord(word), word).toBe(false);
      expect(isSearchWord(word), word).toBe(false);
      expect(others.has(word), word).toBe(false);
    }
    const words = new Set(Object.values(FIT_WORDS));
    for (const [, slug] of categoryLocaleRows())
      expect(words.has(slug), slug).toBe(false);
  });

  it("are recognised in any language and letter case", () => {
    expect(isFitWord("compatibilite")).toBe(true);
    expect(isFitWord("Does-It-Fit")).toBe(true);
    expect(isFitWord("fit")).toBe(false);
  });
});

describe("fitPath", () => {
  it("carries the part and the typed reference", () => {
    expect(fitPath("fr")).toBe("/fr/compatibilite");
    expect(fitPath("en", "SP000002", "ab 12")).toBe(
      "/en/does-it-fit?part=SP000002&q=ab+12",
    );
  });
});

describe("checkFit", () => {
  // A database that fails the test if the check queries it.
  const noDatabase = {
    execute: () => {
      throw new Error("No query expected.");
    },
  } as unknown as Parameters<typeof checkFit>[0];

  it("refuses an empty, overlong or malformed input before any query", async () => {
    for (const [part, q] of [
      ["SP000002", ""],
      ["SP000002", "   "],
      ["SP000002", "A".repeat(101)],
      ["SP000002", "ab%12"],
      ["SP000002", "straße"],
      ["", "AB12"],
      ["sp000002", "AB12"],
      ["000002", "AB12"],
      [`SP${"0".repeat(40)}`, "AB12"],
    ] as const)
      expect(await checkFit(noDatabase, part, q), `${part} ${q}`).toEqual({
        status: "invalid",
      });
  });
});

describe("fitResponse", () => {
  it("gives each model its page's address in the language", () => {
    expect(
      fitResponse(
        {
          status: "checked",
          models: [
            {
              brand: "Bedoren",
              brandSlug: "bedoren",
              reference: "AB00K1-42",
              fits: true,
            },
          ],
        },
        "de",
      ),
    ).toEqual({
      status: "checked",
      models: [
        {
          brand: "Bedoren",
          reference: "AB00K1-42",
          fits: true,
          path: "/de/geraet/bedoren-ab00k1-42",
        },
      ],
    });
    expect(fitResponse({ status: "no-product" }, "fr")).toEqual({
      status: "no-product",
    });
  });
});

describe("fit labels", () => {
  it("name the model once in each yes and no sentence", () => {
    for (const dictionary of Object.values(dictionaries)) {
      expect(placeholders(dictionary.fitYes)).toEqual(["model"]);
      expect(placeholders(dictionary.fitNo)).toEqual(["model"]);
      expect(placeholders(dictionary.fitNoModel)).toEqual(["query"]);
    }
  });
});
