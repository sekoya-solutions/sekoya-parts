// The order history (issue #188): a signed-in customer's placed orders on
// the account page, newest first, each leading to its own page at
// ?order=<number>, readable by its customer only; and "Delete my account",
// which deletes them with the account. With JavaScript and without it. Each
// test signs up its own account, under a random username. Links are read
// from the list or the marker that holds them, and each page's template is
// checked (AGENTS.md, section 3).
import { randomBytes } from "node:crypto";
import {
  type APIRequestContext,
  type Browser,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import pg from "pg";
import { ORDER_PARAM } from "../site/account-rules.ts";
import { accountPath, cartPath, orderPath } from "../site/addresses.ts";
import { CART_COOKIE } from "../site/cart.ts";

const BASE = "http://localhost:3100";
const ACCOUNT = accountPath("fr");
const PASSWORD = "a demo password, long enough";

const main = (page: Page) => page.locator("main");
const rows = (page: Page) =>
  page.locator('main table[data-list="orders"] tbody tr');

/** Signs up through the account route, as its form does, in this page's browser. */
async function signUp(request: APIRequestContext) {
  const response = await request.post("/api/account", {
    form: {
      lang: "fr",
      intent: "sign-up",
      username: `e2e-${randomBytes(5).toString("hex")}`,
      password: PASSWORD,
      confirm: PASSWORD,
    },
    headers: { Origin: BASE },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
}

/** Clicks a form's button and waits for the page its route leads to. */
async function submit(page: Page, button: Locator, route: string) {
  const landed = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.request().isNavigationRequest() &&
      (response.request().redirectedFrom()?.url().endsWith(route) ?? false),
  );
  await button.click();
  await landed;
  await page.waitForLoadState("domcontentloaded");
}

/** Places a demo order of one product from the cart; returns its number. */
async function placeOrder(page: Page, product: number) {
  await page
    .context()
    .addCookies([{ name: CART_COOKIE, value: `${product}_1`, url: BASE }]);
  await page.goto(cartPath("fr"));
  await page.locator("main a[data-checkout-link]").click();
  await expect(main(page)).toHaveAttribute("data-template", "checkout");
  const delivery = page.locator('main form[data-checkout="delivery"]');
  await delivery.getByLabel("Nom complet").fill("Ada Démo");
  await delivery
    .getByLabel("Adresse", { exact: true })
    .fill("1 rue des Essais");
  await delivery.getByLabel("Code postal").fill("69002");
  await delivery.getByLabel("Ville").fill("Lyon");
  await delivery.getByLabel("Pays").selectOption("FR");
  await delivery.getByLabel(/^Livraison à domicile :/).check();
  await submit(
    page,
    delivery.getByRole("button", { name: "Continuer vers le paiement" }),
    "/api/checkout",
  );
  await submit(
    page,
    main(page).getByRole("button", {
      name: "Valider la commande de démonstration",
    }),
    "/api/checkout",
  );
  await expect(main(page)).toHaveAttribute("data-template", "confirmation");
  return (await main(page).locator("[data-order-number]").textContent()) ?? "";
}

/** The orders rows a number names, read from the database the site uses. */
async function storedOrders(number: string) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      "SELECT id FROM orders WHERE number = $1",
      [number],
    );
    return rows.length;
  } finally {
    await client.end();
  }
}

async function newVisitor(browser: Browser) {
  const context = await browser.newContext({ baseURL: BASE });
  return { context, page: await context.newPage() };
}

