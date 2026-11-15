// Finds the page an address names, by its stable key
// (docs/adr/0011-languages-and-seo.md): a product by its reference, a model
// by its brand slug and reference, a category by its slug. Anything else in
// the address, such as old words, another language's section word or another
// letter case, redirects permanently to the page's address; an unknown key is
// a 404.
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { MILLION_PRODUCT_ID, productReference } from "../catalog/generator.ts";
import type { Locale } from "../cms/locales.ts";
import {
  categoryPageCount,
  categoryPath,
  categoryViewPath,
  findCategory,
  isLocale,
  isPlainView,
  isReservedWord,
  type ListingView,
  parseModelSegment,
  parseProductSegment,
} from "./addresses.ts";
import { getBrands } from "./brands.tsx";
import {
  getCategories,
  getCategoryBrandCounts,
  getCategoryCounts,
} from "./categories.tsx";
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
 * The sorted or filtered category page the internal route names (issue #148),
 * reached through a query rewrite, so the address the visitor sees is the
 * category's with its query:
 * - another language's slug or letter case, or the plain view, redirects
 *   permanently, like a plain category page;
 * - a query on a section that is not a category, such as the search page,
 *   redirects to that page without it, and on an unknown section is a 404;
 * - a brand that is unknown or has no product in the category redirects to
 *   the same view without it, temporarily, since a product may join later;
 * - a page past the last is a 404.
 */
export async function resolveCategoryView(
  lang: Locale,
  section: string,
  page: number,
  view: ListingView,
) {
  const category = findCategory(await getCategories(), lang, section);
  if (!category) {
    if (isReservedWord(section))
      redirect(
        page === 1 ? `/${lang}/${section}` : `/${lang}/${section}/${page}`,
      );
    notFound();
  }
  const slug = category.slugs[lang];
  if (isPlainView(view)) permanentRedirect(categoryPath(lang, slug, page));
  const brand =
    view.brand === null
      ? null
      : ((await getBrands()).find((b) => b.slug === view.brand) ?? null);
  const brandCounts = await getCategoryBrandCounts(category.id);
  if (view.brand !== null && (!brand || !brandCounts[brand.id]))
    redirect(categoryViewPath(lang, slug, 1, { ...view, brand: null }));
  const count = brand
    ? (brandCounts[brand.id] ?? 0)
    : ((await getCategoryCounts())[category.id] ?? 0);
  const pages = categoryPageCount(count);
  if (page > pages) notFound();
  if (slug !== section)
    permanentRedirect(categoryViewPath(lang, slug, page, view));
  return { category, page, pages, brand, count, view };
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
