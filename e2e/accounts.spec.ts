// The demo accounts (issue #177): sign-up, sign-in and sign-out from plain
// forms, with JavaScript and without it; the header's signed-in mark; the
// cart kept through both; refusals, the lockout included; the session
// revoked on sign-out; and the catalog pages staying the same for a
// signed-in visitor (ADR 0013). Each test signs up its own account, under a
// random username. Links are read from the page that holds them (AGENTS.md,
// section 3).
import { randomBytes } from "node:crypto";
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import {
  MAX_LOGIN_ATTEMPTS,
  SESSION_COOKIE,
  SIGNED_IN_COOKIE,
} from "../site/account-rules.ts";
import { accountPagePath, accountPath } from "../site/addresses.ts";
import { CART_COOKIE } from "../site/cart.ts";
import { productAddress } from "./addresses.ts";

const BASE = "http://localhost:3100";
const ACCOUNT = accountPath("fr");
const SIGN_UP = accountPagePath("fr", "sign-up");
const SIGN_OUT = accountPagePath("fr", "sign-out");
const PASSWORD = "a demo password, long enough";
const CART = "2_3";

const username = () => `e2e-${randomBytes(5).toString("hex")}`;

const state = (page: Page) =>
  page.locator("[data-account-link] [data-account-state]");

const cartCookie = async (context: BrowserContext) =>
  (await context.cookies(BASE)).find((c) => c.name === CART_COOKIE)?.value;

/** Fills and sends the sign-up form of the page it is on. */
async function signUp(page: Page, name: string, password = PASSWORD) {
  const form = page.locator('main form[data-account-form="sign-up"]');
  await form.getByLabel("Nom d’utilisateur").fill(name);
  await form.getByLabel("Mot de passe", { exact: true }).fill(password);
  await form.getByLabel("Confirmez le mot de passe").fill(password);
  await form.getByRole("button", { name: "Créer mon compte" }).click();
}

/** Fills and sends the account page's sign-in form. */
async function signIn(page: Page, name: string, password = PASSWORD) {
  const form = page.locator('main form[data-account-form="sign-in"]');
  await form.getByLabel("Nom d’utilisateur").fill(name);
  await form.getByLabel("Mot de passe").fill(password);
  await form.getByRole("button", { name: "Se connecter" }).click();
}

