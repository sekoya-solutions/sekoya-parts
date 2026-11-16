// The cart page's amounts and suggestions (issue #169): delivery and the
// free-delivery threshold, the demo promotion codes seeded by the cart
// pricing migration (DEMO10 for 10% off, ETE2026 expired), and "Complete
// your repair". Mostly without JavaScript, which every form must work
// without; the amounts are read from the page and checked against each
// other, since the generated prices depend on the catalog's seed.
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { cartPath } from "../site/addresses.ts";
import { CART_COOKIE, PROMO_COOKIE } from "../site/cart.ts";

const PRODUCT = 2;
const CART = cartPath("fr");
const BASE = "http://localhost:3100";
const DELIVERY = 690;
const FREE_FROM = 4900;

const cents = (text: string | null) => Number((text ?? "").replace(/\D/g, ""));

const setCookie = (context: BrowserContext, name: string, value: string) =>
  context.addCookies([{ name, value, url: BASE }]);

async function amounts(page: Page) {
  const main = page.locator("main");
  const discount = main.locator("[data-cart-discount]");
  return {
    subtotal: cents(await main.locator("[data-cart-subtotal]").textContent()),
    discount: (await discount.count())
      ? cents(await discount.textContent())
      : 0,
    delivery: Number(
      await main
        .locator("[data-cart-delivery]")
        .getAttribute("data-cart-delivery"),
    ),
    total: cents(await main.locator("[data-cart-total]").textContent()),
    left: Number(
      await main
        .locator("[data-free-delivery-left]")
        .getAttribute("data-free-delivery-left"),
    ),
  };
}

/** The unit price of the cart's only line, in cents. */
async function unitPrice(context: BrowserContext, page: Page) {
  await setCookie(context, CART_COOKIE, `${PRODUCT}_1`);
  await page.goto(CART);
  return (await amounts(page)).subtotal;
}

