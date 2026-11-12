// Finds a product's address through its lookup address, /<lang>/p/<reference>,
// which the site redirects permanently to the address in that language
// (issue #73). The words depend on the catalog, so the tests never write them.
import {
  type APIRequestContext,
  type APIResponse,
  expect,
} from "@playwright/test";
import { productReference } from "../catalog/generator.ts";
import type { Locale } from "../cms/locales.ts";

export const lookupPath = (locale: Locale, productId: number) =>
  `/${locale}/p/${productReference(productId).toLowerCase()}`;

/**
 * The path a redirect points to. Under `next start`, Next.js 16.4.6 sends the
 * Location header twice on a redirect it has not cached yet: the render sets
 * it on the response, then the response cache appends the headers it saved
 * from that render (next/dist/build/templates/app-page-runtime.js). Vercel
 * sends one. So the header may repeat, but every value must be the same
 * address.
 */
export function locationPath(response: APIResponse): string {
  const values = response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === "location")
    .map(({ value }) => value);
  expect(values.length).toBeGreaterThan(0);
  expect(new Set(values).size).toBe(1);
  return new URL(values[0] as string, "http://site.test").pathname;
}

export async function productAddress(
  request: APIRequestContext,
  locale: Locale,
  productId: number,
): Promise<string> {
  const response = await request.get(lookupPath(locale, productId), {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(308);
  return locationPath(response);
}
