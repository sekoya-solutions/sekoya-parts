// The account page of a signed-in customer (issue #178): saved addresses
// added, edited and removed, up to the cap; the password changed, ending the
// other sessions; and "Delete my account", which removes the account and
// signs the browser out. The forms work with JavaScript and without it. Each
// test signs up its own account, under a random username. Links are read
// from the list that holds them (AGENTS.md, section 3).
import { randomBytes } from "node:crypto";
import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import { SESSION_COOKIE, SIGNED_IN_COOKIE } from "../site/account-rules.ts";
import { accountPagePath, accountPath } from "../site/addresses.ts";
import { CART_COOKIE } from "../site/cart.ts";
import { MAX_ADDRESSES } from "../site/saved-addresses.ts";

const BASE = "http://localhost:3100";
const ACCOUNT = accountPath("fr");
const PASSWORD = "a demo password, long enough";
const NEW_PASSWORD = "another demo password, long too";

const username = () => `e2e-${randomBytes(5).toString("hex")}`;
const main = (page: Page) => page.locator("main");
const notice = (page: Page, name: string) =>
  page.locator(`main [data-account-notice="${name}"]`);
const form = (page: Page, name: string) =>
  page.locator(`main form[data-account-form="${name}"]`);
const cards = (page: Page) =>
  page.locator('main ul[data-list="addresses"] > li');

/** Clicks a form's button and waits for the page the account route leads to. */
async function submit(page: Page, button: Locator) {
  const landed = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.request().isNavigationRequest() &&
      (response.request().redirectedFrom()?.url().endsWith("/api/account") ??
        false),
  );
  await button.click();
  await landed;
  await page.waitForLoadState("domcontentloaded");
}

/** Signs up from the sign-up page's form, which leads to the account page. */
async function signUp(page: Page, name = username()) {
  await page.goto(accountPagePath("fr", "sign-up"));
  const signUpForm = form(page, "sign-up");
  await signUpForm.getByLabel("Nom d’utilisateur").fill(name);
  await signUpForm.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await signUpForm.getByLabel("Confirmez le mot de passe").fill(PASSWORD);
  await submit(
    page,
    signUpForm.getByRole("button", { name: "Créer mon compte" }),
  );
  await expect(page).toHaveURL(new RegExp(`${ACCOUNT}$`));
  await expect(main(page).locator('[data-account="signed-in"]')).toBeVisible();
  return name;
}

/** Signs in through the route from another browser; returns its context. */
async function otherBrowser(
  request: APIRequestContext,
  name: string,
  password = PASSWORD,
) {
  const response = await request.post("/api/account", {
    form: { lang: "fr", intent: "sign-in", username: name, password },
    headers: { Origin: BASE },
    maxRedirects: 0,
  });
  return response.headers().location;
}

async function fillAddress(
  scope: Locator,
  values: { label?: string; name: string; line1: string; city: string },
) {
  await scope
    .getByLabel("Nom de l’adresse (facultatif), par exemple Maison")
    .fill(values.label ?? "");
  await scope.getByLabel("Nom complet").fill(values.name);
  await scope.getByLabel("Adresse", { exact: true }).fill(values.line1);
  await scope.getByLabel("Code postal").fill("75011");
  await scope.getByLabel("Ville").fill(values.city);
}

