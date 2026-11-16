// The cart (issue #168): "Add to cart" on the product page and the cards,
// with JavaScript (the visitor stays) and without it (the cart page), the
// header's count, the cart page's changes, the cart route's refusals, and the
// catalog pages staying the same for every visitor (ADR 0013). Links are read
// from the lists that hold them (AGENTS.md, section 3).
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { categories, slugify } from "../catalog/generator.ts";
import { cartPath } from "../site/addresses.ts";
import {
  CART_COOKIE,
  CART_LINES,
  MAX_QUANTITY,
  serializeCart,
} from "../site/cart.ts";
import { productAddress } from "./addresses.ts";

const PRODUCT = 2;
const CART = cartPath("fr");
const BASE = "http://localhost:3100";

const cents = (text: string | null) => Number((text ?? "").replace(/\D/g, ""));

/** Sets the cart cookie as the route would, for the tests that start from a cart. */
const setCart = (context: BrowserContext, value: string) =>
  context.addCookies([{ name: CART_COOKIE, value, url: BASE }]);

/** Posts to the cart route as a page of the site does with JavaScript. */
function post(
  request: APIRequestContext,
  form: Record<string, string>,
  headers: Record<string, string> = {},
) {
  return request.post("/api/cart", {
    form: { lang: "fr", ...form },
    headers: { Origin: BASE, Accept: "application/json", ...headers },
    maxRedirects: 0,
  });
}

/** The first product, from id 1, whose page says it is out of stock. */
async function outOfStock(request: APIRequestContext) {
  for (let id = 1; id < 400; id++) {
    const address = await productAddress(request, "fr", id);
    const html = await (await request.get(address)).text();
    if (html.includes('data-availability="out-of-stock"'))
      return { id, address };
  }
  throw new Error("No product out of stock among the first 400.");
}

const count = (page: Page) =>
  page.locator("[data-cart-link] [data-cart-count]");

test.describe("with JavaScript", () => {
  test("adds from the product page and a card without leaving them, then changes the cart on its page", async ({
    page,
    request,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const address = await productAddress(request, "fr", PRODUCT);
    await page.goto(address);
    await expect(count(page)).toHaveAttribute("data-cart-count", "0");

    const form = page.locator("main form.add-to-cart");
    await form.getByLabel("Quantité").fill("2");
    await form.getByRole("button", { name: "Ajouter au panier" }).click();
    const notice = page.locator("[data-cart-notice]");
    await expect(notice).toHaveAttribute("data-cart-notice", "added");
    await expect(notice).toContainText("Ajouté à votre panier.");
    await expect(
      notice.getByRole("link", { name: "Voir le panier" }),
    ).toHaveAttribute("href", CART);
    await expect(count(page)).toHaveAttribute("data-cart-count", "2");
    expect(new URL(page.url()).pathname).toBe(address);

    // A card of the product's category, read from its list.
    const category = categories()[0];
    if (!category) throw new Error("No category.");
    await page.goto(`/fr/${slugify(category.names.fr)}`);
    await expect(count(page)).toHaveAttribute("data-cart-count", "2");
    const card = page.locator('main ul[data-list="products"] > li').first();
    const cardName = (await card.locator(":scope > a").textContent()) as string;
    await card.getByRole("button", { name: /Ajouter au panier/ }).click();
    await expect(count(page)).toHaveAttribute("data-cart-count", "3");

    await page.goto(CART);
    await expect(page.locator('main[data-template="cart"]')).toHaveCount(1);
    const lines = page.locator('main ul[data-list="cart"] > li');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(1).locator("a").first()).toHaveText(cardName);
    const totals = await page
      .locator("main [data-line-total]")
      .allTextContents();
    const subtotal = cents(
      await page.locator("main [data-cart-subtotal]").textContent(),
    );
    expect(subtotal).toBe(totals.reduce((sum, text) => sum + cents(text), 0));

    // Quantity changes and removals post to the route, which comes back here.
    const first = lines.first();
    await first.getByRole("spinbutton").fill("5");
    await first.getByRole("button", { name: /Mettre à jour/ }).click();
    await expect(page).toHaveURL(new RegExp(`${CART}$`));
    await expect(lines.first().getByRole("spinbutton")).toHaveValue("5");
    await expect(count(page)).toHaveAttribute("data-cart-count", "6");
    await lines
      .nth(1)
      .getByRole("button", { name: /Retirer/ })
      .click();
    await expect(lines).toHaveCount(1);
    await lines
      .first()
      .getByRole("button", { name: /Retirer/ })
      .click();
    await expect(page.locator("main [data-cart]")).toHaveAttribute(
      "data-cart",
      "empty",
    );
    await expect(page.locator("main")).toContainText("Votre panier est vide.");
    await expect(
      page.locator('main ul[data-list="categories"] > li'),
    ).toHaveCount(categories().length);
    await expect(count(page)).toHaveAttribute("data-cart-count", "0");
    expect(errors).toEqual([]);
  });

  test("two visitors with different carts get the same HTML for a catalog page", async ({
    browser,
    request,
  }) => {
    const address = await productAddress(request, "fr", PRODUCT);
    expect((await request.get(address)).status()).toBe(200);
    const bodies: string[] = [];
    for (const value of [null, "1_3.2_1"]) {
      const context = await browser.newContext();
      try {
        if (value) await setCart(context, value);
        const page = await context.newPage();
        const response = await page.goto(address);
        bodies.push((await response?.text()) ?? "");
        if (value)
          await expect(count(page)).toHaveAttribute("data-cart-count", "4");
      } finally {
        await context.close();
      }
    }
    expect(bodies[0]).toContain("data-cart-count");
    expect(bodies[1]).toBe(bodies[0]);
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the product page's form leads to the cart page, and the header shows no number", async ({
    page,
    request,
  }) => {
    const address = await productAddress(request, "fr", PRODUCT);
    await page.goto(address);
    await expect(count(page)).toBeEmpty();
    await page
      .locator("main form.add-to-cart")
      .getByRole("button", { name: "Ajouter au panier" })
      .click();
    await expect(page).toHaveURL(new RegExp(`${CART}$`));
    const lines = page.locator('main ul[data-list="cart"] > li');
    await expect(lines).toHaveCount(1);
    await expect(lines.first().locator("a").first()).toHaveAttribute(
      "href",
      address,
    );
    await expect(lines.first().getByRole("spinbutton")).toHaveValue("1");
    await expect(count(page)).toBeEmpty();
    await expect(page.locator("main [data-demo-notice]")).toBeVisible();
  });

  test("drops an unknown product, caps quantities and explains a full cart", async ({
    context,
    page,
    request,
  }) => {
    await setCart(context, `abc.${PRODUCT}_500.2147483000_1`);
    await page.goto(CART);
    const lines = page.locator('main ul[data-list="cart"] > li');
    await expect(lines).toHaveCount(1);
    await expect(lines.first().getByRole("spinbutton")).toHaveValue(
      String(MAX_QUANTITY),
    );

    // Fifty other products: ids the cookie check accepts, known or not.
    const full = Array.from({ length: CART_LINES }, (_, i) => ({
      id: 1000 + i,
      quantity: 1,
    }));
    await setCart(context, serializeCart(full));
    await page.goto(await productAddress(request, "fr", PRODUCT));
    await page
      .locator("main form.add-to-cart")
      .getByRole("button", { name: "Ajouter au panier" })
      .click();
    await expect(page.locator("main [data-cart-refusal]")).toHaveAttribute(
      "data-cart-refusal",
      "full",
    );
    // The cart page lists the products the catalog knows.
    await expect(page.locator("main [data-cart]")).toBeVisible();
  });
});