/** Signs up through the route, as the sign-up form does, and returns its cookies. */
async function signedUp(request: APIRequestContext, name: string) {
  const response = await request.post("/api/account", {
    form: {
      lang: "fr",
      intent: "sign-up",
      username: name,
      password: PASSWORD,
      confirm: PASSWORD,
    },
    headers: { Origin: BASE },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe(ACCOUNT);
  return response;
}

test.describe("with JavaScript", () => {
  test("signs up from the account page, keeps the cart, shows the mark, then signs out", async ({
    page,
    context,
  }) => {
    await context.addCookies([{ name: CART_COOKIE, value: CART, url: BASE }]);
    await page.goto(`/fr`);
    await expect(state(page)).toHaveAttribute("data-account-state", "");
    await page.locator("[data-account-link]").click();
    await expect(page).toHaveURL(new RegExp(`${ACCOUNT}$`));
    await expect(page.locator("main")).toHaveAttribute(
      "data-template",
      "account",
    );
    await expect(page.locator("main [data-no-reset]")).toBeVisible();
    await page
      .locator('main [data-account="signed-out"]')
      .getByRole("link", { name: "Créer un compte de démonstration" })
      .click();
    await expect(page.locator("main")).toHaveAttribute(
      "data-template",
      "sign-up",
    );

    const name = username();
    await signUp(page, name);
    await expect(page).toHaveURL(new RegExp(`${ACCOUNT}$`));
    await expect(page.locator('main [data-account="signed-in"]')).toContainText(
      name,
    );
    await expect(state(page)).toHaveAttribute(
      "data-account-state",
      "signed-in",
    );
    expect(await cartCookie(context)).toBe(CART);

    const cookies = await context.cookies(BASE);
    const session = cookies.find((c) => c.name === SESSION_COOKIE);
    expect(session?.httpOnly).toBe(true);
    expect(cookies.find((c) => c.name === SIGNED_IN_COOKIE)?.value).toBe("1");

    await page
      .locator('main [data-account="signed-in"]')
      .getByRole("button", { name: "Se déconnecter" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`${SIGN_OUT}\\?account=signed-out$`),
    );
    await expect(page.locator("main")).toHaveAttribute(
      "data-template",
      "sign-out",
    );
    await expect(
      page.locator('main [data-account-notice="signed-out"]'),
    ).toBeVisible();
    await expect(state(page)).toHaveAttribute("data-account-state", "");
    expect(await cartCookie(context)).toBe(CART);
    const after = await context.cookies(BASE);
    expect(after.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();
    expect(after.find((c) => c.name === SIGNED_IN_COOKIE)).toBeUndefined();
  });

  test("a signed-in and a signed-out visitor get the same HTML for a catalog page", async ({
    browser,
    playwright,
    request,
  }) => {
    const address = await productAddress(request, "fr", 2);
    const signUpRequest = await playwright.request.newContext({
      baseURL: BASE,
    });
    let cookies: { name: string; value: string; url: string }[];
    try {
      await signedUp(signUpRequest, username());
      cookies = (await signUpRequest.storageState()).cookies.map((c) => ({
        name: c.name,
        value: c.value,
        url: BASE,
      }));
    } finally {
      await signUpRequest.dispose();
    }
    expect(cookies.map((c) => c.name).sort()).toEqual(
      [SESSION_COOKIE, SIGNED_IN_COOKIE].sort(),
    );

    const bodies: string[] = [];
    for (const signedIn of [false, true]) {
      const context = await browser.newContext();
      try {
        if (signedIn) await context.addCookies(cookies);
        const page = await context.newPage();
        const response = await page.goto(address);
        bodies.push((await response?.text()) ?? "");
        await expect(state(page)).toHaveAttribute(
          "data-account-state",
          signedIn ? "signed-in" : "",
        );
      } finally {
        await context.close();
      }
    }
    expect(bodies[0]).toContain("data-account-state");
    expect(bodies[1]).toBe(bodies[0]);
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("signs up, out and in again with forms alone", async ({
    page,
    context,
  }) => {
    await context.addCookies([{ name: CART_COOKIE, value: CART, url: BASE }]);
    const name = username();
    await page.goto(SIGN_UP);
    await expect(page.locator("main [data-demo-notice]")).toBeVisible();
    await signUp(page, name);
    await expect(page).toHaveURL(new RegExp(`${ACCOUNT}$`));
    await expect(page.locator('main [data-account="signed-in"]')).toContainText(
      name,
    );
    // Without JavaScript the header's mark stays empty.
    await expect(state(page)).toBeEmpty();

    // The sign-out page asks first.
    await page.goto(SIGN_OUT);
    await page
      .locator('main [data-account="signed-in"]')
      .getByRole("button", { name: "Se déconnecter" })
      .click();
    await expect(
      page.locator('main [data-account-notice="signed-out"]'),
    ).toBeVisible();

    await page.goto(ACCOUNT);
    await signIn(page, name.toUpperCase());
    await expect(page.locator('main [data-account="signed-in"]')).toContainText(
      name,
    );
    expect(await cartCookie(context)).toBe(CART);
  });

  test("explains each refusal of the sign-up form", async ({ page }) => {
    const name = username();
    await page.goto(SIGN_UP);
    await signUp(page, "pas d’espaces");
    await expect(
      page.locator('main [data-account-notice="username"]'),
    ).toBeVisible();

    // The browser checks the length first; the route checks it again.
    const form = page.locator('main form[data-account-form="sign-up"]');
    await expect(
      form.getByLabel("Mot de passe", { exact: true }),
    ).toHaveAttribute("minlength", "12");

    await form.getByLabel("Nom d’utilisateur").fill(name);
    await form.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
    await form.getByLabel("Confirmez le mot de passe").fill(`${PASSWORD}!`);
    await form.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(
      page.locator('main [data-account-notice="mismatch"]'),
    ).toBeVisible();

    await signUp(page, name);
    await expect(page.locator('main [data-account="signed-in"]')).toBeVisible();
    await page.context().clearCookies();
    await page.goto(SIGN_UP);
    await signUp(page, name);
    await expect(
      page.locator('main [data-account-notice="taken"]'),
    ).toBeVisible();
  });

  test("refuses a wrong password, then locks the account after five failures", async ({
    page,
    playwright,
  }) => {
    const name = username();
    const request = await playwright.request.newContext({ baseURL: BASE });
    try {
      await signedUp(request, name);
    } finally {
      await request.dispose();
    }
    await page.goto(ACCOUNT);
    for (let attempt = 0; attempt < MAX_LOGIN_ATTEMPTS; attempt++) {
      await signIn(page, name, "not the right password");
      await expect(
        page.locator('main [data-account-notice="wrong"]'),
      ).toBeVisible();
    }
    await signIn(page, name);
    await expect(
      page.locator('main [data-account-notice="locked"]'),
    ).toBeVisible();
    await expect(
      page.locator('main [data-account="signed-out"]'),
    ).toBeVisible();
  });
});

test.describe("the account route and pages", () => {
  test("refuse another site, revoke the session on sign-out and stay out of indexes", async ({
    playwright,
  }) => {
    const request = await playwright.request.newContext({ baseURL: BASE });
    try {
      const other = await request.post("/api/account", {
        form: { lang: "fr", intent: "sign-out" },
        headers: { Origin: "https://example.com" },
        maxRedirects: 0,
      });
      expect(other.status()).toBe(403);

      const name = username();
      const signedIn = await signedUp(request, name);
      const cookie = signedIn.headers()["set-cookie"] ?? "";
      expect(cookie).toMatch(
        new RegExp(`${SESSION_COOKIE}=[^;]+;[^\\n]*HttpOnly`, "i"),
      );
      expect(signedIn.headers()["cache-control"]).toContain("no-store");
      const token = (await request.storageState()).cookies.find(
        (c) => c.name === SESSION_COOKIE,
      )?.value;
      expect(token).toBeTruthy();

      const page = await request.get(ACCOUNT);
      const html = await page.text();
      expect(html).toContain('data-account="signed-in"');
      expect(html).toMatch(/<meta name="robots" content="noindex"/);

      const out = await request.post("/api/account", {
        form: { lang: "fr", intent: "sign-out" },
        headers: { Origin: BASE },
        maxRedirects: 0,
      });
      expect(out.headers().location).toBe(`${SIGN_OUT}?account=signed-out`);

      // The token copied before the sign-out no longer opens the session.
      const replay = await request.get(ACCOUNT, {
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
      });
      expect(await replay.text()).toContain('data-account="signed-out"');

      for (const path of [SIGN_UP, SIGN_OUT]) {
        const response = await request.get(path);
        expect(response.status(), path).toBe(200);
        expect(await response.text(), path).toMatch(
          /<meta name="robots" content="noindex"/,
        );
      }
    } finally {
      await request.dispose();
    }
  });
});
