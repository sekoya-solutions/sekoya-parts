// Availability and sale prices as visitors see them (issue #151), on the
// catalog CI loads: the load starts sales on about 2% of products, so a few
// cards in each language carry one. The products and prices are read from the
// pages, never written.
import { expect, type Page, test } from "@playwright/test";
import {
  categories,
  MILLION_PRODUCT_ID,
  slugify,
} from "../catalog/generator.ts";
import { type Locale, locales } from "../cms/locales.ts";
import { discountPercent } from "../site/merchandising.ts";
import { productAddress } from "./addresses.ts";

const cents = (text: string | null) => Number((text ?? "").replace(/\D/g, ""));

/** The first card on sale on a category's first pages, in a language. */
async function cardOnSale(page: Page, locale: Locale) {
  for (const category of categories())
    for (const n of [1, 2]) {
      const path = `/${locale}/${slugify(category.names[locale])}`;
      await page.goto(n === 1 ? path : `${path}/${n}`);
      const card = page.locator("ul.product-list > li:has(mark)").first();
      if ((await card.count()) === 0) continue;
      return {
        href: (await card.locator(":scope > a").getAttribute("href")) as string,
        price: cents(await card.locator(":scope > span").textContent()),
        former: cents(await card.locator(":scope > s").textContent()),
        badge: (await card.locator(":scope > mark").textContent()) as string,
      };
    }
  throw new Error(`No card on sale in ${locale}.`);
}

test.describe("sale prices", () => {
  for (const locale of ["fr", "de"] as const)
    test(`show the sale price, the former price and the discount on cards and the product page in ${locale}`, async ({
      page,
    }) => {
      const card = await cardOnSale(page, locale);
      expect(card.price).toBeLessThan(card.former);
      const percent = discountPercent(card.price, card.former);
      expect(percent).toBeGreaterThanOrEqual(9);
      // Rounding the sale price down to 10 cents adds up to 2.5 points on a
      // 4-euro part.
      expect(percent).toBeLessThanOrEqual(33);
      expect(card.badge.replace(/\D/g, "")).toBe(String(percent));
      expect(card.badge.trim().startsWith("-")).toBe(true);

      await page.goto(card.href);
      const price = page.locator("[data-price]");
      await expect(price.locator("p").first()).toHaveText(/\d/);
      expect(cents(await price.locator("p").first().textContent())).toBe(
        card.price,
      );
      expect(cents(await price.locator("s").textContent())).toBe(card.former);
      await expect(price.locator("mark")).toHaveText(card.badge);
      // The former price is announced as such, not only struck through.
      await expect(price.locator("s .sr-only")).not.toHaveText("");
    });

  test("a product without a sale shows its price alone", async ({
    page,
    request,
  }) => {
    await page.goto(await productAddress(request, "fr", MILLION_PRODUCT_ID));
    const price = page.locator("[data-price]");
    await expect(price.locator("p").first()).toHaveText(
      /^[\d\s  ]+,\d{2}\s€$/u,
    );
    // Product 1 may be on sale in a given load; when it is not, nothing else shows.
    if ((await price.locator("mark").count()) === 0)
      await expect(price.locator("s")).toHaveCount(0);
  });
});

test.describe("availability", () => {
  for (const locale of locales)
    test(`the product page gives the availability and delivery estimate in ${locale}`, async ({
      page,
      request,
    }) => {
      await page.goto(
        await productAddress(request, locale, MILLION_PRODUCT_ID),
      );
      const availability = page.locator("[data-availability]");
      await expect(availability).toHaveCount(1);
      expect(["in-stock", "on-order", "out-of-stock"]).toContain(
        await availability.getAttribute("data-availability"),
      );
      await expect(availability.locator("strong")).not.toHaveText("");
      await expect(availability).toContainText("·");
    });
});
