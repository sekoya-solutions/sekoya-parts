// The pages the Lighthouse check measures are the templates its checks are
// named after (AGENTS.md, section 3). Twice a section placed first in <main>
// sent the "category" check elsewhere: the terms page (issue #144), then the
// part finder (issue #155). This reads the addresses from the workflow itself
// and resolves them as scripts/lighthouse.ts does, on the build CI tests, so
// a wrong page fails here, before any deployment is measured. The account
// and order pages are read signed in, with a demo order placed through the
// checkout, as the script's own account does (issue #188). Each page's
// noindex tag must match the templates production's run expects to carry one.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { type APIRequestContext, expect, test } from "@playwright/test";
import {
  firstMainLink,
  linkedAddress,
  mainTemplate,
  NOINDEX_TEMPLATES,
  pageArguments,
} from "../scripts/lighthouse-report.ts";
import { checkoutPagePath } from "../site/addresses.ts";
import { CART_COOKIE } from "../site/cart.ts";

const BASE = "http://localhost:3100";
const SIGNED_IN_PAGES = ["account", "order"];

/** Signs up an account in this browser and places one demo order with it. */
async function signedInWithOrder(request: APIRequestContext) {
  const post = (form: Record<string, string>, route: string) =>
    request.post(route, {
      form: { lang: "fr", ...form },
      headers: { Origin: BASE },
      maxRedirects: 0,
    });
  const password = "a demo password, long enough";
  const signUp = await post(
    {
      intent: "sign-up",
      username: `e2e-${randomBytes(5).toString("hex")}`,
      password,
      confirm: password,
    },
    "/api/account",
  );
  expect(signUp.status()).toBe(303);
  const delivery = await post(
    {
      intent: "delivery",
      name: "Ada Démo",
      line1: "1 rue des Essais",
      line2: "",
      postalCode: "75001",
      city: "Paris",
      country: "FR",
      method: "home",
    },
    "/api/checkout",
  );
  expect(delivery.headers().location).toBe(checkoutPagePath("fr", "payment"));
  const payment = await request.get(checkoutPagePath("fr", "payment"));
  const total = /name="total" value="(\d+)"/.exec(await payment.text())?.[1];
  expect(total).toBeTruthy();
  const placed = await post(
    { intent: "place", total: total ?? "" },
    "/api/checkout",
  );
  expect(placed.headers().location).toBe(
    checkoutPagePath("fr", "confirmation"),
  );
  return () => post({ intent: "delete", password }, "/api/account");
}

/** The <page>=<address> arguments of the workflow's measuring step. */
function workflowPages() {
  const workflow = readFileSync(".github/workflows/lighthouse.yml", "utf8");
  const command =
    /node scripts\/lighthouse\.ts "\$DEPLOY_ENVIRONMENT" "\$DEPLOY_URL"([\s\S]*?)\n\s*#/.exec(
      workflow,
    )?.[1];
  if (!command) throw new Error("No measuring step in the workflow.");
  return pageArguments(command.trim().split(/\s+/));
}

const pages = workflowPages();

test("the workflow measures the thirteen templates", () => {
  expect(pages.map((p) => p.page).sort()).toEqual([
    "account",
    "brand",
    "cart",
    "category",
    "checkout",
    "home",
    "model",
    "order",
    "payment",
    "product",
    "references",
    "sign-out",
    "sign-up",
  ]);
});

for (const { page, address } of pages) {
  test(`Lighthouse's ${page} address leads to a ${page} page`, async ({
    context,
    page: browserPage,
  }) => {
    const { request } = browserPage;
    let remove: (() => Promise<unknown>) | null = null;
    if (SIGNED_IN_PAGES.includes(page)) {
      await context.addCookies([
        { name: CART_COOKIE, value: "2_1", url: BASE },
      ]);
      remove = await signedInWithOrder(request);
    }
    const linked = linkedAddress(address);
    let path = address;
    if (linked) {
      const from = await request.get(linked.page);
      expect(from.status(), linked.page).toBe(200);
      const href = firstMainLink(await from.text(), linked.prefix, linked.list);
      expect(href, `${linked.page}: no link to ${linked.prefix}`).toBeTruthy();
      path = href as string;
    }
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const html = await response.text();
    expect(mainTemplate(html), path).toBe(page);
    // Production's run expects a noindex tag exactly on NOINDEX_TEMPLATES,
    // an audit previews skip: the checkout's steps were missing from it, and
    // only production's run for 9a5b93f found out (issue #188).
    expect(
      /<meta name="robots" content="[^"]*noindex/.test(html),
      `${path}: noindex`,
    ).toBe(NOINDEX_TEMPLATES.includes(page));
    await remove?.();
  });
}