async function applyCode(page: Page, code: string) {
  const form = page.locator("main form.cart-code");
  await form.getByLabel("Code promo").fill(code);
  await form.getByRole("button", { name: "Appliquer" }).click();
  await expect(page).toHaveURL(new RegExp(`${CART}(\\?|$)`));
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("charges delivery below the threshold, says what is left, and delivers free from it", async ({
    context,
    page,
  }) => {
    const price = await unitPrice(context, page);
    expect(price).toBeGreaterThan(0);
    const below = Math.max(1, Math.ceil(FREE_FROM / price) - 1);
    if (below * price < FREE_FROM) {
      await setCookie(context, CART_COOKIE, `${PRODUCT}_${below}`);
      await page.goto(CART);
      const shown = await amounts(page);
      expect(shown.subtotal).toBe(below * price);
      expect(shown.delivery).toBe(DELIVERY);
      expect(shown.left).toBe(FREE_FROM - shown.subtotal);
      expect(shown.total).toBe(shown.subtotal + DELIVERY);
      await expect(
        page.locator("main [data-free-delivery-left]"),
      ).toContainText("pour la livraison offerte");
    }

    const enough = Math.ceil(FREE_FROM / price);
    await setCookie(context, CART_COOKIE, `${PRODUCT}_${enough}`);
    await page.goto(CART);
    const free = await amounts(page);
    expect(free.subtotal).toBeGreaterThanOrEqual(FREE_FROM);
    expect(free.delivery).toBe(0);
    expect(free.left).toBe(0);
    expect(free.total).toBe(free.subtotal);
    await expect(page.locator("main [data-cart-delivery]")).toHaveText(
      "Offerte",
    );
  });

  test("applies DEMO10 as typed, in any case, then removes it", async ({
    context,
    page,
  }) => {
    await setCookie(context, CART_COOKIE, `${PRODUCT}_3`);
    await page.goto(CART);
    await expect(page.locator("main [data-demo-code]")).toContainText("DEMO10");
    const before = await amounts(page);

    await applyCode(page, "  demo10 ");
    await expect(page.locator("main [data-cart-code]")).toHaveAttribute(
      "data-cart-code",
      "DEMO10",
    );
    await expect(page.locator("main [data-cart-refusal]")).toHaveCount(0);
    const after = await amounts(page);
    expect(after.subtotal).toBe(before.subtotal);
    expect(after.discount).toBe(Math.round(before.subtotal / 10));
    // Free delivery is reached on the subtotal after the discount.
    const net = after.subtotal - after.discount;
    expect(after.delivery).toBe(net >= FREE_FROM ? 0 : DELIVERY);
    expect(after.total).toBe(net + after.delivery);
    const cookie = (await context.cookies()).find(
      (c) => c.name === PROMO_COOKIE,
    );
    expect(cookie?.value).toBe("DEMO10");
    expect(cookie?.httpOnly).toBe(true);

    await page
      .locator("main [data-cart-code]")
      .getByRole("button", { name: "Retirer le code" })
      .click();
    await expect(page.locator("main [data-cart-code]")).toHaveCount(0);
    expect((await amounts(page)).discount).toBe(0);
    expect((await context.cookies()).some((c) => c.name === PROMO_COOKIE)).toBe(
      false,
    );
  });

  test("refuses an unknown and an expired code with a message, and keeps none", async ({
    context,
    page,
  }) => {
    await setCookie(context, CART_COOKIE, `${PRODUCT}_1`);
    for (const [code, refusal, text] of [
      ["NOPE", "code-unknown", "Ce code promo n’existe pas."],
      ["ETE2026", "code-expired", "Ce code promo a expiré."],
    ] as const) {
      await page.goto(CART);
      await applyCode(page, code);
      const notice = page.locator("main [data-cart-refusal]");
      await expect(notice).toHaveAttribute("data-cart-refusal", refusal);
      await expect(notice).toHaveText(text);
      expect((await amounts(page)).discount).toBe(0);
      expect(
        (await context.cookies()).some((c) => c.name === PROMO_COOKIE),
      ).toBe(false);
    }
  });

  test("checks a kept code again on each visit, never trusting the cookie", async ({
    context,
    page,
  }) => {
    await setCookie(context, CART_COOKIE, `${PRODUCT}_1`);
    await setCookie(context, PROMO_COOKIE, "ETE2026");
    await page.goto(CART);
    await expect(page.locator("main [data-code-refusal]")).toHaveAttribute(
      "data-code-refusal",
      "expired",
    );
    expect((await amounts(page)).discount).toBe(0);
  });

  test("suggests related products not in the cart, and adds one", async ({
    context,
    page,
  }) => {
    await setCookie(context, CART_COOKIE, `${PRODUCT}_1`);
    await page.goto(CART);
    const cards = page.locator('main ul[data-list="suggestions"] > li');
    const shown = await cards.count();
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThanOrEqual(4);
    const lineLink = await page
      .locator('main ul[data-list="cart"] > li a')
      .first()
      .getAttribute("href");
    for (let i = 0; i < shown; i++)
      expect(
        await cards.nth(i).locator("a").first().getAttribute("href"),
      ).not.toBe(lineLink);

    const suggested = await cards
      .first()
      .locator("a")
      .first()
      .getAttribute("href");
    await cards
      .first()
      .getByRole("button", { name: /Ajouter au panier/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`${CART}$`));
    const lines = page.locator('main ul[data-list="cart"] > li');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(1).locator("a").first()).toHaveAttribute(
      "href",
      suggested ?? "",
    );
  });
});

test.describe("with JavaScript", () => {
  test("a suggestion's button reloads the cart page with its totals computed again", async ({
    context,
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await setCookie(context, CART_COOKIE, `${PRODUCT}_1`);
    await page.goto(CART);
    const before = await amounts(page);
    await page
      .locator('main ul[data-list="suggestions"] > li')
      .first()
      .getByRole("button", { name: /Ajouter au panier/ })
      .click();
    await expect(page.locator('main ul[data-list="cart"] > li')).toHaveCount(2);
    expect((await amounts(page)).subtotal).toBeGreaterThan(before.subtotal);
    expect(errors).toEqual([]);
  });
});
