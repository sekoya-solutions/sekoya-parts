// The bare domain, the language home pages and the routes outside the site
// (issue #73, docs/adr/0011-languages-and-seo.md).
import { expect, test } from "@playwright/test";
import { locales } from "../cms/locales.ts";

test("the bare domain lists the ten languages, with the home pages' language tags", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Sekoya Parts",
  );
  const links = await page
    .getByRole("main")
    .locator("a")
    .evaluateAll((anchors) =>
      anchors.map((a) => [a.getAttribute("hreflang"), a.getAttribute("href")]),
    );
  expect(links).toEqual(locales.map((locale) => [locale, `/${locale}`]));

  const alternates = await page
    .locator('head link[rel="alternate"][hreflang]')
    .evaluateAll((tags) =>
      tags.map((tag) => [
        tag.getAttribute("hreflang"),
        new URL(tag.getAttribute("href") as string).pathname,
      ]),
    );
  expect(alternates.sort()).toEqual(
    [
      ...locales.map((locale) => [locale, `/${locale}`]),
      ["x-default", "/"],
    ].sort(),
  );
});

for (const locale of locales) {
  test(`/${locale} answers 200 in its language`, async ({ page }) => {
    const response = await page.goto(`/${locale}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Sekoya Parts",
    );
  });
}

for (const path of ["/xx", "/FR", "/en-gb", "/fr/unknown/address/here"]) {
  test(`${path} answers 404`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(404);
  });
}

test("Payload's admin and API routes still answer", async ({ request }) => {
  const admin = await request.get("/admin");
  expect(admin.status()).toBe(200);
  const me = await request.get("/api/users/me");
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({ user: null });
});
