// The brand index and the brand listings (issue #147), on whichever catalog
// the build reads: CI's small catalog has 20 brands of about 50 products
// each. The brands, products and counts are read from the pages, never
// written.
import { expect, type Page, test } from "@playwright/test";
import { type Locale, locales } from "../cms/locales.ts";
import { isAllowed, parseRobots } from "../scripts/robots-match.ts";
import {
  BRAND_WORDS,
  PRODUCTS_PER_CATEGORY_PAGE,
  parseProductSegment,
} from "../site/addresses.ts";
import { locationPath } from "./addresses.ts";

/** The brand index's brands: name, address and number of products. */
async function indexBrands(page: Page, locale: Locale) {
  const response = await page.goto(`/${locale}/${BRAND_WORDS[locale]}`);
  expect(response?.status()).toBe(200);
  return page.locator('main ul[data-list="brands"] > li').evaluateAll((items) =>
    items.map((item) => ({
      name: item.querySelector("a")?.textContent ?? "",
      href: item.querySelector("a")?.getAttribute("href") ?? "",
      count: Number(
        (item.querySelector("span")?.textContent ?? "").replace(/\D/g, ""),
      ),
    })),
  );
}

/** The brand with the most products, which has at least two pages. */
async function largestBrand(page: Page, locale: Locale) {
  const brands = await indexBrands(page, locale);
  const brand = [...brands].sort((a, b) => b.count - a.count)[0];
  if (!brand) throw new Error("No brand on the index.");
  expect(brand.count).toBeGreaterThan(PRODUCTS_PER_CATEGORY_PAGE);
  return brand;
}

const productHrefs = (page: Page) =>
  page
    .getByRole("main")
    .locator("ul.product-list > li > a")
    .evaluateAll((anchors) =>
      anchors.map((a) => a.getAttribute("href") as string),
    );

const canonical = async (page: Page) =>
  new URL(
    (await page
      .locator('head link[rel="canonical"]')
      .getAttribute("href")) as string,
  ).pathname;

async function alternates(page: Page) {
  const tags = await page
    .locator('head link[rel="alternate"][hreflang]')
    .evaluateAll((links) =>
      links.map((link) => [
        link.getAttribute("hreflang"),
        link.getAttribute("href"),
      ]),
    );
  return tags
    .map(([lang, href]) => [lang, new URL(href as string).pathname])
    .sort();
}

const slugOf = (href: string) => href.split("/")[3] as string;

test.describe("the brand index", () => {
  for (const locale of locales)
    test(`lists every brand by name, with its products, in ${locale}`, async ({
      page,
    }) => {
      const brands = await indexBrands(page, locale);
      expect(brands.length).toBeGreaterThan(1);
      const names = brands.map(({ name }) => name);
      expect(names).toEqual([...names].sort());
      for (const { name, href, count } of brands) {
        expect(name.trim()).not.toBe("");
        expect(href).toMatch(
          new RegExp(`^/${locale}/${BRAND_WORDS[locale]}/[a-z0-9]+$`),
        );
        expect(count, name).toBeGreaterThan(0);
      }
      const path = `/${locale}/${BRAND_WORDS[locale]}`;
      expect(await canonical(page)).toBe(path);
      expect(await alternates(page)).toEqual(
        [
          ...locales.map((l) => [l, `/${l}/${BRAND_WORDS[l]}`]),
          ["x-default", "/fr/marques"],
        ].sort(),
      );
      // The header links to it on every page, the home page included.
      await page.goto(`/${locale}`);
      await expect(
        page.getByRole("banner").locator(`a[href="${path}"]`),
      ).toHaveCount(1);
    });

  test("another language's brand word or letter case redirects permanently", async ({
    request,
  }) => {
    for (const [wrong, right] of [
      ["/de/marques", "/de/marken"],
      ["/fr/Marques", "/fr/marques"],
    ] as const) {
      const response = await request.get(wrong, { maxRedirects: 0 });
      expect(response.status(), wrong).toBe(308);
      expect(locationPath(response), wrong).toBe(right);
    }
  });
});