for (const javaScriptEnabled of [true, false]) {
  test.describe(
    javaScriptEnabled ? "with JavaScript" : "without JavaScript",
    () => {
      test.use({ javaScriptEnabled });

      test("lists the customer's orders, opens each, and deletes them with the account", async ({
        page,
      }) => {
        await signUp(page.request);
        await page.goto(ACCOUNT);
        await expect(main(page).locator('[data-orders="none"]')).toBeVisible();

        const first = await placeOrder(page, 2);
        const second = await placeOrder(page, 3);
        // The confirmation leads to the order in the account.
        const link = main(page).locator("[data-order-account] a");
        await expect(link).toHaveAttribute("href", orderPath("fr", second));

        await page.goto(ACCOUNT);
        await expect(rows(page)).toHaveCount(2);
        // Newest first.
        await expect(rows(page).nth(0)).toHaveAttribute("data-order", second);
        await expect(rows(page).nth(1)).toHaveAttribute("data-order", first);
        const total = Number(
          await rows(page)
            .nth(1)
            .locator("[data-order-total]")
            .getAttribute("data-order-total"),
        );

        await rows(page).nth(1).getByRole("link", { name: first }).click();
        await expect(page).toHaveURL(
          new RegExp(`${ACCOUNT}\\?${ORDER_PARAM}=${first}$`),
        );
        await expect(main(page)).toHaveAttribute("data-template", "order");
        await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(
          `Commande ${first}`,
        );
        await expect(main(page).locator("[data-demo-notice]")).toBeVisible();
        await expect(main(page).locator("[data-order-date]")).toContainText(
          "Passée le",
        );
        await expect(main(page).locator("[data-order-address]")).toContainText(
          "1 rue des Essais",
        );
        await expect(
          main(page).locator('ul[data-list="order-lines"] > li'),
        ).toHaveCount(1);
        await expect(main(page).locator("[data-order-total]")).toHaveAttribute(
          "data-order-total",
          String(total),
        );
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
          "content",
          /noindex/,
        );

        // "Delete my account" takes the orders with it, at once.
        await page.goto(ACCOUNT);
        const remove = page.locator('main form[data-account-form="delete"]');
        await remove.getByLabel("Mot de passe, pour confirmer").fill(PASSWORD);
        await submit(
          page,
          remove.getByRole("button", {
            name: "Supprimer mon compte définitivement",
          }),
          "/api/account",
        );
        await expect(
          main(page).locator('[data-account="signed-out"]'),
        ).toBeVisible();
        expect(await storedOrders(first)).toBe(0);
        expect(await storedOrders(second)).toBe(0);
      });
    },
  );
}

test("shows an order to its customer only", async ({ browser, page }) => {
  await signUp(page.request);
  const number = await placeOrder(page, 2);
  const address = orderPath("fr", number);

  // Another customer gets the not-found page, as for a number never given,
  // with noindex and nothing of the order in its HTML. Its status stays 200:
  // the account page streams, and Next.js cannot change a status once the
  // response has started (site/account-page.tsx, orderView).
  const other = await newVisitor(browser);
  await signUp(other.page.request);
  const refused = await other.page.request.get(address, { maxRedirects: 0 });
  const html = await refused.text();
  expect(html).not.toContain("1 rue des Essais");
  expect(html).not.toContain('data-account="order"');
  expect(html).toMatch(/<meta name="robots" content="[^"]*noindex/);
  await other.page.goto(address);
  await expect(main(other.page)).toHaveAttribute("data-template", "not-found");
  await expect(main(other.page)).not.toContainText("1 rue des Essais");
  await other.context.close();

  // A visitor who is not signed in gets the sign-in form.
  const visitor = await newVisitor(browser);
  await visitor.page.goto(address);
  await expect(
    main(visitor.page).locator('form[data-account-form="sign-in"]'),
  ).toBeVisible();
  await expect(main(visitor.page)).not.toContainText("1 rue des Essais");
  await visitor.context.close();

  // A number that is not one, or that no order has, is not found either.
  for (const value of ["SP-1", "SP-999999999"]) {
    await page.goto(`${ACCOUNT}?${ORDER_PARAM}=${encodeURIComponent(value)}`);
    await expect(main(page), value).toHaveAttribute(
      "data-template",
      "not-found",
    );
  }

  await page.request.post("/api/account", {
    form: { lang: "fr", intent: "delete", password: PASSWORD },
    headers: { Origin: BASE },
    maxRedirects: 0,
  });
});
