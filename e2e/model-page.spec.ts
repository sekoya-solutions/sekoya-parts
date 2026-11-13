// The model page and the numbered reference pages on the small catalog
// (docs/adr/0009-compatible-references.md, docs/adr/0011-languages-and-seo.md,
// issue #79). Product 1 is compatible with every model at both scales, so it
// has 2,000 reference pages; the words of every address depend on the
// catalog, so the tests read them from the pages and never write them.
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { MILLION_PRODUCT_ID, MODEL_COUNT } from "../catalog/generator.ts";
import { type Locale, locales } from "../cms/locales.ts";
import {
  MODEL_WORDS,
  parseModelSegment,
  REFERENCES_PER_PAGE,
} from "../site/addresses.ts";
import { locationPath, productAddress } from "./addresses.ts";

const LAST_PAGE = MODEL_COUNT / REFERENCES_PER_PAGE;

/** The hrefs of a page's reference list. */
const referenceHrefs = (page: Page) =>
  page
    .getByRole("main")
    .locator("ul > li > a")
    .evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href")));

/** The address of product 1's most popular model, in one language. */
async function firstModelAddress(
  page: Page,
  request: APIRequestContext,
  locale: Locale,
): Promise<string> {
  await page.goto(await productAddress(request, locale, MILLION_PRODUCT_ID));
  const [href] = await referenceHrefs(page);
  return href as string;
}

/** Language tags as [hreflang, pathname] pairs, sorted. */
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

const canonical = async (page: Page) =>
  new URL(
    (await page
      .locator('head link[rel="canonical"]')
      .getAttribute("href")) as string,
  ).pathname;

