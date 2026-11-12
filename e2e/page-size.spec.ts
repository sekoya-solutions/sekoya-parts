// The 2 MB test (docs/adr/0004-testing-and-ci.md, issues #60 and #73):
// Googlebot reads only the first 2 MB of a page, counted uncompressed, so the
// heaviest product page must stay below 2,000,000 bytes in every language.
// The page's size is mostly its reference list, capped at
// PRODUCT_PAGE_REFERENCES; product 1 is compatible with every model, so it
// renders the full list.
import { expect, test } from "@playwright/test";
import { MILLION_PRODUCT_ID } from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import { PRODUCT_PAGE_REFERENCES } from "../site/references.ts";
import { productAddress } from "./addresses.ts";

const LIMIT_BYTES = 2_000_000;

for (const locale of locales) {
  test(`the heaviest product page stays under 2 MB uncompressed in ${locale}`, async ({
    request,
  }) => {
    const address = await productAddress(request, locale, MILLION_PRODUCT_ID);
    const response = await request.get(address, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    // Playwright decodes a compressed body; the doctype proves this is the
    // HTML itself, so its length is the uncompressed size.
    const html = await response.body();
    expect(html.subarray(0, 15).toString("latin1").toLowerCase()).toBe(
      "<!doctype html>",
    );

    // The page measured is the one with the full reference list.
    const links = html.toString("utf8").match(/<a href="\/model\/\d+">/g) ?? [];
    expect(links).toHaveLength(PRODUCT_PAGE_REFERENCES);

    console.log(`${address}: ${html.length} bytes`);
    expect(html.length).toBeLessThan(LIMIT_BYTES);
  });
}
