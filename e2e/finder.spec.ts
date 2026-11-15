// The part finder (issue #155): brand, then appliance type, then model, with
// no browser code. The brands, types and models are read from the pages,
// never written.
import { expect, test } from "@playwright/test";
import {
  FINDER_WORDS,
  MODEL_WORDS,
  POPULAR_MODELS,
} from "../site/addresses.ts";
import { locationAddress } from "./addresses.ts";

test.use({ javaScriptEnabled: false });

const FINDER = `/fr/${FINDER_WORDS.fr}`;

/** Goes through steps 1 and 2 from the home page; returns the brand and type. */
async function toStepThree(page: import("@playwright/test").Page) {
  await page.goto("/fr");
  const form = page.locator('form[data-finder-step="brand"]');
  const brand = (await form
    .locator("select option:not([disabled])")
    .first()
    .getAttribute("value")) as string;
  await form.locator("select").selectOption(brand);
  await form.getByRole("button").click();
  await expect(page.locator("[data-finder-progress]")).toHaveAttribute(
    "data-finder-progress",
    "2",
  );
  const typeLink = page.locator('[data-finder-step="type"] li a').first();
  const href = (await typeLink.getAttribute("href")) as string;
  await typeLink.click();
  const type = new URL(href, "http://site.test").searchParams.get(
    "type",
  ) as string;
  return { brand, type };
}

test("the home page's form leads to the brand's appliance types, each with its models", async ({
  page,
}) => {
  await page.goto("/fr");
  const form = page.locator('form[data-finder-step="brand"]');
  await expect(form).toHaveAttribute("method", "get");
  await expect(form).toHaveAttribute("action", FINDER);
  const brand = (await form
    .locator("select option:not([disabled])")
    .first()
    .getAttribute("value")) as string;
  await form.locator("select").selectOption(brand);
  await form.getByRole("button").click();
  expect(new URL(page.url()).pathname).toBe(FINDER);
  expect(new URL(page.url()).searchParams.get("brand")).toBe(brand);
  const types = page.locator('[data-finder-step="type"] li');
  await expect(types).toHaveCount(8);
  for (const text of await types.locator("span").allTextContents())
    expect(Number(text.replace(/\D/g, ""))).toBeGreaterThan(0);
  expect(
    await page.locator('head meta[name="robots"]').getAttribute("content"),
  ).toContain("noindex");
});

test("the third step lists the pair's 24 most popular models and a field searching within them", async ({
  page,
}) => {
  const { brand } = await toStepThree(page);
  await expect(page.locator("[data-finder-progress]")).toHaveAttribute(
    "data-finder-progress",
    "3",
  );
  const models = page.locator('[data-list="popular-models"] a');
  await expect(models).toHaveCount(POPULAR_MODELS);
  for (const href of await models.evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") as string),
  ))
    expect(href.startsWith(`/fr/${MODEL_WORDS.fr}/${brand}-`), href).toBe(true);
});

test("an exact reference goes straight to its model page", async ({ page }) => {
  await toStepThree(page);
  const first = page.locator('[data-list="popular-models"] a').first();
  const reference = (await first.textContent()) as string;
  const target = (await first.getAttribute("href")) as string;
  await page.getByLabel("Référence du modèle").fill(reference.toLowerCase());
  await page
    .locator('[data-finder-step="model"] form')
    .getByRole("button")
    .click();
  expect(new URL(page.url()).pathname).toBe(target);
});

test("a partial reference lists the matching models of the pair only", async ({
  page,
}) => {
  const { brand, type } = await toStepThree(page);
  const reference = (await page
    .locator('[data-list="popular-models"] a')
    .first()
    .textContent()) as string;
  const prefix = reference.slice(0, 3);
  await page.getByLabel("Référence du modèle").fill(prefix);
  await page
    .locator('[data-finder-step="model"] form')
    .getByRole("button")
    .click();
  const url = new URL(page.url());
  expect(url.pathname).toBe(FINDER);
  expect(url.searchParams.get("brand")).toBe(brand);
  expect(url.searchParams.get("type")).toBe(type);
  const matches = page.locator("[data-finder-matches] a");
  expect(await matches.count()).toBeGreaterThan(0);
  for (const href of await matches.evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") as string),
  ))
    expect(href.startsWith(`/fr/${MODEL_WORDS.fr}/${brand}-`), href).toBe(true);
});

test("the field's route answers an exact reference with a 307, anything else with the finder's page", async ({
  page,
  request,
}) => {
  const { brand, type } = await toStepThree(page);
  const first = page.locator('[data-list="popular-models"] a').first();
  const reference = (await first.textContent()) as string;
  const exact = await request.get(
    `/api/finder?lang=fr&brand=${brand}&type=${type}&q=${encodeURIComponent(reference)}`,
    { maxRedirects: 0 },
  );
  expect(exact.status()).toBe(307);
  expect(locationAddress(exact)).toBe(
    (await first.getAttribute("href")) as string,
  );
  const other = await request.get(
    `/api/finder?lang=fr&brand=${brand}&type=${type}&q=zzzz`,
    { maxRedirects: 0 },
  );
  expect(other.status()).toBe(307);
  expect(locationAddress(other)).toBe(
    `${FINDER}?brand=${brand}&type=${type}&q=zzzz`,
  );
});

test("an unknown brand or type falls back to the step before", async ({
  page,
}) => {
  await page.goto(`${FINDER}?brand=nosuchbrand&type=oven`);
  await expect(page.locator("[data-finder-progress]")).toHaveAttribute(
    "data-finder-progress",
    "1",
  );
  await page.goto("/fr");
  const brand = (await page
    .locator('form[data-finder-step="brand"] select option:not([disabled])')
    .first()
    .getAttribute("value")) as string;
  await page.goto(`${FINDER}?brand=${brand}&type=toaster`);
  await expect(page.locator("[data-finder-progress]")).toHaveAttribute(
    "data-finder-progress",
    "2",
  );
});
