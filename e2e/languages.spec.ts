// The bare domain, the language home pages and the routes outside the site
// (issue #73, docs/adr/0011-languages-and-seo.md). The bare domain redirects
// to a home page by the language picked in the switch, else the browser's,
// else French (issue #191).
import { type APIRequestContext, expect, test } from "@playwright/test";
import { locales } from "../cms/locales.ts";

/** The bare domain's answer to a request with these headers, unfollowed. */
const bareDomain = (
  request: APIRequestContext,
  headers: Record<string, string>,
) => request.get("/", { maxRedirects: 0, headers });

for (const [label, headers, expected] of [
  ["a British English browser", { "accept-language": "en-GB,en;q=0.9" }, "/en"],
  ["a Brazilian Portuguese browser", { "accept-language": "pt-BR" }, "/pt"],
  [
    "the highest quality first",
    { "accept-language": "ja, it;q=0.5, de;q=0.8" },
    "/de",
  ],
  [
    "a language the site lacks, to French",
    { "accept-language": "ja-JP" },
    "/fr",
  ],
  [
    "no Accept-Language, as most crawlers, to French",
    { "accept-language": "" },
    "/fr",
  ],
  [
    "the switch's cookie over the browser",
    { "accept-language": "en-US", cookie: "lang_v1=pl" },
    "/pl",
  ],
  [
    "an unknown cookie, to the browser's language",
    { "accept-language": "sv-SE", cookie: "lang_v1=xx" },
    "/sv",
  ],
] as const)
  test(`the bare domain redirects ${label}`, async ({ request }) => {
    const response = await bareDomain(request, headers);
    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location as string).pathname).toBe(
      expected,
    );
    // Never cached for another visitor.
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  });

test("the home pages name the bare domain as their x-default", async ({
  page,
}) => {
  await page.goto("/fr");
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
