// "Does it fit my appliance?" and "Other parts for the same appliances" on
// the product page (issue #161): the answer under the form with JavaScript,
// the result page without it, the fit route, and the related products. The
// model references come from the pages' own reference lists, read by their
// list's marker (AGENTS.md, section 3).
import { expect, type Page, test } from "@playwright/test";
import { FIT_WORDS } from "../site/addresses.ts";
import { productAddress } from "./addresses.ts";

const PRODUCT = 2;

/** The models a product page lists, as "Brand REFERENCE" and their addresses. */
async function references(page: Page, address: string) {
  await page.goto(address);
  return page
    .locator('main ul[data-list="references"] > li > a')
    .evaluateAll((anchors) =>
      anchors.map((a) => ({
        text: a.textContent ?? "",
        href: a.getAttribute("href") ?? "",
      })),
    );
}

/** A model's reference: what follows its brand in the link text. */
const referenceOf = (text: string) => text.split(" ").at(-1) as string;

/** A model the product does not fit: the first of another product's that is not in its list. */
async function otherModel(
  page: Page,
  request: Parameters<typeof productAddress>[0],
  fitting: { href: string }[],
) {
  const fits = new Set(fitting.map((model) => model.href));
  for (let id = 40; id < 60; id++) {
    for (const model of await references(
      page,
      await productAddress(request, "fr", id),
    ))
      if (!fits.has(model.href)) return model;
  }
  throw new Error("No model outside the product's list was found.");
}

test.describe("with JavaScript", () => {
  test("answers yes, no and unknown under the form, without leaving the page", async ({
    page,
    request,
  }) => {
    const address = await productAddress(request, "fr", PRODUCT);
    const fitting = await references(page, address);
    const yes = fitting[0];
    if (!yes) throw new Error(`Product ${PRODUCT} lists no model.`);
    const no = await otherModel(page, request, fitting);

    await page.goto(address);
    const check = page.locator("[data-fit-check]");
    const field = check.getByLabel("Référence du modèle");
    const status = check.getByRole("status");

    // Lower case and a space, as a visitor may type it.
    await field.fill(referenceOf(yes.text).toLowerCase().replace("-", " "));
    await check.getByRole("button", { name: "Vérifier" }).click();
    const answer = status.locator('li[data-fit="yes"]');
    await expect(answer).toHaveCount(1);
    await expect(answer).toContainText("Oui, cette pièce convient");
    await expect(answer.locator("a")).toHaveAttribute("href", yes.href);
    expect(new URL(page.url()).pathname).toBe(address);

    await field.fill(referenceOf(no.text));
    await check.getByRole("button", { name: "Vérifier" }).click();
    await expect(status.locator('li[data-fit="no"] a')).toHaveAttribute(
      "href",
      no.href,
    );
    await expect(status.locator('li[data-fit="yes"]')).toHaveCount(0);

    await field.fill("ZZZZ9999-99");
    await check.getByRole("button", { name: "Vérifier" }).click();
    await expect(status.locator('[data-fit="no-model"]')).toContainText(
      "ZZZZ9999-99",
    );
  });

  test("says the check failed when the route cannot be reached", async ({
    page,
    request,
  }) => {
    await page.route("**/api/fit?*", (route) => route.abort());
    await page.goto(await productAddress(request, "fr", PRODUCT));
    const check = page.locator("[data-fit-check]");
    await check.getByLabel("Référence du modèle").fill("AB12");
    await check.getByRole("button", { name: "Vérifier" }).click();
    await expect(check.locator('[data-fit="error"]')).toHaveText(
      "La vérification n’a pas abouti. Réessayez.",
    );
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the form leads to the result page, which links back to the product", async ({
    page,
    request,
  }) => {
    const address = await productAddress(request, "en", PRODUCT);
    const yes = (await references(page, address))[0];
    if (!yes) throw new Error(`Product ${PRODUCT} lists no model.`);

    const check = page.locator("[data-fit-check]");
    await check.getByLabel("Model reference").fill(referenceOf(yes.text));
    await check.getByRole("button", { name: "Check" }).click();

    await expect(page.locator('main[data-template="fit"]')).toHaveCount(1);
    const url = new URL(page.url());
    expect(url.pathname).toBe(`/en/${FIT_WORDS.en}`);
    await expect(
      page.locator('meta[name="robots"][content*="noindex"]'),
    ).toHaveCount(1);
    const answer = page.locator('[data-fit-result] li[data-fit="yes"]');
    await expect(answer).toContainText("Yes, this part fits the");
    await expect(answer.locator("a")).toHaveAttribute("href", yes.href);
    await expect(
      page.getByRole("link", { name: "Back to the part" }),
    ).toHaveAttribute("href", address);
  });

  test("an unknown part says so", async ({ page }) => {
    const response = await page.goto(
      `/fr/${FIT_WORDS.fr}?part=ZZ999999&q=AB12`,
    );
    expect(response?.status()).toBe(200);
    await expect(page.locator('[data-fit="no-product"]')).toHaveText(
      "Cette pièce n’est plus au catalogue.",
    );
  });
});

test("the fit route refuses a malformed input and is never stored", async ({
  request,
}) => {
  for (const query of [
    "lang=fr&part=SP000002&q=",
    "lang=fr&part=SP000002&q=ab%2512",
    "lang=xx&part=SP000002&q=AB12",
  ]) {
    const response = await request.get(`/api/fit?${query}`);
    expect(response.status(), query).toBe(400);
    expect(await response.json(), query).toEqual({ status: "invalid" });
    expect(response.headers()["cache-control"], query).toContain("no-store");
  }
});

test("related products link to other product pages, at most eight", async ({
  page,
  request,
}) => {
  const address = await productAddress(request, "fr", PRODUCT);
  await page.goto(address);
  const links = page.locator('main ul[data-list="related"] > li > a');
  const hrefs = await links.evaluateAll((anchors) =>
    anchors.map((a) => a.getAttribute("href") ?? ""),
  );
  expect(hrefs.length).toBeGreaterThan(0);
  expect(hrefs.length).toBeLessThanOrEqual(8);
  expect(new Set(hrefs).size).toBe(hrefs.length);
  expect(hrefs).not.toContain(address);
  for (const href of hrefs.slice(0, 2)) {
    await page.goto(href);
    await expect(page.locator('main[data-template="product"]')).toHaveCount(1);
  }
});
