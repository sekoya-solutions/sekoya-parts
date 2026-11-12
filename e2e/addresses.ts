// Finds a product's address through its lookup address, /<lang>/p/<reference>,
// which the site redirects permanently to the address in that language
// (issue #73). The words depend on the catalog, so the tests never write them.
import { type APIRequestContext, expect } from "@playwright/test";
import { productReference } from "../catalog/generator.ts";
import type { Locale } from "../cms/locales.ts";

export const lookupPath = (locale: Locale, productId: number) =>
  `/${locale}/p/${productReference(productId).toLowerCase()}`;

/** The path a redirect points to, read from its Location header. */
export const locationPath = (location: string | undefined) =>
  new URL(location ?? "", "http://site.test").pathname;

export async function productAddress(
  request: APIRequestContext,
  locale: Locale,
  productId: number,
): Promise<string> {
  const response = await request.get(lookupPath(locale, productId), {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(308);
  const { location } = response.headers();
  expect(location).toBeTruthy();
  return locationPath(location);
}
