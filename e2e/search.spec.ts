// The search box and model search (docs/adr/0010-search.md, issue #113):
// the header's form, the search route's redirects and the results page, on
// the small catalog. Model references come from the seeded generator, which
// loaded the catalog the tests run against.
import { expect, test } from "@playwright/test";
import { modelRows } from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import { MODEL_WORDS, SEARCH_WORDS } from "../site/addresses.ts";
import { MODEL_RESULTS } from "../site/search-key.ts";
import { locationPath } from "./addresses.ts";

/** The first generated model's reference, such as AB0001-42. */
const [, , REFERENCE] = modelRows(1, "small").next().value as [
  number,
  number,
  string,
  string,
];

const searchRoute = (lang: string, q: string) =>
  `/api/search?lang=${lang}&q=${encodeURIComponent(q)}`;

test.describe("the search route", () => {
  test("sends an exact model reference, in any form, to that model's page", async ({
    request,
  }) => {
    const queries = [
      REFERENCE,
      REFERENCE.toLowerCase(),
      REFERENCE.replace("-", " "),
      REFERENCE.replace("-", ""),
    ];
    for (const query of queries) {
      const response = await request.get(searchRoute("de", query), {
        maxRedirects: 0,
      });
      expect(response.status(), query).toBe(307);
      const path = locationPath(response);
      expect(path.startsWith(`/de/${MODEL_WORDS.de}/`), path).toBe(true);
      expect(path.endsWith(`-${REFERENCE.toLowerCase()}`), path).toBe(true);
      expect((await request.get(path)).status()).toBe(200);
    }
  });

  test("sends any other query to the results page in the form's language", async ({
    request,
  }) => {
    const response = await request.get(searchRoute("fr", "ab c"), {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toMatch(
      new RegExp(`/fr/${SEARCH_WORDS.fr}\\?q=ab%20c$`),
    );
  });

  test("refuses an unknown language", async ({ request }) => {
    const response = await request.get(searchRoute("xx", REFERENCE), {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(404);
  });
});

test.describe("the results page", () => {
  test("lists models by prefix, each linking to its page, and stays out of indexes", async ({
    page,
  }) => {
    const prefix = REFERENCE.slice(0, 2).toLowerCase();
    await page.goto(`/fr/${SEARCH_WORDS.fr}?q=${prefix}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    const links = page.locator('main ul[data-list="models"] > li > a');
    // Each two-letter prefix starts about 1,500 of the million references.
    await expect(links).toHaveCount(MODEL_RESULTS);
    for (const href of await links.evaluateAll((anchors) =>
      anchors.map((a) => a.getAttribute("href") ?? ""),
    )) {
      expect(href.startsWith(`/fr/${MODEL_WORDS.fr}/`), href).toBe(true);
      expect(href.split("-").at(1)?.startsWith(prefix), href).toBe(true);
    }
    // The search box keeps the query.
    await expect(page.getByRole("searchbox")).toHaveValue(prefix);
  });

  test("says when no model matches", async ({ page }) => {
    await page.goto(`/en/${SEARCH_WORDS.en}?q=zzzzzzzzzz`);
    await expect(page.locator("[data-search-empty]")).toBeVisible();
    await expect(page.locator('ul[data-list="models"]')).toHaveCount(0);
  });

  test("answers in the address's language for any language's search word", async ({
    page,
  }) => {
    const response = await page.goto(
      `/de/${SEARCH_WORDS.fr.toUpperCase()}?q=zzzzzzzzzz`,
    );
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });
});

test.describe("the search box", () => {
  test("is in every language's header, labelled in that language", async ({
    page,
  }) => {
    for (const locale of locales) {
      await page.goto(`/${locale}`);
      const box = page.getByRole("banner").getByRole("search");
      await expect(box.getByRole("searchbox")).toHaveCount(1);
      await expect(box.locator('input[name="lang"]')).toHaveValue(locale);
    }
  });

  test("takes a visitor from any page to the model they typed", async ({
    page,
  }) => {
    await page.goto(`/de/${SEARCH_WORDS.de}`);
    await page.getByRole("searchbox").fill(REFERENCE.toLowerCase());
    await page.getByRole("searchbox").press("Enter");
    await expect(page).toHaveURL(
      new RegExp(`/de/${MODEL_WORDS.de}/[a-z0-9]+-${REFERENCE.toLowerCase()}$`),
    );
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      REFERENCE,
    );
  });
});
