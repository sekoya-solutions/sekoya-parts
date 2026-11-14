// Parts from Algolia on the results page (docs/adr/0010-search.md, issue
// #119), against the fake Algolia Playwright starts (e2e/fake-algolia.ts),
// whose records are built from the catalog the tests run against.
import { expect, test } from "@playwright/test";
import { modelRows } from "../catalog/generator.ts";
import { SEARCH_WORDS } from "../site/addresses.ts";
import type { ProductRecord } from "../site/algolia-record.ts";
import { PART_RESULTS } from "../site/algolia-search.ts";
import { MAX_QUERY_LENGTH } from "../site/search-key.ts";
import { FAKE_ALGOLIA_URL, FAKE_FAILURES } from "./fake-algolia-url.ts";

/** The first generated model's reference, such as AB0001-42. */
const [, , REFERENCE] = modelRows(1, "small").next().value as [
  number,
  number,
  string,
  string,
];
/** A two-letter prefix that starts many model references. */
const MODEL_PREFIX = REFERENCE.slice(0, 2).toLowerCase();

type Seen = { body: Record<string, unknown>; headers: Record<string, string> };

async function fakeRecords(): Promise<ProductRecord[]> {
  return (await fetch(`${FAKE_ALGOLIA_URL}/records`)).json();
}

/** The search requests the fake received for a query. */
async function requestsFor(query: string): Promise<Seen[]> {
  const url = new URL("/requests", FAKE_ALGOLIA_URL);
  url.searchParams.set("query", query);
  return (await fetch(url)).json();
}

const resultsPath = (lang: keyof typeof SEARCH_WORDS, query: string) =>
  `/${lang}/${SEARCH_WORDS[lang]}?q=${encodeURIComponent(query)}`;

test.describe("parts from Algolia", () => {
  test("are listed in the page's language, each linking to its page", async ({
    page,
    request,
  }) => {
    const records = await fakeRecords();
    const brand = (records[0] as ProductRecord).brand;
    // The fake's match: the query within one searched attribute.
    const expected = records.filter((r) =>
      [r.name_de, r.reference, r.brand].some((v) =>
        v.toLowerCase().includes(brand.toLowerCase()),
      ),
    );
    await page.goto(resultsPath("de", brand));
    const links = page.locator('main ul[data-list="parts"] > li > a');
    await expect(links).toHaveCount(Math.min(expected.length, PART_RESULTS));
    const hrefs = await links.evaluateAll((anchors) =>
      anchors.map((a) => a.getAttribute("href") ?? ""),
    );
    expect(hrefs).toEqual(
      expected.slice(0, PART_RESULTS).map((r) => r.path_de),
    );
    await expect(links.first()).toHaveText(expected[0]?.name_de ?? "");
    expect((await request.get(hrefs[0] as string)).status()).toBe(200);
    await expect(
      page.getByRole("link", { name: "Search by Algolia" }),
    ).toBeVisible();
  });

  test("are searched in the visitor's language only, with the search key, a visitor token and analytics off", async ({
    page,
  }) => {
    const query = "joint porte";
    await page.goto(resultsPath("it", query));
    const [seen] = await requestsFor(query);
    expect(seen).toBeDefined();
    const { body, headers } = seen as Seen;
    expect(body.restrictSearchableAttributes).toEqual([
      "name_it",
      "reference",
      "models",
      "brand",
    ]);
    expect(body.queryLanguages).toEqual(["it"]);
    expect(body.analytics).toBe(false);
    expect(body.clickAnalytics).toBe(false);
    expect(headers["x-algolia-api-key"]).toBe("fake-search-key");
    expect(headers["x-algolia-usertoken"]).toMatch(/^[0-9a-f]{32}$/);
  });

  test("send no request from the browser beyond the site itself", async ({
    page,
    baseURL,
  }) => {
    const origins = new Set<string>();
    page.on("request", (r) => origins.add(new URL(r.url()).origin));
    await page.goto(resultsPath("fr", MODEL_PREFIX));
    await page.waitForLoadState("load");
    expect([...origins]).toEqual([new URL(baseURL as string).origin]);
  });

  for (const [failure, ending] of Object.entries(FAKE_FAILURES)) {
    test(`leave the models in place when Algolia ${failure === "slow" ? "is too slow" : `answers ${failure === "limit" ? "429" : "500"}`}`, async ({
      page,
    }) => {
      const response = await page.goto(
        resultsPath("en", `${MODEL_PREFIX}${ending}`),
      );
      expect(response?.status()).toBe(200);
      await expect(page.locator('ul[data-list="models"] > li')).not.toHaveCount(
        0,
      );
      await expect(page.locator("[data-parts-unavailable]")).toBeVisible();
      await expect(page.locator('ul[data-list="parts"]')).toHaveCount(0);
    });
  }

  test("spend no search on an empty or too long query", async ({ page }) => {
    const long = "a".repeat(MAX_QUERY_LENGTH + 1);
    await page.goto(resultsPath("fr", long));
    await expect(page.locator("[data-parts-empty]")).toBeVisible();
    await page.goto(`/fr/${SEARCH_WORDS.fr}?q=`);
    await expect(page.locator("[data-search-results]")).toHaveCount(0);
    expect(await requestsFor(long)).toEqual([]);
    expect(await requestsFor("")).toEqual([]);
  });
});
