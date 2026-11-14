// The home page's showcase section (issue #111): the products marked as
// showcase, as category-page cards below the categories, with every image
// loaded lazily so the first screen is unchanged. Previews hold no DeepL key
// (ADR 0011), so only the French names are checked word for word.
import { expect, type Page, test } from "@playwright/test";
import { showcaseProducts } from "../catalog/showcase.ts";
import type { Locale } from "../cms/locales.ts";

/** The showcase cards: name, address, price and how each image loads. */
async function showcaseCards(page: Page, locale: Locale) {
  await page.goto(`/${locale}`);
  return page
    .locator('main ul[data-list="showcase"] > li')
    .evaluateAll((items) =>
      items.map((item) => {
        const link = item.querySelector("a");
        const img = item.querySelector("img");
        return {
          name: link?.textContent ?? "",
          href: link?.getAttribute("href") ?? "",
          price: item.querySelector("span")?.textContent ?? "",
          loading: img?.getAttribute("loading") ?? "no image",
          priority: img?.getAttribute("fetchpriority") ?? null,
        };
      }),
    );
}

test.describe("the home page's showcase", () => {
  test("lists the showcase products with their French names after the categories", async ({
    page,
  }) => {
    const cards = await showcaseCards(page, "fr");
    expect(cards.map(({ name }) => name).sort()).toEqual(
      showcaseProducts.map((product) => product.fr.name).sort(),
    );
    const lists = await page
      .locator("main ul[data-list]")
      .evaluateAll((uls) => uls.map((ul) => ul.getAttribute("data-list")));
    expect(lists).toEqual(["categories", "showcase"]);
  });

  for (const locale of ["fr", "en"] as const)
    test(`links each card in ${locale} to a product page that answers 200, with a price and a lazy image`, async ({
      page,
      request,
    }) => {
      const cards = await showcaseCards(page, locale);
      expect(cards).toHaveLength(showcaseProducts.length);
      for (const card of cards) {
        expect(card.name.trim(), card.href).not.toBe("");
        expect(card.price, card.href).toContain("€");
        expect(card.loading, card.href).toBe("lazy");
        expect(card.priority, card.href).toBeNull();
        expect(card.href.startsWith(`/${locale}/`), card.href).toBe(true);
        const response = await request.get(card.href, { maxRedirects: 0 });
        expect(response.status(), card.href).toBe(200);
      }
    });
});
