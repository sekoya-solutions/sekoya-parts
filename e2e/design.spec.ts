// The site layout and the 404 page (issue #83, docs/specs/design-system.md):
// the skip link, the header's home link, the language switch on each kind of
// page, and the 404 in its address's language. Addresses depend on the
// catalog, so the tests read them from the pages.
import { expect, type Page, test } from "@playwright/test";
import { MILLION_PRODUCT_ID } from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import { getDictionary } from "../site/dictionary.ts";
import { productAddress } from "./addresses.ts";

/** The page's hreflang tags, other than x-default, as [language, path]. */
const alternates = (page: Page) =>
  page
    .locator('head link[rel="alternate"][hreflang]')
    .evaluateAll((tags) =>
      tags
        .map((tag) => [
          tag.getAttribute("hreflang") as string,
          new URL(tag.getAttribute("href") as string).pathname,
        ])
        .filter(([lang]) => lang !== "x-default"),
    );

/** The language switch's links, as [language, path]. */
const switchLinks = (page: Page) =>
  page
    .getByRole("banner")
    .getByRole("navigation")
    .locator("a")
    .evaluateAll((anchors) =>
      anchors.map((a) => [
        a.getAttribute("hreflang") as string,
        a.getAttribute("href") as string,
      ]),
    );

/** The switch links to the nine other languages, at the hreflang addresses. */
async function expectSwitchMatchesAlternates(page: Page, current: string) {
  const expected = (await alternates(page))
    .filter(([lang]) => lang !== current)
    .sort();
  expect(expected).toHaveLength(locales.length - 1);
  expect((await switchLinks(page)).sort()).toEqual(expected);
}

test("the skip link is the first thing a keyboard reaches and leads to the main content", async ({
  page,
}) => {
  await page.goto("/fr");
  await page.keyboard.press("Tab");
  const skip = page.locator(":focus");
  await expect(skip).toHaveText(getDictionary("fr").skipToContent);
  await expect(skip).toHaveAttribute("href", "#main");
  await expect(page.locator("main#main")).toHaveCount(1);
});

test("the header's wordmark links to the home page of the page's language", async ({
  page,
}) => {
  await page.goto("/de");
  const home = page.getByRole("banner").getByRole("link").first();
  await expect(home).toHaveAttribute("href", "/de");
  await expect(home).toHaveText("Sekoya Parts");
});

test("the language switch opens without browser code and names each language in itself", async ({
  page,
}) => {
  await page.goto("/fr");
  const nav = page.getByRole("banner").getByRole("navigation");
  await expect(nav).toBeHidden();
  await page.getByRole("banner").locator("summary").click();
  await expect(nav).toBeVisible();
  for (const locale of locales.filter((l) => l !== "fr")) {
    const link = nav.locator(`a[hreflang="${locale}"]`);
    await expect(link).toHaveText(getDictionary(locale).languageName);
    await expect(link).toHaveAttribute("lang", locale);
  }
});

test("on a product page, the switch links to the product in the other languages", async ({
  page,
  request,
}) => {
  await page.goto(await productAddress(request, "fr", MILLION_PRODUCT_ID));
  await expectSwitchMatchesAlternates(page, "fr");
});

test("on a category page, the switch links to the same page number in the other languages", async ({
  page,
}) => {
  await page.goto("/fr");
  const category = page.getByRole("main").locator("li a").first();
  await page.goto(`${await category.getAttribute("href")}/2`);
  await expectSwitchMatchesAlternates(page, "fr");
  for (const [, path] of await switchLinks(page)) expect(path).toMatch(/\/2$/);
});

test("on a model page, the switch links to the model in the other languages", async ({
  page,
  request,
}) => {
  await page.goto(await productAddress(request, "en", MILLION_PRODUCT_ID));
  const model = page.getByRole("main").locator(".reference-list a").first();
  await page.goto((await model.getAttribute("href")) as string);
  await expectSwitchMatchesAlternates(page, "en");
});

// A 404 under a language is drawn by the browser from the page's data:
// Next.js 16.4.6 sends an empty HTML shell for an address a page rejects with
// notFound() (docs/specs/design-system.md). These tests run in Chromium, so
// they check what a visitor with scripts sees, and the status.
for (const [locale, kind] of [
  ["de", "category"],
  ["fr", "product"],
] as const) {
  test(`an unknown ${kind} in ${locale} shows the designed 404, with status 404`, async ({
    page,
  }) => {
    // A category slug read from the home page, then a product reference that
    // follows the rule but belongs to no product.
    await page.goto(`/${locale}`);
    const category = (await page
      .getByRole("main")
      .locator("li a")
      .first()
      .getAttribute("href")) as string;
    const path =
      kind === "category" ? `/${locale}/zzz` : `${category}/zz999999`;
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    const dictionary = getDictionary(locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      dictionary.notFoundTitle,
    );
    await expect(
      page.getByRole("link", { name: dictionary.notFoundHome }),
    ).toHaveAttribute("href", `/${locale}`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
  });
}