for (const javaScriptEnabled of [true, false]) {
  test.describe(
    javaScriptEnabled ? "with JavaScript" : "without JavaScript",
    () => {
      test.use({ javaScriptEnabled });

      test("adds, edits and removes a saved address", async ({ page }) => {
        await signUp(page);
        await expect(main(page)).toHaveAttribute("data-template", "account");
        await expect(
          main(page).locator('[data-addresses="none"]'),
        ).toBeVisible();

        const add = form(page, "address-add");
        await fillAddress(add, {
          label: "Maison",
          name: "Marie Dupont",
          line1: "12 rue des Lilas",
          city: "Paris",
        });
        await expect(add.getByLabel("Pays")).toHaveValue("FR");
        await add.getByLabel("Pays").selectOption("BE");
        await submit(
          page,
          add.getByRole("button", { name: "Enregistrer l’adresse" }),
        );
        await expect(notice(page, "address-saved")).toBeVisible();
        await expect(cards(page)).toHaveCount(1);
        await expect(cards(page).first()).toContainText("Maison");
        await expect(cards(page).first()).toContainText("75011 Paris");
        await expect(cards(page).first()).toContainText("Belgique");

        await cards(page)
          .first()
          .getByRole("link", { name: "Modifier : Maison" })
          .click();
        const edit = form(page, "address-edit");
        await expect(edit.getByLabel("Nom complet")).toHaveValue(
          "Marie Dupont",
        );
        await expect(edit.getByLabel("Pays")).toHaveValue("BE");
        await edit.getByLabel("Ville").fill("Lyon");
        await submit(
          page,
          edit.getByRole("button", { name: "Enregistrer les modifications" }),
        );
        await expect(notice(page, "address-saved")).toBeVisible();
        await expect(form(page, "address-edit")).toHaveCount(0);
        await expect(cards(page)).toHaveCount(1);
        await expect(cards(page).first()).toContainText("75011 Lyon");

        await submit(
          page,
          cards(page)
            .first()
            .getByRole("button", { name: "Supprimer : Maison" }),
        );
        await expect(notice(page, "address-removed")).toBeVisible();
        await expect(cards(page)).toHaveCount(0);
        await expect(
          main(page).locator('[data-addresses="none"]'),
        ).toBeVisible();
      });

      test("deletes the account after its password, and signs the browser out", async ({
        page,
        context,
      }) => {
        await context.addCookies([
          { name: CART_COOKIE, value: "2_3", url: BASE },
        ]);
        const name = await signUp(page);
        const add = form(page, "address-add");
        await fillAddress(add, {
          name: "Marie Dupont",
          line1: "1 rue",
          city: "Metz",
        });
        await submit(
          page,
          add.getByRole("button", { name: "Enregistrer l’adresse" }),
        );

        const remove = form(page, "delete");
        await remove
          .getByLabel("Mot de passe, pour confirmer")
          .fill("not the password");
        await submit(
          page,
          remove.getByRole("button", {
            name: "Supprimer mon compte définitivement",
          }),
        );
        await expect(notice(page, "current")).toBeVisible();
        await expect(
          main(page).locator('[data-account="signed-in"]'),
        ).toBeVisible();
        await expect(cards(page)).toHaveCount(1);

        await form(page, "delete")
          .getByLabel("Mot de passe, pour confirmer")
          .fill(PASSWORD);
        await submit(
          page,
          form(page, "delete").getByRole("button", {
            name: "Supprimer mon compte définitivement",
          }),
        );
        await expect(page).toHaveURL(
          new RegExp(`${ACCOUNT}\\?account=deleted$`),
        );
        await expect(notice(page, "deleted")).toBeVisible();
        await expect(
          main(page).locator('[data-account="signed-out"]'),
        ).toBeVisible();
        const cookies = await context.cookies(BASE);
        expect(cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();
        expect(
          cookies.find((c) => c.name === SIGNED_IN_COOKIE),
        ).toBeUndefined();
        expect(cookies.find((c) => c.name === CART_COOKIE)?.value).toBe("2_3");

        // The account is gone: its username and password no longer sign in.
        expect(await otherBrowser(page.request, name)).toBe(
          `${ACCOUNT}?account=wrong`,
        );
      });
    },
  );
}

test.describe("the account page", () => {
  test("changes the password and ends the other browsers' sessions", async ({
    page,
    playwright,
  }) => {
    const name = await signUp(page);
    const other = await playwright.request.newContext({ baseURL: BASE });
    try {
      expect(await otherBrowser(other, name)).toBe(ACCOUNT);
      expect(await (await other.get(ACCOUNT)).text()).toContain(
        'data-account="signed-in"',
      );

      const change = form(page, "password");
      await change.getByLabel("Mot de passe actuel").fill("not the password");
      await change
        .getByLabel("Nouveau mot de passe", { exact: true })
        .fill(NEW_PASSWORD);
      await change
        .getByLabel("Confirmez le nouveau mot de passe")
        .fill(NEW_PASSWORD);
      await submit(
        page,
        change.getByRole("button", { name: "Changer le mot de passe" }),
      );
      await expect(notice(page, "current")).toBeVisible();

      const again = form(page, "password");
      await again.getByLabel("Mot de passe actuel").fill(PASSWORD);
      await again
        .getByLabel("Nouveau mot de passe", { exact: true })
        .fill(NEW_PASSWORD);
      await again
        .getByLabel("Confirmez le nouveau mot de passe")
        .fill(NEW_PASSWORD);
      await submit(
        page,
        again.getByRole("button", { name: "Changer le mot de passe" }),
      );
      await expect(notice(page, "password-changed")).toBeVisible();
      // This browser stays signed in; the other one is signed out.
      await page.reload();
      await expect(
        main(page).locator('[data-account="signed-in"]'),
      ).toBeVisible();
      expect(await (await other.get(ACCOUNT)).text()).toContain(
        'data-account="signed-out"',
      );

      expect(await otherBrowser(other, name)).toBe(`${ACCOUNT}?account=wrong`);
      expect(await otherBrowser(other, name, NEW_PASSWORD)).toBe(ACCOUNT);
    } finally {
      await other.dispose();
    }
  });

  test(`holds ${MAX_ADDRESSES} addresses at most`, async ({ page }) => {
    await signUp(page);
    const address = (city: string) => ({
      lang: "fr",
      intent: "address-add",
      name: "Marie Dupont",
      line1: "12 rue des Lilas",
      postalCode: "75011",
      city,
      country: "FR",
    });
    for (let n = 1; n <= MAX_ADDRESSES + 1; n++) {
      const response = await page.request.post("/api/account", {
        form: address(`Ville ${n}`),
        headers: { Origin: BASE },
        maxRedirects: 0,
      });
      expect(response.headers().location).toBe(
        `${ACCOUNT}?account=${n <= MAX_ADDRESSES ? "address-saved" : "address-full"}`,
      );
    }
    await page.goto(ACCOUNT);
    await expect(cards(page)).toHaveCount(MAX_ADDRESSES);
    await expect(main(page).locator('[data-addresses="full"]')).toBeVisible();
    await expect(form(page, "address-add")).toHaveCount(0);
  });

  test("refuses a wrong address and an address of no session", async ({
    page,
    playwright,
  }) => {
    await signUp(page);
    const refused = await page.request.post("/api/account", {
      form: {
        lang: "fr",
        intent: "address-add",
        name: "Marie\nDupont",
        line1: "1 rue",
        postalCode: "75011",
        city: "Paris",
        country: "US",
      },
      headers: { Origin: BASE },
      maxRedirects: 0,
    });
    expect(refused.headers().location).toBe(
      `${ACCOUNT}?account=address-invalid`,
    );

    const signedOut = await playwright.request.newContext({ baseURL: BASE });
    try {
      const response = await signedOut.post("/api/account", {
        form: { lang: "fr", intent: "delete", password: PASSWORD },
        headers: { Origin: BASE },
        maxRedirects: 0,
      });
      expect(response.status()).toBe(303);
      expect(response.headers().location).toBe(`${ACCOUNT}?account=session`);
    } finally {
      await signedOut.dispose();
    }
  });
});
