// The crawl showcase's addresses and robots.txt's rules (issue #121), checked
// with Google's matching: the longest rule wins, `*` and `$` as documented.
import { describe, expect, it } from "vitest";
import { locales } from "../cms/locales.ts";
import {
  categoryPath,
  modelPath,
  perLocale,
  productAddresses,
  referencePagePath,
  searchPath,
} from "../site/addresses.ts";
import { crawlPaths, robotsRules, SITEMAP_PATH } from "../site/crawl.ts";
import { isAllowed, parseRobots, type Rule } from "./robots-match.ts";

const fridge = {
  id: 1,
  names: perLocale((locale) => `Réfrigérateur ${locale}`),
  slugs: perLocale((locale) => `refrigerateur-${locale}`),
};
const oven = {
  id: 2,
  names: perLocale((locale) => `Four ${locale}`),
  slugs: perLocale((locale) => `four-${locale}`),
};
const knob = productAddresses({
  reference: "SP000001",
  showcaseNames: { fr: "Bouton de programmateur universel" },
  categoryNames: fridge.names,
  categorySlugs: fridge.slugs,
  brand: "Norium",
});
const ordinary = productAddresses({
  reference: "SP000002",
  showcaseNames: null,
  categoryNames: fridge.names,
  categorySlugs: fridge.slugs,
  brand: "Norium",
});
const sampled = { brandSlug: "norium", reference: "AB00K1-42" };
const other = { brandSlug: "norium", reference: "AB00K1-43" };

const paths = crawlPaths({
  categories: [fridge, oven],
  products: [knob],
  models: [sampled, sampled],
});
const toRules = ({ allow, disallow }: ReturnType<typeof robotsRules>) => [
  ...allow.map((pattern): Rule => ({ allow: true, pattern })),
  ...disallow.map((pattern): Rule => ({ allow: false, pattern })),
];
const rules = toRules(robotsRules(paths));

describe("crawlPaths", () => {
  it("lists the bare domain, then each home, first category, showcase product and sampled model page in ten languages, once each", () => {
    expect(paths).toHaveLength(1 + 10 + 2 * 10 + 10 + 10);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths[0]).toBe("/");
    for (const locale of locales) {
      expect(paths).toContain(`/${locale}`);
      expect(paths).toContain(categoryPath(locale, fridge.slugs[locale]));
      expect(paths).toContain(knob.paths[locale]);
      expect(paths).toContain(modelPath(locale, sampled));
    }
  });

  it("refuses an address that robots.txt could not name exactly", () => {
    for (const path of [
      "/fr/four/a*b",
      "/fr/four/a$",
      "/fr/four/a%20",
      "/fr/Four",
    ])
      expect(() =>
        crawlPaths({
          categories: [],
          products: [{ paths: { ...knob.paths, fr: path } }],
          models: [],
        }),
      ).toThrow(/cannot be named exactly/);
  });
});

describe("robotsRules", () => {
  it("allows every showcase address, the assets and the sitemap", () => {
    for (const path of paths) expect(isAllowed(rules, path), path).toBe(true);
    for (const path of [
      "/_next/static/chunks/main.js",
      "/_next/static/media/manrope.woff2",
      "/images/abc-320.avif",
      SITEMAP_PATH,
    ])
      expect(isAllowed(rules, path), path).toBe(true);
  });

  it("disallows everything else: search, the admin, the API, later pages, other products and models", () => {
    const blocked = [
      searchPath("fr", "joint"),
      searchPath("en"),
      "/admin",
      "/admin/collections/products",
      "/api/search?q=joint&lang=fr",
      "/api/products",
      categoryPath("fr", fridge.slugs.fr, 2),
      referencePagePath(knob.paths.fr, 1),
      `${knob.paths.fr}/`,
      ordinary.paths.fr,
      modelPath("fr", other),
      "/fr/p/sp000001",
      "/xx",
      "/fr/",
      "/_next/image?url=%2Fimages%2Fa.jpg",
    ];
    for (const path of blocked)
      expect(isAllowed(rules, path), path).toBe(false);
  });
});

describe("the test's robots.txt matcher", () => {
  it("applies Google's documented precedence", () => {
    const sample = parseRobots(
      [
        "User-Agent: other",
        "Allow: /",
        "",
        "User-Agent: *",
        "Disallow: /",
        "Allow: /p$",
        "Allow: /a*b",
        "Disallow: /folder/",
        "Allow: /folder",
        "Sitemap: https://example.com/sitemap.xml",
      ].join("\n"),
    );
    expect(sample.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
    expect(isAllowed(sample.rules, "/p")).toBe(true);
    expect(isAllowed(sample.rules, "/p/1")).toBe(false);
    expect(isAllowed(sample.rules, "/axxb/c")).toBe(true);
    // The longer Disallow wins over the shorter Allow.
    expect(isAllowed(sample.rules, "/folder/page")).toBe(false);
    expect(isAllowed(sample.rules, "/folderx")).toBe(true);
    expect(isAllowed(sample.rules, "/q")).toBe(false);
  });
});
