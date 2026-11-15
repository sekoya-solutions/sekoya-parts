// The information pages and the footer that links to them (issue #143), as
// the built site serves them, in the ten languages.
import { expect, test } from "@playwright/test";
import { locales } from "../cms/locales.ts";
import { isAllowed, parseRobots } from "../scripts/robots-match.ts";
import { INFO_PAGES, infoPagePath, infoPagePaths } from "../site/addresses.ts";
import { infoTexts } from "../site/info-texts.ts";
import { HOST } from "../site/publisher.ts";
import { locationPath } from "./addresses.ts";

// React escapes these characters in text; the titles hold none of them.
const escapeless = (text: string) => !/[&<>"']/.test(text);

for (const locale of locales) {
  test(`the six information pages answer 200 in ${locale}, with their headings`, async ({
    request,
  }) => {
    for (const page of INFO_PAGES) {
      const path = infoPagePath(locale, page);
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
      const html = await response.text();
      expect(html, path).toContain(`<html lang="${locale}"`);
      const { title } = infoTexts[locale][page];
      expect(escapeless(title), title).toBe(true);
      expect(html, path).toContain(`>${title}</h1>`);
    }
  });
}

test("the legal notice names the host", async ({ page }) => {
  await page.goto(infoPagePath("en", "legal"));
  await expect(page.getByRole("main")).toContainText(
    `${HOST.name}, ${HOST.address}`,
  );
});

test("an information page lists its ten versions and x-default", async ({
  page,
}) => {
  await page.goto(infoPagePath("de", "privacy"));
  const alternates = await page
    .locator('head link[rel="alternate"][hreflang]')
    .evaluateAll((tags) =>
      tags.map((tag) => [
        tag.getAttribute("hreflang"),
        new URL(tag.getAttribute("href") as string).pathname,
      ]),
    );
  const paths = infoPagePaths("privacy");
  expect(alternates.sort()).toEqual(
    [
      ...locales.map((locale) => [locale, paths[locale]]),
      ["x-default", paths.fr],
    ].sort(),
  );
  const canonical = await page
    .locator('head link[rel="canonical"]')
    .getAttribute("href");
  expect(new URL(canonical as string).pathname).toBe("/de/datenschutz");
});

test("another language's slug or letter case redirects permanently", async ({
  request,
}) => {
  for (const [wrong, right] of [
    ["/fr/privacy", "/fr/confidentialite"],
    ["/it/datenschutz", "/it/privacy"],
    ["/en/Legal-Notice", "/en/legal-notice"],
    ["/da/aide", "/da/hjaelp"],
  ]) {
    const response = await request.get(wrong as string, { maxRedirects: 0 });
    expect(response.status(), wrong).toBe(308);
    expect(locationPath(response), wrong).toBe(right);
  }
});

for (const locale of locales) {
  test(`the footer links to the six pages in ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const footer = page.getByRole("contentinfo");
    const links = await footer
      .locator("a")
      .evaluateAll((anchors) =>
        anchors.map((a) => [a.getAttribute("href"), a.textContent]),
      );
    expect(links).toEqual(
      INFO_PAGES.map((p) => [
        infoPagePath(locale, p),
        infoTexts[locale][p].link,
      ]),
    );
    await expect(footer.getByRole("navigation")).toHaveCount(2);
  });
}

test("robots.txt disallows the information pages and the sitemap leaves them out", async ({
  request,
}) => {
  const { rules } = parseRobots(
    await (await request.get("/robots.txt")).text(),
  );
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const page of INFO_PAGES)
    for (const path of Object.values(infoPagePaths(page))) {
      expect(isAllowed(rules, path), path).toBe(false);
      expect(sitemap, path).not.toContain(`${path}<`);
    }
});
