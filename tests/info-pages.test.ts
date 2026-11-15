// The information pages (issue #143): their slugs, which take a category
// slug's place in addresses, their texts in the ten languages, and the legal
// notice's details.
import { describe, expect, it } from "vitest";
import { categoryLocaleRows } from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import {
  CATEGORY_SLUG,
  INFO_PAGES,
  INFO_SLUGS,
  infoPageOf,
  infoPagePath,
  infoPagePaths,
  isModelWord,
  isReservedWord,
  isSearchWord,
} from "../site/addresses.ts";
import { fill, getDictionary, placeholders } from "../site/dictionary.ts";
import { infoTexts } from "../site/info-texts.ts";
import {
  HOST,
  legalValues,
  PUBLISHER,
  usesPublisher,
} from "../site/publisher.ts";

describe("information page slugs", () => {
  it("are valid category-slug words in every language", () => {
    for (const page of INFO_PAGES)
      for (const locale of locales)
        expect(INFO_SLUGS[page][locale], `${page} ${locale}`).toMatch(
          CATEGORY_SLUG,
        );
  });

  it("differ between pages, even across languages", () => {
    const owner = new Map<string, string>();
    for (const page of INFO_PAGES)
      for (const slug of Object.values(INFO_SLUGS[page])) {
        expect(owner.get(slug) ?? page, slug).toBe(page);
        owner.set(slug, page);
      }
  });

  it("are reserved, and never a model word, a search word or a generated category slug", () => {
    for (const page of INFO_PAGES)
      for (const slug of Object.values(INFO_SLUGS[page])) {
        expect(isReservedWord(slug), slug).toBe(true);
        expect(isModelWord(slug), slug).toBe(false);
        expect(isSearchWord(slug), slug).toBe(false);
      }
    const slugs = new Set(
      INFO_PAGES.flatMap((p) => Object.values(INFO_SLUGS[p])),
    );
    for (const [, slug] of categoryLocaleRows())
      expect(slugs.has(slug), slug).toBe(false);
  });

  it("name their page in any language and letter case", () => {
    expect(infoPageOf("mentions-legales")).toBe("legal");
    expect(infoPageOf("Impressum")).toBe("legal");
    expect(infoPageOf("privacy")).toBe("privacy");
    expect(infoPageOf("ampoule")).toBeNull();
  });

  it("build each page's address in each language", () => {
    expect(infoPagePath("fr", "privacy")).toBe("/fr/confidentialite");
    expect(infoPagePath("it", "privacy")).toBe("/it/privacy");
    expect(infoPagePaths("help")).toEqual({
      fr: "/fr/aide",
      en: "/en/help",
      de: "/de/hilfe",
      es: "/es/ayuda",
      it: "/it/aiuto",
      nl: "/nl/hulp",
      pt: "/pt/ajuda",
      pl: "/pl/pomoc",
      sv: "/sv/hjalp",
      da: "/da/hjaelp",
    });
  });
});

describe("information page texts", () => {
  const french = infoTexts.fr;

  it("have every page in every language, and nothing else", () => {
    for (const locale of locales)
      expect(Object.keys(infoTexts[locale]).sort(), locale).toEqual(
        [...INFO_PAGES].sort(),
      );
  });

  it("have the French sections, paragraphs and placeholders in every language", () => {
    for (const locale of locales)
      for (const page of INFO_PAGES) {
        const text = infoTexts[locale][page];
        const source = french[page];
        const where = `${locale} ${page}`;
        for (const value of [text.link, text.title, text.description])
          expect(value.trim(), where).not.toBe("");
        expect(text.sections.length, where).toBe(source.sections.length);
        text.sections.forEach((section, s) => {
          const sourceSection = source.sections[s];
          expect(section.heading.trim(), where).not.toBe("");
          expect(section.paragraphs.length, `${where} ${s}`).toBe(
            sourceSection?.paragraphs.length,
          );
          section.paragraphs.forEach((paragraph, p) => {
            expect(placeholders(paragraph), `${where} ${s}.${p}`).toEqual(
              placeholders(sourceSection?.paragraphs[p] ?? ""),
            );
          });
        });
      }
  });

  it("use placeholders on the legal notice only, each one with a value", () => {
    // With details, so every placeholder is checked even while they are
    // pending.
    const values = legalValues({
      name: "n",
      address: "a",
      director: "d",
      contact: "c",
    });
    for (const locale of locales)
      for (const page of INFO_PAGES)
        for (const section of infoTexts[locale][page].sections)
          for (const paragraph of section.paragraphs) {
            if (page !== "legal")
              expect(placeholders(paragraph), `${locale} ${page}`).toEqual([]);
            expect(() => fill(paragraph, values)).not.toThrow();
          }
  });
});

describe("the legal notice's details", () => {
  it("name the host as Vercel's privacy policy gives it", () => {
    expect(HOST).toEqual({
      name: "Vercel Inc.",
      address: "440 N Barranca Avenue #4133, Covina, CA 91723, United States",
    });
  });

  // The details are either all given or pending as a whole (owner decision,
  // 2026-11-15): never a blank in the notice.
  it("give every publisher detail, unless they are pending", () => {
    if (PUBLISHER === null) return;
    for (const [field, value] of Object.entries(PUBLISHER))
      expect(value.trim(), field).not.toBe("");
  });

  it("are exactly the publisher section's paragraphs, which a pending notice replaces", () => {
    for (const locale of locales) {
      const [publisher, ...others] = infoTexts[locale].legal.sections;
      expect(publisher?.paragraphs.every(usesPublisher), locale).toBe(true);
      for (const section of others)
        expect(section.paragraphs.some(usesPublisher), locale).toBe(false);
      expect(getDictionary(locale).publisherPending.trim()).not.toBe("");
    }
  });

  it("leave out the publisher while pending", () => {
    expect(legalValues(null)).toEqual({
      hostName: HOST.name,
      hostAddress: HOST.address,
    });
  });
});
