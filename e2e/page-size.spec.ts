// The 2 MB test (docs/adr/0004-testing-and-ci.md, issues #60, #73 and #79):
// Googlebot reads only the first 2 MB of a page, counted uncompressed, so the
// heaviest product page and a full reference page must stay below
// 2,000,000 bytes in every language. Their size is mostly their reference
// list: PRODUCT_PAGE_REFERENCES on the product page, REFERENCES_PER_PAGE on a
// reference page. Product 1 is compatible with every model, so both of its
// lists are full.
import { type APIRequestContext, expect, test } from "@playwright/test";
import { MILLION_PRODUCT_ID } from "../catalog/generator.ts";
import { type Locale, locales } from "../cms/locales.ts";
import { MODEL_WORDS, REFERENCES_PER_PAGE } from "../site/addresses.ts";
import { PRODUCT_PAGE_REFERENCES } from "../site/references.ts";
import { productAddress } from "./addresses.ts";

const LIMIT_BYTES = 2_000_000;

/** Fetches a page, checks it holds `references` model links, and measures it. */
async function measure(
  request: APIRequestContext,
  locale: Locale,
  address: string,
  references: number,
) {
  const response = await request.get(address, { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  // Playwright decodes a compressed body; the doctype proves this is the
  // HTML itself, so its length is the uncompressed size.
  const html = await response.body();
  expect(html.subarray(0, 15).toString("latin1").toLowerCase()).toBe(
    "<!doctype html>",
  );

  // The page measured is the one with the full reference list.
  const modelLink = new RegExp(
    `<a href="/${locale}/${MODEL_WORDS[locale]}/[a-z0-9-]+">`,
    "g",
  );
  expect(html.toString("utf8").match(modelLink) ?? []).toHaveLength(references);

  console.log(`${address}: ${html.length} bytes`);
  expect(html.length).toBeLessThan(LIMIT_BYTES);
}

for (const locale of locales) {
  test(`the heaviest product page stays under 2 MB uncompressed in ${locale}`, async ({
    request,
  }) => {
    const address = await productAddress(request, locale, MILLION_PRODUCT_ID);
    await measure(request, locale, address, PRODUCT_PAGE_REFERENCES);
  });

  // Every reference page of product 1 holds a full list of 500 and differs
  // from the others only by its model names and page numbers, so one full
  // page, the last, stands for them: at about 220 bytes a reference, it sits
  // far below the limit (ADR 0009).
  test(`a full reference page stays under 2 MB uncompressed in ${locale}`, async ({
    request,
  }) => {
    const address = await productAddress(request, locale, MILLION_PRODUCT_ID);
    await measure(request, locale, `${address}/2000`, REFERENCES_PER_PAGE);
  });
}
