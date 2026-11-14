// The home page and the category pages (issue #81), on whichever catalog the
// build reads: CI's small catalog puts about 83 products in each category,
// so every category has at least two pages. The slugs come from the
// generator's category names; the products and counts are read from the
// pages, never written.
import { expect, type Page, test } from "@playwright/test";
import { categories, slugify } from "../catalog/generator.ts";
import { type Locale, locales } from "../cms/locales.ts";
import {
  MODEL_WORDS,
  PRODUCTS_PER_CATEGORY_PAGE,
  parseProductSegment,
} from "../site/addresses.ts";
import { locationPath } from "./addresses.ts";

const slugOf = (id: number, locale: Locale): string => {
  const category = categories().find((c) => c.id === id);
  if (!category) throw new Error(`No category ${id}.`);
  return slugify(category.names[locale]);
};

/** The home page's categories: link text, address and number of products. */
async function homeCategories(page: Page, locale: Locale) {
  await page.goto(`/${locale}`);
  return page
    .locator('main ul[data-list="categories"] > li')
    .evaluateAll((items) =>
      items.map((item) => {
        const link = item.querySelector("a");
        return {
          name: link?.textContent ?? "",
          href: link?.getAttribute("href") ?? "",
          count: Number(
            (item.querySelector("span")?.textContent ?? "").replace(/\D/g, ""),
          ),
        };
      }),
    );
}

/** A category page's product links. */
const productHrefs = (page: Page) =>
  page
    .getByRole("main")
    .locator("ul > li > a")
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

const pagesOf = (count: number) =>
  Math.max(1, Math.ceil(count / PRODUCTS_PER_CATEGORY_PAGE));

const FIRST = categories()[0]?.id ?? 1;

test.describe("the home page", () => {
  for (const locale of locales)
    test(`lists every category with its products in ${locale}`, async ({
      page,
    }) => {
      const listed = await homeCategories(page, locale);
      expect(listed.map(({ href }) => href).sort()).toEqual(
        categories()
          .map((category) => `/${locale}/${slugOf(category.id, locale)}`)
          .sort(),
      );
      for (const { name, count } of listed) {
        expect(name.trim()).not.toBe("");
        expect(count, name).toBeGreaterThan(0);
      }
    });
});

test.describe("category pages", () => {
  test("page 1 shows 48 products with prices, in its language, and links to page 2", async ({
    page,
  }) => {
    const listed = await homeCategories(page, "fr");
    const first = listed.find(
      ({ href }) => href === `/fr/${slugOf(FIRST, "fr")}`,
    );
    if (!first) throw new Error("First category missing from the home page.");
    expect(first.count).toBeGreaterThan(PRODUCTS_PER_CATEGORY_PAGE);

    const response = await page.goto(first.href);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(
      first.name,
    );
    const hrefs = await productHrefs(page);
    expect(hrefs).toHaveLength(PRODUCTS_PER_CATEGORY_PAGE);
    for (const href of hrefs)
      expect(href.startsWith(`${first.href}/`), href).toBe(true);
    await expect(main.locator("ul > li > span").first()).toHaveText(
      /^[\d\s  ]+,\d{2}\s€$/u,
    );
    await expect(main.locator('a[rel="next"]')).toHaveAttribute(
      "href",
      `${first.href}/2`,
    );
    await expect(main.locator('a[rel="prev"]')).toHaveCount(0);
    expect(await canonical(page)).toBe(first.href);
    expect(await alternates(page)).toEqual(
      [
        ...locales.map((locale) => [
          locale,
          `/${locale}/${slugOf(FIRST, locale)}`,
        ]),
        ["x-default", first.href],
      ].sort(),
    );
  });

  test("page 2 continues in reference order and links back to page 1's address", async ({
    page,
  }) => {
    const path = `/en/${slugOf(FIRST, "en")}`;
    await page.goto(path);
    const one = await productHrefs(page);
    const response = await page.goto(`${path}/2`);
    expect(response?.status()).toBe(200);
    const two = await productHrefs(page);
    const references = [...one, ...two].map(
      (href) => parseProductSegment(href.split("/")[3] as string) as string,
    );
    expect(references).toEqual([...references].sort());
    expect(new Set(references).size).toBe(references.length);
    const main = page.getByRole("main");
    await expect(main.locator('a[rel="prev"]')).toHaveAttribute("href", path);
    expect(await canonical(page)).toBe(`${path}/2`);
    expect(await alternates(page)).toEqual(
      [
        ...locales.map((locale) => [
          locale,
          `/${locale}/${slugOf(FIRST, locale)}/2`,
        ]),
        ["x-default", `/fr/${slugOf(FIRST, "fr")}/2`],
      ].sort(),
    );
  });

  test("the last page holds the rest, links back only, and the next number answers 404", async ({
    page,
    request,
  }) => {
    const listed = await homeCategories(page, "de");
    const path = `/de/${slugOf(FIRST, "de")}`;
    const category = listed.find(({ href }) => href === path);
    if (!category)
      throw new Error("First category missing from the home page.");
    const last = pagesOf(category.count);
    const response = await page.goto(`${path}/${last}`);
    expect(response?.status()).toBe(200);
    expect(await productHrefs(page)).toHaveLength(
      category.count - (last - 1) * PRODUCTS_PER_CATEGORY_PAGE,
    );
    const main = page.getByRole("main");
    await expect(main.locator('a[rel="next"]')).toHaveCount(0);
    await expect(main.locator('a[rel="prev"]')).toHaveAttribute(
      "href",
      last === 2 ? path : `${path}/${last - 1}`,
    );
    const past = await request.get(`${path}/${last + 1}`, { maxRedirects: 0 });
    expect(past.status()).toBe(404);
  });

  test("/1, another letter case or another language's slug redirects permanently", async ({
    request,
  }) => {
    const fr = slugOf(FIRST, "fr");
    const de = slugOf(FIRST, "de");
    for (const [wrong, right] of [
      [`/fr/${fr}/1`, `/fr/${fr}`],
      [`/fr/${fr.toUpperCase()}`, `/fr/${fr}`],
      [`/fr/${fr.toUpperCase()}/2`, `/fr/${fr}/2`],
      [`/de/${fr}`, `/de/${de}`],
      [`/de/${fr}/2`, `/de/${de}/2`],
    ] as const) {
      if (wrong === right) continue;
      const response = await request.get(wrong, { maxRedirects: 0 });
      expect(response.status(), wrong).toBe(308);
      expect(locationPath(response), wrong).toBe(right);
    }
  });

  test("an unknown category, 0, a number in another form or the model word alone answers 404", async ({
    request,
  }) => {
    const path = `/fr/${slugOf(FIRST, "fr")}`;
    for (const wrong of [
      "/fr/no-such-category",
      "/fr/no-such-category/2",
      `${path}/0`,
      `${path}/01`,
      `${path}/99999999`,
      `/fr/${MODEL_WORDS.fr}`,
      `/fr/${MODEL_WORDS.fr}/2`,
    ]) {
      const response = await request.get(wrong, { maxRedirects: 0 });
      expect(response.status(), wrong).toBe(404);
    }
  });
});