test.describe("reference pages", () => {
  test("page 1 lists ranks 1 to 500, like the start of the product page, and links onward", async ({
    page,
    request,
  }) => {
    const product = await productAddress(request, "fr", MILLION_PRODUCT_ID);
    await page.goto(product);
    const onProduct = await referenceHrefs(page);

    const response = await page.goto(`${product}/1`);
    expect(response?.status()).toBe(200);
    const onPage = await referenceHrefs(page);
    expect(onPage).toHaveLength(REFERENCES_PER_PAGE);
    expect(onPage).toEqual(onProduct.slice(0, REFERENCES_PER_PAGE));

    const main = page.getByRole("main");
    await expect(main.locator(`a[href="${product}"]`)).toHaveCount(1);
    await expect(main.locator('a[rel="next"]')).toHaveAttribute(
      "href",
      `${product}/2`,
    );
    await expect(main.locator('a[rel="prev"]')).toHaveCount(0);
    // Its own canonical address, never the product's.
    expect(await canonical(page)).toBe(`${product}/1`);
  });

  test("page 3 starts at rank 1,001, right after the product page's list", async ({
    page,
    request,
  }) => {
    const product = await productAddress(request, "fr", MILLION_PRODUCT_ID);
    await page.goto(`${product}/2`);
    const second = await referenceHrefs(page);
    await page.goto(`${product}/3`);
    const third = await referenceHrefs(page);
    expect(third).toHaveLength(REFERENCES_PER_PAGE);
    expect(new Set([...second, ...third]).size).toBe(2 * REFERENCES_PER_PAGE);
    const main = page.getByRole("main");
    await expect(main.locator('a[rel="prev"]')).toHaveAttribute(
      "href",
      `${product}/2`,
    );
  });

  test("the last page links back only, and each version has its own address", async ({
    page,
    request,
  }) => {
    const paths = new Map<string, string>();
    for (const locale of locales)
      paths.set(
        locale,
        `${await productAddress(request, locale, MILLION_PRODUCT_ID)}/${LAST_PAGE}`,
      );
    const expected = [
      ...locales.map((locale) => [locale, paths.get(locale)]),
      ["x-default", paths.get("fr")],
    ].sort();

    const address = paths.get("de") as string;
    const response = await page.goto(address);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    const main = page.getByRole("main");
    await expect(main.locator('a[rel="next"]')).toHaveCount(0);
    await expect(main.locator('a[rel="prev"]')).toHaveAttribute(
      "href",
      address.replace(/\/\d+$/, `/${LAST_PAGE - 1}`),
    );
    for (const href of await referenceHrefs(page))
      expect(href?.startsWith(`/de/${MODEL_WORDS.de}/`), href ?? "").toBe(true);
    expect(await canonical(page)).toBe(address);
    expect(await alternates(page)).toEqual(expected);
  });

  test("other words or letter cases redirect permanently, keeping the page number", async ({
    request,
  }) => {
    const product = await productAddress(request, "fr", MILLION_PRODUCT_ID);
    const [, lang, category, segment] = product.split("/") as string[];
    for (const wrong of [
      `/${lang}/${category}/old-words-sp000001/7`,
      `/${lang}/p/sp000001/7`,
      `/${lang}/${category}/${segment?.toUpperCase()}/7`,
    ]) {
      const response = await request.get(wrong, { maxRedirects: 0 });
      expect(response.status(), wrong).toBe(308);
      expect(locationPath(response), wrong).toBe(`${product}/7`);
    }
  });

  test("a page past the last, a number in another form or a product with few references answers 404", async ({
    request,
  }) => {
    const product = await productAddress(request, "fr", MILLION_PRODUCT_ID);
    const few = await productAddress(request, "fr", MILLION_PRODUCT_ID + 1);
    for (const path of [
      `${product}/${LAST_PAGE + 1}`,
      `${product}/0`,
      `${product}/01`,
      `${product}/-1`,
      `${product}/page`,
      `${few}/1`,
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
    }
  });
});

test.describe("the model page", () => {
  test("shows the model, its appliance type and its compatible products with their prices", async ({
    page,
    request,
  }) => {
    const address = await firstModelAddress(page, request, "fr");
    const linkText = await page
      .getByRole("main")
      .locator("ul > li > a")
      .first()
      .textContent();

    const response = await page.goto(address);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    const main = page.getByRole("main");
    // The heading is the brand and reference the product page linked with.
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(
      linkText as string,
    );
    await expect(main.locator("p").first()).not.toBeEmpty();
    await expect(main.getByRole("heading", { level: 2 })).toHaveText(
      "Pièces compatibles",
    );

    // Every model fits product 1, which is listed at its French address,
    // with a price in French format.
    const product = await productAddress(request, "fr", MILLION_PRODUCT_ID);
    const item = main.locator("ul > li", {
      has: page.locator(`a[href="${product}"]`),
    });
    await expect(item).toHaveCount(1);
    await expect(item.locator("span")).toHaveText(/^[\d\s  ]+,\d{2}\s€$/u);
    for (const href of await main
      .locator("ul > li > a")
      .evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href"))))
      expect(href?.startsWith("/fr/"), href ?? "").toBe(true);
  });

  test("each of the ten versions has its own address and the same language tags", async ({
    page,
    request,
  }) => {
    const french = await firstModelAddress(page, request, "fr");
    const segment = french.split("/")[3] as string;
    const expected = [
      ...locales.map((locale) => [
        locale,
        `/${locale}/${MODEL_WORDS[locale]}/${segment}`,
      ]),
      ["x-default", french],
    ].sort();
    for (const locale of locales) {
      const address = `/${locale}/${MODEL_WORDS[locale]}/${segment}`;
      const response = await page.goto(address);
      expect(response?.status(), address).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      expect(await canonical(page)).toBe(address);
      expect(await alternates(page)).toEqual(expected);
    }
  });

  test("another language's word or other letter cases redirect permanently to the address", async ({
    page,
    request,
  }) => {
    const address = await firstModelAddress(page, request, "de");
    const segment = address.split("/")[3] as string;
    for (const wrong of [
      `/de/${MODEL_WORDS.fr}/${segment}`,
      `/de/${MODEL_WORDS.de.toUpperCase()}/${segment}`,
      `/de/${MODEL_WORDS.de}/${segment.toUpperCase()}`,
    ]) {
      const response = await request.get(wrong, { maxRedirects: 0 });
      expect(response.status(), wrong).toBe(308);
      expect(locationPath(response), wrong).toBe(address);
    }
  });

  test("an unknown brand or reference, or a segment that cannot be a model, answers 404", async ({
    page,
    request,
  }) => {
    const address = await firstModelAddress(page, request, "fr");
    const key = parseModelSegment(address.split("/")[3] as string);
    expect(key).not.toBeNull();
    for (const path of [
      `/fr/${MODEL_WORDS.fr}/nobrand-${key?.reference.toLowerCase()}`,
      `/fr/${MODEL_WORDS.fr}/${key?.brandSlug}-zz0000-00`,
      `/fr/${MODEL_WORDS.fr}/${key?.brandSlug}`,
      `/fr/${MODEL_WORDS.fr}/${key?.brandSlug}-ab_00`,
      `${address}/1`,
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
    }
  });
});