test.describe("brand listings", () => {
  test("page 1 shows 48 products of the brand with prices, breadcrumbs, and links to page 2", async ({
    page,
  }) => {
    const brand = await largestBrand(page, "fr");
    const response = await page.goto(brand.href);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toContainText(
      brand.name,
    );
    await expect(main.locator("[data-intro]")).toContainText(brand.name);
    const hrefs = await productHrefs(page);
    expect(hrefs).toHaveLength(PRODUCTS_PER_CATEGORY_PAGE);
    // An ordinary product's name holds its brand's.
    const names = await main
      .locator("ul.product-list > li > a")
      .allTextContents();
    expect(names.filter((n) => n.includes(brand.name)).length).toBeGreaterThan(
      0,
    );
    await expect(
      main.locator("ul.product-list > li > span").first(),
    ).toHaveText(/^[\d\s  ]+,\d{2}\s€$/u);
    await expect(main.locator('a[rel="next"]')).toHaveAttribute(
      "href",
      `${brand.href}/2`,
    );
    await expect(main.locator('a[rel="prev"]')).toHaveCount(0);
    const crumbs = main.locator(".breadcrumbs li");
    await expect(crumbs).toHaveCount(3);
    await expect(crumbs.nth(1).locator("a")).toHaveAttribute(
      "href",
      "/fr/marques",
    );
    await expect(crumbs.nth(2)).toHaveText(brand.name);
    const slug = slugOf(brand.href);
    expect(await canonical(page)).toBe(brand.href);
    expect(await alternates(page)).toEqual(
      [
        ...locales.map((l) => [l, `/${l}/${BRAND_WORDS[l]}/${slug}`]),
        ["x-default", brand.href],
      ].sort(),
    );
  });

  test("its pages run in reference order without repeats, and the last links back only", async ({
    page,
    request,
  }) => {
    const brand = await largestBrand(page, "en");
    const pages = Math.ceil(brand.count / PRODUCTS_PER_CATEGORY_PAGE);
    const hrefs: string[] = [];
    for (let n = 1; n <= pages; n++) {
      const response = await page.goto(
        n === 1 ? brand.href : `${brand.href}/${n}`,
      );
      expect(response?.status()).toBe(200);
      hrefs.push(...(await productHrefs(page)));
    }
    const references = hrefs.map(
      (href) => parseProductSegment(href.split("/")[3] as string) as string,
    );
    expect(references).toHaveLength(brand.count);
    expect(references).toEqual([...references].sort());
    expect(new Set(references).size).toBe(references.length);
    const main = page.getByRole("main");
    await expect(main.locator('a[rel="next"]')).toHaveCount(0);
    await expect(main.locator('a[rel="prev"]')).toHaveAttribute(
      "href",
      pages === 2 ? brand.href : `${brand.href}/${pages - 1}`,
    );
    const past = await request.get(`${brand.href}/${pages + 1}`, {
      maxRedirects: 0,
    });
    expect(past.status()).toBe(404);
  });

  test("/1, another letter case or another language's brand word redirects permanently", async ({
    page,
    request,
  }) => {
    const slug = slugOf((await largestBrand(page, "fr")).href);
    for (const [wrong, right] of [
      [`/fr/marques/${slug}/1`, `/fr/marques/${slug}`],
      [`/fr/marques/${slug.toUpperCase()}`, `/fr/marques/${slug}`],
      [`/fr/marques/${slug.toUpperCase()}/2`, `/fr/marques/${slug}/2`],
      [`/de/marques/${slug}`, `/de/marken/${slug}`],
      [`/de/brands/${slug}/2`, `/de/marken/${slug}/2`],
    ] as const) {
      const response = await request.get(wrong, { maxRedirects: 0 });
      expect(response.status(), wrong).toBe(308);
      expect(locationPath(response), wrong).toBe(right);
    }
  });

  test("an unknown brand, 0 or a number in another form answers 404", async ({
    page,
    request,
  }) => {
    const slug = slugOf((await largestBrand(page, "fr")).href);
    for (const wrong of [
      "/fr/marques/nosuchbrand",
      "/fr/marques/nosuchbrand/2",
      `/fr/marques/${slug}/0`,
      `/fr/marques/${slug}/01`,
      `/fr/marques/${slug}/99999999`,
    ]) {
      const response = await request.get(wrong, { maxRedirects: 0 });
      expect(response.status(), wrong).toBe(404);
    }
  });
});

test("robots.txt disallows the brand pages and the sitemap leaves them out, outside the crawl showcase", async ({
  page,
  request,
}) => {
  const brand = await largestBrand(page, "fr");
  const { rules } = parseRobots(
    await (await request.get("/robots.txt")).text(),
  );
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of ["/fr/marques", brand.href, `${brand.href}/2`]) {
    expect(isAllowed(rules, path), path).toBe(false);
    expect(sitemap, path).not.toContain(`${path}<`);
  }
});
