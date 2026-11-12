// The 2 MB test (docs/adr/0004-testing-and-ci.md, issue #60): Googlebot reads
// only the first 2 MB of a page, counted uncompressed, so the heaviest product
// page must stay below 2,000,000 bytes. The page's size is mostly its
// reference list, capped at PRODUCT_PAGE_REFERENCES; product 1 is compatible
// with every model, so it renders the full list. Only French exists until the
// phase 3 languages, which this test then covers one by one.
import { expect, test } from "@playwright/test";
import { MILLION_PRODUCT_ID } from "../catalog/generator.ts";
import { PRODUCT_PAGE_REFERENCES } from "../site/references.ts";

const LIMIT_BYTES = 2_000_000;

test("the heaviest product page stays under 2 MB uncompressed", async ({
  request,
}) => {
  const response = await request.get(`/product/${MILLION_PRODUCT_ID}`);
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

  console.log(`/product/${MILLION_PRODUCT_ID}: ${html.length} bytes`);
  expect(html.length).toBeLessThan(LIMIT_BYTES);
});
