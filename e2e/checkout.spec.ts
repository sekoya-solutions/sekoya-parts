// The mock checkout (issue #187): from the cart to the delivery step, the
// payment step and the confirmation, as a guest or signed in, with
// JavaScript and without it. The draft lives in the database, named by the
// checkout cookie, which only the server reads; nothing is ever charged or
// delivered. Links are read from the list or the marker that holds them,
// and each page's template is checked (AGENTS.md, section 3). The delivery
// values are those the migrations seed: 6.90 € home, 3.90 € pickup, both
// free from 49 €.
import { randomBytes } from "node:crypto";
import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import { ACCOUNT_NOTICE_PARAM } from "../site/account-rules.ts";
import {
  accountPagePath,
  cartPath,
  checkoutPagePath,
} from "../site/addresses.ts";
import { CART_COOKIE } from "../site/cart.ts";
import { CHECKOUT_COOKIE } from "../site/checkout-rules.ts";

const BASE = "http://localhost:3100";
const PRODUCT = 2;
const CHECKOUT = checkoutPagePath("fr", "checkout");
const PAYMENT = checkoutPagePath("fr", "payment");
const CONFIRMATION = checkoutPagePath("fr", "confirmation");
const HOME_CENTS = 690;
const PICKUP_CENTS = 390;
const FREE_FROM = 4900;

const main = (page: Page) => page.locator("main");
const cents = (text: string | null) => Number((text ?? "").replace(/\D/g, ""));
const notice = (page: Page, name: string) =>
  page.locator(`main [data-checkout-notice="${name}"]`);

const setCart = (context: BrowserContext, value: string) =>
  context.addCookies([{ name: CART_COOKIE, value, url: BASE }]);

/** Clicks a form's button and waits for the page the checkout route leads to. */
async function submit(page: Page, button: Locator) {
  const landed = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.request().isNavigationRequest() &&
      (response.request().redirectedFrom()?.url().endsWith("/api/checkout") ??
        false),
  );
  await button.click();
  await landed;
  await page.waitForLoadState("domcontentloaded");
}

/** Goes from the cart page's link to the delivery step. */
async function startCheckout(page: Page) {
  await page.goto(cartPath("fr"));
  await page.locator("main a[data-checkout-link]").click();
  await expect(page).toHaveURL(new RegExp(`${CHECKOUT}$`));
  await expect(main(page)).toHaveAttribute("data-template", "checkout");
}

async function fillAddress(scope: Locator) {
  await scope.getByLabel("Nom complet").fill("Ada Démo");
  await scope.getByLabel("Adresse", { exact: true }).fill("1 rue de l’Essai");
  await scope.getByLabel("Code postal").fill("69002");
  await scope.getByLabel("Ville").fill("Lyon");
  await scope.getByLabel("Pays").selectOption("FR");
}

const deliveryForm = (page: Page) =>
  page.locator('main form[data-checkout="delivery"]');

async function continueToPayment(page: Page) {
  await submit(
    page,
    deliveryForm(page).getByRole("button", {
      name: "Continuer vers le paiement",
    }),
  );
}

async function placeOrder(page: Page) {
  await submit(
    page,
    main(page).getByRole("button", {
      name: "Valider la commande de démonstration",
    }),
  );
}

async function orderTotals(page: Page) {
  const scope = main(page);
  return {
    subtotal: cents(await scope.locator("[data-order-subtotal]").textContent()),
    delivery: Number(
      await scope
        .locator("[data-order-delivery]")
        .getAttribute("data-order-delivery"),
    ),
    total: Number(
      await scope
        .locator("[data-order-total]")
        .getAttribute("data-order-total"),
    ),
  };
}

