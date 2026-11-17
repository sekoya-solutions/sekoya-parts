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

/**
 * The language switch's menu, found by CSS: while the <details> element is
 * closed its links are hidden, and role locators skip hidden elements.
 */
// The language switch, the wide header's details element with language
// links (the menu by appliance, issue #198, is outside it), and the phone
// menu (issue #181) holds the same language links.
const switchMenu = (page: Page) =>
  page.locator("header [data-wide-links] details:has(a[hreflang]) nav");

/** The language links of the switch, or of the phone menu, as [language, path]. */
const switchLinks = (page: Page, menu = switchMenu(page)) =>
  menu
    .locator("a[hreflang]")
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
  const phoneMenu = page.locator("header [data-mobile-menu] nav");
  expect((await switchLinks(page, phoneMenu)).sort()).toEqual(expected);
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
  const nav = switchMenu(page);
  await expect(nav).toHaveCount(1);
  await expect(nav).toBeHidden();
  await page
    .getByRole("banner")
    .locator("[data-wide-links] details:has(a[hreflang]) summary")
    .click();
  await expect(nav).toBeVisible();
  for (const locale of locales.filter((l) => l !== "fr")) {
    const link = nav.locator(`a[hreflang="${locale}"]`);
    await expect(link).toHaveText(getDictionary(locale).languageName);
    await expect(link).toHaveAttribute("lang", locale);
  }
});

test("the language switch and the phone menu show each language's flag, hidden from screen readers", async ({
  page,
}) => {
  await page.goto("/de");
  const summary = page
    .getByRole("banner")
    .locator("[data-wide-links] details:has(a[hreflang]) summary");
  await expect(summary.locator("svg[data-flag]")).toHaveAttribute(
    "data-flag",
    "de",
  );
  const others = locales.filter((l) => l !== "de");
  for (const menu of [
    switchMenu(page),
    page.locator("header [data-mobile-menu] nav"),
  ])
    for (const locale of others) {
      const link = menu.locator(`a[hreflang="${locale}"]`);
      // The attribute the browser script reads to remember the pick.
      await expect(link).toHaveAttribute("data-language-pick", locale);
      const flag = link.locator("svg[data-flag]");
      await expect(flag).toHaveAttribute("data-flag", locale);
      await expect(flag).toHaveAttribute("aria-hidden", "true");
    }
  // Drawn in place, with no request and the same box whatever the language.
  const sizes = await page
    .locator("header svg[data-flag]")
    .evaluateAll((flags) =>
      flags.map(
        (flag) =>
          `${flag.getAttribute("width")}x${flag.getAttribute("height")}`,
      ),
    );
  expect(new Set(sizes)).toEqual(new Set(["21x14"]));
});

test("a language picked in the switch is remembered, and the bare domain opens it", async ({
  page,
}) => {
  await page.goto("/fr");
  // Without a pick, the bare domain would follow the browser, English here.
  await page.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" });
  const ready = page.locator("html[data-language-pick-ready]");
  await expect(ready).toHaveCount(1);
  await page
    .getByRole("banner")
    .locator("[data-wide-links] details:has(a[hreflang]) summary")
    .click();
  await switchMenu(page).locator('a[hreflang="it"]').click();
  await expect(page).toHaveURL(/\/it$/);
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "lang_v1",
  );
  expect(cookie?.value).toBe("it");
  expect(cookie?.path).toBe("/");
  expect(cookie?.sameSite).toBe("Lax");
  // About a year from now, give or take a minute.
  const year = Date.now() / 1000 + 365 * 24 * 60 * 60;
  expect(Math.abs((cookie?.expires ?? 0) - year)).toBeLessThan(60);

  await page.goto("/");
  await expect(page).toHaveURL(/\/it$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "it");

  // Following a link of the phone menu replaces the pick.
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(ready).toHaveCount(1);
  await page.locator("header [data-mobile-menu] > summary").click();
  await page.locator('header [data-mobile-menu] nav a[hreflang="da"]').click();
  await expect(page).toHaveURL(/\/da$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/da$/);
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
  // The home page's category list, after the promotions (issue #155).
  const category = page.locator('main ul[data-list="categories"] a').first();
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
      .locator('main ul[data-list="categories"] a')
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

// Long words on a phone (issue #177): CI's catalog keeps French names in every
// language, so this writes a German compound, as the translated catalog holds,
// into a product page's heading and into the home page's cards, then checks
// the page is no wider than the screen. Without the hyphenation rules of
// site/site.css, these words push the page sideways.
test.describe("long words on a phone", () => {
  test.use({ viewport: { width: 360, height: 740 } });
  const WORD = "Universalprogrammierungseinheitsaktivkohlefilterpatrone";
  const fits = (page: Page) =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );

  test("a heading's long word is hyphenated, not pushed past the screen", async ({
    page,
    request,
  }) => {
    await page.goto(await productAddress(request, "de", 2));
    await page.locator("main h1").evaluate((h1, word) => {
      h1.textContent = word;
    }, WORD);
    expect(await fits(page)).toBe(true);
  });

  test("a card's long name is hyphenated, not pushed past the screen", async ({
    page,
  }) => {
    await page.goto("/de");
    for (const selector of [
      '[data-list="categories"] a',
      "main ul.product-list > li > a",
    ])
      await page
        .locator(selector)
        .first()
        .evaluate((a, word) => {
          a.textContent = word;
        }, WORD);
    expect(await fits(page)).toBe(true);
  });
});
