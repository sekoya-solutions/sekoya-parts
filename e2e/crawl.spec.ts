// robots.txt and the showcase sitemap as the built site serves them
// (issue #121, docs/adr/0011-languages-and-seo.md): the sitemap lists exactly
// the addresses robots.txt allows, each answering 200 without a redirect, and
// everything outside the showcase stays disallowed. The catalog's words are
// never written here: addresses come from the site's own redirects and links.
import { type APIRequestContext, expect, test } from "@playwright/test";
import { showcaseProducts } from "../catalog/showcase.ts";
import { locales } from "../cms/locales.ts";
import { isAllowed, parseRobots } from "../scripts/robots-match.ts";
import { searchPath } from "../site/addresses.ts";
import { SHOWCASE_MODELS_PER_PRODUCT } from "../site/crawl.ts";
import { productAddress } from "./addresses.ts";

async function served(request: APIRequestContext) {
  const robotsResponse = await request.get("/robots.txt", { maxRedirects: 0 });
  expect(robotsResponse.status()).toBe(200);
  const robots = parseRobots(await robotsResponse.text());
  const sitemapResponse = await request.get("/sitemap.xml", {
    maxRedirects: 0,
  });
  expect(sitemapResponse.status()).toBe(200);
  const locs = [
    ...(await sitemapResponse.text()).matchAll(/<loc>([^<]*)<\/loc>/g),
  ].map((match) => new URL(match[1] as string));
  return { robots, locs };
}

test.describe("robots.txt and the sitemap", () => {
  test("name the same showcase, on one origin, and robots.txt names the sitemap", async ({
    request,
  }) => {
    const { robots, locs } = await served(request);
    expect(locs.length).toBeGreaterThan(0);
    const origin = locs[0]?.origin;
    expect(new Set(locs.map((loc) => loc.origin))).toEqual(new Set([origin]));
    expect(robots.sitemaps).toEqual([`${origin}/sitemap.xml`]);

    const paths = locs.map((loc) => loc.pathname);
    expect(new Set(paths).size).toBe(paths.length);
    const allowedExactly = robots.rules
      .filter((rule) => rule.allow && rule.pattern.endsWith("$"))
      .map((rule) => rule.pattern.slice(0, -1))
      .filter((path) => path !== "/sitemap.xml");
    expect(new Set(allowedExactly)).toEqual(new Set(paths));
    expect(robots.rules).toContainEqual({ allow: false, pattern: "/" });
  });

  test("list the bare domain, the home pages and every showcase product in ten languages", async ({
    request,
  }) => {
    const { locs } = await served(request);
    const paths = new Set(locs.map((loc) => loc.pathname));
    expect(paths.has("/")).toBe(true);
    for (const locale of locales) expect(paths.has(`/${locale}`)).toBe(true);
    for (const locale of ["fr", "de"] as const)
      for (const { id } of showcaseProducts) {
        const address = await productAddress(request, locale, id);
        expect(paths.has(address), address).toBe(true);
      }
  });

  test("allow the showcase product's most popular models and disallow the rest of the catalog", async ({
    page,
    request,
  }) => {
    const { robots } = await served(request);
    // Product 1, a showcase product with a million compatible models.
    const address = await productAddress(request, "fr", 1);
    await page.goto(address);
    const models = await page
      .locator("main ul.reference-list > li > a")
      .evaluateAll((links) =>
        links.slice(0, 12).map((link) => link.getAttribute("href") ?? ""),
      );
    for (const model of models.slice(0, SHOWCASE_MODELS_PER_PRODUCT))
      expect(isAllowed(robots.rules, model), model).toBe(true);
    for (const model of models.slice(SHOWCASE_MODELS_PER_PRODUCT))
      expect(isAllowed(robots.rules, model), model).toBe(false);

    const blocked = [
      searchPath("fr", "joint"),
      "/admin",
      "/api/search?q=joint&lang=fr",
      `${address}/1`,
      await productAddress(request, "fr", 2),
      "/fr/p/sp000001",
    ];
    for (const path of blocked)
      expect(isAllowed(robots.rules, path), path).toBe(false);
  });

  test("list only addresses that answer 200 without a redirect", async ({
    request,
  }) => {
    test.setTimeout(180_000);
    const { locs } = await served(request);
    // Every language of the bare domain, home and category pages, and one
    // language of each product and model page, requested one at a time.
    const checked = locs.filter(
      (loc) =>
        loc.pathname.split("/").length <= 3 || loc.pathname.startsWith("/fr/"),
    );
    for (const loc of checked) {
      const response = await request.get(loc.pathname, { maxRedirects: 0 });
      expect(response.status(), loc.pathname).toBe(200);
    }
  });
});