test.describe("the cart route", () => {
  test("refuses another site, bad fields, an unknown product and an out-of-stock one", async ({
    request,
  }) => {
    const foreign = await post(
      request,
      { intent: "add", product: "2", quantity: "1" },
      { Origin: "https://example.com" },
    );
    expect(foreign.status()).toBe(403);
    expect(foreign.headers()["set-cookie"]).toBeUndefined();

    for (const form of [
      { intent: "add", product: "2", quantity: "0" },
      { intent: "add", product: "2", quantity: "100" },
      { intent: "add", product: "abc", quantity: "1" },
      { intent: "buy", product: "2", quantity: "1" },
    ]) {
      const response = await post(request, form);
      expect(response.status(), JSON.stringify(form)).toBe(400);
      expect(await response.json()).toEqual({ status: "invalid", count: 0 });
    }

    const unknown = await post(request, {
      intent: "add",
      product: "2147483000",
      quantity: "1",
    });
    expect(await unknown.json()).toEqual({ status: "unavailable", count: 0 });

    const { id, address } = await outOfStock(request);
    const refused = await post(request, {
      intent: "add",
      product: String(id),
      quantity: "1",
    });
    expect(await refused.json()).toEqual({ status: "unavailable", count: 0 });
    const html = await (await request.get(address)).text();
    expect(html).not.toContain('class="add-to-cart');
  });

  test("sets a cookie of ids and quantities, readable by scripts, and leads to the cart page without JavaScript", async ({
    playwright,
  }) => {
    const request = await playwright.request.newContext({ baseURL: BASE });
    try {
      const added = await request.post("/api/cart", {
        form: { lang: "de", intent: "add", product: "2", quantity: "3" },
        headers: { Origin: BASE },
        maxRedirects: 0,
      });
      expect(added.status()).toBe(303);
      expect(added.headers().location).toBe(cartPath("de"));
      const cookie = added.headers()["set-cookie"] ?? "";
      expect(cookie).toContain(`${CART_COOKIE}=2_3`);
      expect(cookie).toMatch(/SameSite=lax/i);
      expect(cookie).not.toMatch(/HttpOnly/i);
      expect(added.headers()["cache-control"]).toContain("no-store");

      const again = await post(request, {
        intent: "add",
        product: "2",
        quantity: "98",
      });
      expect(await again.json()).toEqual({
        status: "added",
        count: MAX_QUANTITY,
      });

      const page = await request.get(cartPath("de"));
      const html = await page.text();
      expect(html).toContain('data-template="cart"');
      expect(html).toMatch(/<meta name="robots" content="noindex"/);
    } finally {
      await request.dispose();
    }
  });
});
