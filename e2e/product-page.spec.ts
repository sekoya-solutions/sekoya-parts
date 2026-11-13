// The product page on the small catalog (issues #60 and #73): its parts, its
// reference list, its ten language versions, its redirects and its 404s.
import { expect, test } from "@playwright/test";
import { MILLION_PRODUCT_ID, productReference } from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import {
  MODEL_WORDS,
  parseModelSegment,
  parseProductSegment,
} from "../site/addresses.ts";
import { PRODUCT_PAGE_REFERENCES } from "../site/references.ts";
import { locationPath, lookupPath, productAddress } from "./addresses.ts";

const ASCII_PATH =
  /^\/[a-z]{2}\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

test("product 1 shows its heading, price, description and references", async ({
  page,
  request,
}) => {
  const address = await productAddress(request, "fr", MILLION_PRODUCT_ID);
  const response = await page.goto(address);
  expect(response?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).not.toBeEmpty();
  // The price part: a euro amount in French format, such as "12,34 €".
  await expect(main.locator("p").first()).toHaveText(/^[\d\s ]+,\d{2}\s€$/u);
  // The description part: placeholder text for a non-showcase product.
  await expect(main.locator("p").nth(1)).not.toBeEmpty();
  await expect(main.getByRole("heading", { level: 2 })).toHaveText(
    "Modèles compatibles",
  );

  // Product 1 is compatible with every model, so it reaches the cap.
  const links = main.locator("ul > li > a");
  await expect(links).toHaveCount(PRODUCT_PAGE_REFERENCES);
  for (const href of await links.evaluateAll((anchors) =>
    anchors.map((a) => a.getAttribute("href")),
  )) {
    // Each links to a model page in the page's language (issue #79).
    const [, lang, word, segment] = (href as string).split("/");
    expect([lang, word]).toEqual(["fr", MODEL_WORDS.fr]);
    expect(parseModelSegment(segment as string), href as string).not.toBeNull();
  }
  // Product 1 has more references than its page shows: one link leads to the
  // numbered reference pages.
  await expect(main.locator(`a[href="${address}/1"]`)).toHaveCount(1);
});

test("each of the ten versions has its language, its own address and the same language tags", async ({
  page,
  request,
}) => {
  const addresses = new Map<string, string>();
  for (const locale of locales)
    addresses.set(
      locale,
      await productAddress(request, locale, MILLION_PRODUCT_ID),
    );
  const expected = [
    ...locales.map((locale) => [locale, addresses.get(locale)]),
    ["x-default", addresses.get("fr")],
  ].sort();

  for (const locale of locales) {
    const address = addresses.get(locale) as string;
    // Lowercase ASCII, ending with the reference (ADR 0011).
    expect(address).toMatch(ASCII_PATH);
    expect(address.startsWith(`/${locale}/`)).toBe(true);
    expect(parseProductSegment(address.split("/")[3] as string)).toBe(
      productReference(MILLION_PRODUCT_ID),
    );

    const response = await page.goto(address);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    const canonical = await page
      .locator('head link[rel="canonical"]')
      .getAttribute("href");
    expect(new URL(canonical as string).pathname).toBe(address);
    const alternates = await page
      .locator('head link[rel="alternate"][hreflang]')
      .evaluateAll((tags) =>
        tags.map((tag) => [
          tag.getAttribute("hreflang"),
          tag.getAttribute("href"),
        ]),
      );
    // Full addresses, as language tags require.
    for (const [, href] of alternates)
      expect(href).toMatch(/^https?:\/\/[^/]+\//);
    expect(
      alternates
        .map(([lang, href]) => [lang, new URL(href as string).pathname])
        .sort(),
    ).toEqual(expected);
  }
});

test("other words, another category slug or other letter cases redirect permanently to the address", async ({
  request,
}) => {
  const address = await productAddress(request, "de", MILLION_PRODUCT_ID);
  const [, lang, category, segment] = address.split("/") as string[];
  for (const wrong of [
    `/${lang}/${category}/old-words-sp000001`,
    `/${lang}/renamed-category/${segment}`,
    `/${lang}/${category}/${segment?.toUpperCase()}`,
    lookupPath("de", MILLION_PRODUCT_ID),
  ]) {
    const response = await request.get(wrong, { maxRedirects: 0 });
    expect(response.status(), wrong).toBe(308);
    expect(locationPath(response), wrong).toBe(address);
  }
  const final = await request.get(address, { maxRedirects: 0 });
  expect(final.status()).toBe(200);
});

for (const path of [
  "/fr/p/zz999999",
  "/fr/p/words-only-",
  "/fr/p/sp_000001",
  "/xx/p/sp000001",
  "/product/1",
]) {
  test(`${path} answers 404`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(404);
  });
}