for (const javaScriptEnabled of [true, false]) {
  test.describe(
    javaScriptEnabled ? "with JavaScript" : "without JavaScript",
    () => {
      test.use({ javaScriptEnabled });

      test("places a guest's demo order from the cart, then empties the cart", async ({
        context,
        page,
      }) => {
        await setCart(context, `${PRODUCT}_1`);
        await startCheckout(page);
        await expect(main(page).locator("[data-demo-notice]")).toBeVisible();
        await fillAddress(deliveryForm(page));
        await deliveryForm(page)
          .getByLabel(/^Livraison à domicile :/)
          .check();
        await continueToPayment(page);

        await expect(page).toHaveURL(new RegExp(`${PAYMENT}$`));
        await expect(main(page)).toHaveAttribute("data-template", "payment");
        await expect(main(page).locator("[data-order-address]")).toContainText(
          "1 rue de l’Essai",
        );
        await expect(
          main(page).locator('[data-order-method="home"]'),
        ).toBeVisible();
        await expect(main(page).locator("[data-demo-payment]")).toBeVisible();
        // No field asks for a card.
        await expect(
          main(page).locator("input:not([type=hidden])"),
        ).toHaveCount(0);
        const shown = await orderTotals(page);
        expect(shown.delivery).toBe(
          shown.subtotal >= FREE_FROM ? 0 : HOME_CENTS,
        );
        expect(shown.total).toBe(shown.subtotal + shown.delivery);

        await placeOrder(page);
        await expect(page).toHaveURL(new RegExp(`${CONFIRMATION}$`));
        await expect(main(page)).toHaveAttribute(
          "data-template",
          "confirmation",
        );
        await expect(main(page).locator("[data-order-number]")).toHaveText(
          /^SP-\d{6,}$/,
        );
        expect((await orderTotals(page)).total).toBe(shown.total);

        const cookies = await context.cookies(BASE);
        expect(cookies.find((c) => c.name === CART_COOKIE)).toBeUndefined();
        const checkout = cookies.find((c) => c.name === CHECKOUT_COOKIE);
        expect(checkout?.httpOnly).toBe(true);
        // The cookie holds a random token only, never the address.
        expect(checkout?.value).not.toContain("Lyon");

        await page.goto(cartPath("fr"));
        await expect(main(page).locator('[data-cart="empty"]')).toBeVisible();
      });

      test("refuses a pickup point in another country, keeping the address, then takes one in the address's", async ({
        context,
        page,
      }) => {
        await setCart(context, `${PRODUCT}_1`);
        await startCheckout(page);
        await fillAddress(deliveryForm(page));
        await deliveryForm(page)
          .getByLabel(/^Point de retrait :/)
          .check();
        await deliveryForm(page)
          .getByLabel("Point de retrait, pour ce mode de livraison")
          .selectOption("DE-1");
        await continueToPayment(page);

        await expect(page).toHaveURL(new RegExp(`${CHECKOUT}\\?notice=point$`));
        await expect(notice(page, "point")).toBeVisible();
        await expect(deliveryForm(page).getByLabel("Ville")).toHaveValue(
          "Lyon",
        );
        await expect(
          deliveryForm(page).getByLabel(/^Point de retrait :/),
        ).toBeChecked();

        await deliveryForm(page)
          .getByLabel("Point de retrait, pour ce mode de livraison")
          .selectOption("FR-2");
        await continueToPayment(page);
        await expect(page).toHaveURL(new RegExp(`${PAYMENT}$`));
        await expect(
          main(page).locator('[data-order-method="pickup"]'),
        ).toContainText("Point de retrait Sekoya Lyon");
        const shown = await orderTotals(page);
        expect(shown.delivery).toBe(
          shown.subtotal >= FREE_FROM ? 0 : PICKUP_CENTS,
        );
      });

      test("sends the visitor back to the payment step when the total changed", async ({
        context,
        page,
      }) => {
        await setCart(context, `${PRODUCT}_1`);
        await startCheckout(page);
        await fillAddress(deliveryForm(page));
        await deliveryForm(page)
          .getByLabel(/^Livraison à domicile :/)
          .check();
        await continueToPayment(page);
        const before = await orderTotals(page);

        // Another tab changed the cart since the page was shown.
        await setCart(context, `${PRODUCT}_3`);
        await placeOrder(page);
        await expect(page).toHaveURL(
          new RegExp(`${PAYMENT}\\?notice=changed$`),
        );
        await expect(notice(page, "changed")).toBeVisible();
        const after = await orderTotals(page);
        expect(after.subtotal).toBe(before.subtotal * 3);

        await placeOrder(page);
        await expect(page).toHaveURL(new RegExp(`${CONFIRMATION}$`));
        expect((await orderTotals(page)).total).toBe(after.total);
      });
    },
  );
}

