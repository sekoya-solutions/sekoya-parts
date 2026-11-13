// Finds the page an address names, by its stable key
// (docs/adr/0011-languages-and-seo.md): a product by its reference, a model
// by its brand slug and reference, a category by its slug. Anything else in
// the address, such as old words, another language's section word or another
// letter case, redirects permanently to the page's address; an unknown key is
// a 404.
import { notFound, permanentRedirect } from "next/navigation";
import { MILLION_PRODUCT_ID, productReference } from "../catalog/generator.ts";
import type { Locale } from "../cms/locales.ts";
import {
  categoryPageCount,
  categoryPath,
  findCategory,
  isLocale,
  parseModelSegment,
  parseProductSegment,
} from "./addresses.ts";
import { getCategories, getCategoryCounts } from "./categories.tsx";
import { getModelRoute } from "./models.tsx";
import { getProductRoute, readProductRoute } from "./product.tsx";

/** The language of an address, or a 404. */
export function localeOf(lang: string): Locale {
  if (!isLocale(lang)) notFound();
  return lang;
}

/**
 * The product an address names. `suffix` is what follows the product's
 * address, such as "/2" on a reference page, kept in the redirect.
 */
export async function resolveProduct(
  lang: Locale,
  section: string,
  entry: string,
  suffix = "",
) {
  const reference = parseProductSegment(entry);
  if (reference === null) notFound();
  const route = await getProductRoute(reference);
  if (!route) notFound();
  const path = route.paths[lang];
  if (path !== `/${lang}/${section}/${entry}`)
    permanentRedirect(`${path}${suffix}`);
  return route;
}

/** The model an address names. */
export async function resolveModel(
  lang: Locale,
  section: string,
  entry: string,
) {
  const key = parseModelSegment(entry);
  if (key === null) notFound();
  const route = await getModelRoute(key);
  if (!route) notFound();
  const path = route.paths[lang];
  if (path !== `/${lang}/${section}/${entry}`) permanentRedirect(path);
  return route;
}

/**
 * The category page an address names: `page` is 1 for /<lang>/<section>, or
 * the number read from /<lang>/<section>/<n>, and `path` is the address as
 * requested. A page past the last is a 404, checked before any page of rows
 * is read; another language's slug, another letter case or /1 redirects.
 */
export async function resolveCategory(
  lang: Locale,
  section: string,
  page: number,
  path: string,
) {
  const category = findCategory(await getCategories(), lang, section);
  if (!category) notFound();
  const counts = await getCategoryCounts();
  const pages = categoryPageCount(counts[category.id] ?? 0);
  if (page > pages) notFound();
  const canonical = categoryPath(lang, category.slugs[lang], page);
  if (canonical !== path) permanentRedirect(canonical);
  return { category, page, pages };
}

/**
 * The section and entry of the product with a million models in one
 * language, for the pages built in advance. The build fails if the catalog
 * is not loaded.
 */
export async function millionProductParams(lang: string) {
  const reference = productReference(MILLION_PRODUCT_ID);
  const found = await readProductRoute(reference);
  if (!found || !isLocale(lang))
    throw new Error(
      `Product ${reference} is missing in ${lang}: load the catalog before building.`,
    );
  const [, , section, entry] = found.route.paths[lang].split("/") as [
    string,
    string,
    string,
    string,
  ];
  return { section, entry };
}