test("offers a signed-in customer's saved addresses", async ({
  context,
  page,
}) => {
  const name = `e2e-${randomBytes(5).toString("hex")}`;
  const password = "a demo password, long enough";
  // Signs up and saves an address through the account route, as its forms do.
  const signUp = await page.request.post("/api/account", {
    form: {
      lang: "fr",
      intent: "sign-up",
      username: name,
      password,
      confirm: password,
    },
    headers: { Origin: BASE },
    maxRedirects: 0,
  });
  expect(signUp.status()).toBe(303);
  const saved = await page.request.post("/api/account", {
    form: {
      lang: "fr",
      intent: "address-add",
      label: "Atelier",
      name: "Ada Démo",
      line1: "7 quai des Essais",
      line2: "",
      postalCode: "13001",
      city: "Marseille",
      country: "FR",
    },
    headers: { Origin: BASE },
    maxRedirects: 0,
  });
  expect(saved.headers().location).toBe(
    `${accountPagePath("fr", "account")}?${ACCOUNT_NOTICE_PARAM}=address-saved`,
  );

  await setCart(context, `${PRODUCT}_1`);
  await startCheckout(page);
  const choice = main(page).locator('fieldset[data-list="saved-addresses"]');
  await expect(choice.getByLabel(/7 quai des Essais/)).toBeChecked();
  await deliveryForm(page)
    .getByLabel(/^Livraison à domicile :/)
    .check();
  await continueToPayment(page);
  await expect(page).toHaveURL(new RegExp(`${PAYMENT}$`));
  await expect(main(page).locator("[data-order-address]")).toContainText(
    "7 quai des Essais",
  );
  await placeOrder(page);
  await expect(main(page).locator("[data-order-number]")).toBeVisible();
  // A customer's order is not a guest's, deleted after 30 days.
  await expect(main(page)).not.toContainText("supprimée 30 jours");

  // Deletes the test's account, as "Delete my account" does.
  await page.request.post("/api/account", {
    form: { lang: "fr", intent: "delete", password },
    headers: { Origin: BASE },
    maxRedirects: 0,
  });
});

test("shows no form when the cart holds nothing to order", async ({ page }) => {
  await page.goto(CHECKOUT);
  await expect(main(page)).toHaveAttribute("data-template", "checkout");
  await expect(main(page).locator('[data-checkout="empty"]')).toBeVisible();
  await expect(main(page).locator("form")).toHaveCount(0);
});

test("asks to start again when no draft is in progress", async ({ page }) => {
  await page.goto(PAYMENT);
  await expect(main(page).locator('[data-checkout="expired"]')).toBeVisible();
  await page.goto(CONFIRMATION);
  await expect(main(page).locator('[data-checkout="no-order"]')).toBeVisible();
});

test("keeps the checkout pages out of search engines", async ({ page }) => {
  for (const path of [CHECKOUT, PAYMENT, CONFIRMATION]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  }
});

test("refuses a checkout form from another site", async ({ request }) => {
  const response = await request.post("/api/checkout", {
    form: { lang: "fr", intent: "place", total: "0" },
    headers: { Origin: "https://elsewhere.example" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(403);
});
