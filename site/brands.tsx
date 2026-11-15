// Brand pages (issue #147): the brand index at /<lang>/<brand word>, and each
// brand's listing at /<lang>/<brand word>/<brand slug>, 48 products per page
// in reference order, then /<n>. Built like the category pages
// (site/category-page.tsx) from cached reads in the manner of
// docs/adr/0008-caching-and-partial-refresh.md: every entry is shared by the
// ten languages, and the page, which is not cached, picks its own.

import config from "@payload-config";
import { sql } from "@payloadcms/db-postgres";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound, permanentRedirect } from "next/navigation";
import { getPayload } from "payload";
import type { Locale } from "../cms/locales.ts";
import {
  BRAND_WORDS,
  brandIndexPath,
  brandPath,
  categoryPageCount,
  languageAlternates,
  PRODUCTS_PER_CATEGORY_PAGE,
  perLocale,
} from "./addresses.ts";
import { Breadcrumbs, type Crumb } from "./breadcrumbs.tsx";
import { type CategoryRows, database, readCards } from "./categories.tsx";
import { ProductListing, pageLabel } from "./category-page.tsx";
import { fill, getDictionary } from "./dictionary.ts";
import { SiteFrame } from "./frame.tsx";
import { computedAt } from "./product.tsx";
import {
  BRANDS_TAG,
  brandListingTag,
  brandPageTags,
  brandTag,
  CATALOG_TAG,
} from "./tags.ts";

/** A brand, whose name needs no translation (ADR 0007). */
export type Brand = { id: number; name: string; slug: string };

/**
 * Every brand, sorted by name. One entry, refreshed when a brand is saved,
 * created or deleted.
 */
export async function getBrands(): Promise<Brand[]> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(BRANDS_TAG, CATALOG_TAG);

  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "brands",
    depth: 0,
    sort: "name",
    pagination: false,
  });
  cacheTag(...docs.map((doc) => brandTag(doc.id)));
  return docs.map((doc) => ({ id: doc.id, name: doc.name, slug: doc.slug }));
}

/**
 * The number of products of each brand, by brand id. One entry, tagged with
 * every brand's listing, which a product joining or leaving a brand
 * refreshes, and with the list of brands, so a brand with no product yet
 * still counts.
 */
export async function getBrandCounts(): Promise<Record<number, number>> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(BRANDS_TAG, CATALOG_TAG);

  const drizzle = await database();
  const { rows } = await drizzle.execute<{ brand_id: number; count: string }>(
    sql`
    SELECT b.id AS brand_id, count(p.id) AS count
      FROM brands b
      LEFT JOIN products p ON p.brand_id = b.id
     GROUP BY b.id
  `,
  );
  cacheTag(...rows.map((row) => brandListingTag(row.brand_id)));
  return Object.fromEntries(
    rows.map((row) => [row.brand_id, Number(row.count)]),
  );
}

/**
 * Page `page` of a brand's products, 48 of them in reference order, read from
 * the index on (brand, reference). A brand holds a few thousand products, so
 * the OFFSET skips at most that many index entries. Tagged with the listing,
 * the brand, the catalog, and each shown product's price and category.
 */
export async function getBrandRows(
  brandId: number,
  page: number,
): Promise<CategoryRows> {
  "use cache: remote";
  cacheLife("max");

  const drizzle = await database();
  const { rows } = await drizzle.execute<{ id: number }>(sql`
    SELECT id FROM products
     WHERE brand_id = ${brandId}
     ORDER BY reference
     LIMIT ${PRODUCTS_PER_CATEGORY_PAGE}
    OFFSET ${(page - 1) * PRODUCTS_PER_CATEGORY_PAGE}
  `);
  const cards = await readCards(rows.map((row) => row.id));
  cacheTag(
    ...brandPageTags(
      brandId,
      cards.rows.map((row) => row.route.id),
      cards.categoryIds,
    ),
  );
  return { rows: cards.rows, computedAt: computedAt() };
}

/** The brand index in each language. */
export const brandIndexPaths = () => perLocale(brandIndexPath);

/** A brand listing page's address in each language. */
export const brandPaths = (brand: Brand, page: number) =>
  perLocale((locale) => brandPath(locale, brand.slug, page));

/**
 * The brand page an address names: `page` is 1 for /<lang>/<word>/<slug>, or
 * the number read from /<n>, and `path` is the address as requested. A page
 * past the last is a 404, checked before any page of rows is read; another
 * language's brand word, another letter case or /1 redirects.
 */
export async function resolveBrand(
  locale: Locale,
  entry: string,
  page: number,
  path: string,
) {
  const slug = entry.toLowerCase();
  const brand = (await getBrands()).find((b) => b.slug === slug);
  if (!brand) notFound();
  const counts = await getBrandCounts();
  const products = counts[brand.id] ?? 0;
  const pages = categoryPageCount(products);
  if (page > pages) notFound();
  const canonical = brandPath(locale, brand.slug, page);
  if (canonical !== path) permanentRedirect(canonical);
  return { brand, page, pages, products };
}

/** The brand index, after redirecting another language's word or letter case. */
function resolveIndex(locale: Locale, section: string) {
  if (section !== BRAND_WORDS[locale])
    permanentRedirect(brandIndexPath(locale));
}

const indexCrumb = (locale: Locale): Crumb => ({
  name: getDictionary(locale).brands,
  path: brandIndexPath(locale),
});

export function brandIndexMetadata(locale: Locale, section: string): Metadata {
  resolveIndex(locale, section);
  const paths = brandIndexPaths();
  return {
    title: `${getDictionary(locale).brands} | Sekoya Parts`,
    alternates: {
      canonical: paths[locale],
      languages: languageAlternates(paths, paths.fr),
    },
  };
}

/** The brand index: every brand with its number of products. */
export async function BrandIndexPage({
  locale,
  section,
}: {
  locale: Locale;
  section: string;
}) {
  resolveIndex(locale, section);
  const dictionary = getDictionary(locale);
  const [brands, counts] = await Promise.all([getBrands(), getBrandCounts()]);
  const format = new Intl.NumberFormat(locale);
  return (
    <SiteFrame locale={locale} paths={brandIndexPaths()}>
      <Breadcrumbs locale={locale} crumbs={[indexCrumb(locale)]} />
      <h1 className="text-3xl font-bold">{dictionary.brands}</h1>
      {/* The first screen's largest element, painted with the HTML (#87). */}
      <p data-intro className="mt-4 max-w-prose text-lg">
        {fill(dictionary.brandsIntro, { count: format.format(brands.length) })}
      </p>
      <ul data-list="brands" className="brand-list mt-6">
        {brands.map((brand) => (
          <li key={brand.id}>
            <a href={brandPath(locale, brand.slug)}>{brand.name}</a>{" "}
            <span>
              {fill(dictionary.productCount, {
                count: format.format(counts[brand.id] ?? 0),
              })}
            </span>
          </li>
        ))}
      </ul>
    </SiteFrame>
  );
}

const brandTitle = (locale: Locale, brand: Brand) =>
  fill(getDictionary(locale).brandHeading, { brand: brand.name });

export async function brandMetadata(
  locale: Locale,
  entry: string,
  page: number,
  path: string,
): Promise<Metadata> {
  const { brand, pages } = await resolveBrand(locale, entry, page, path);
  const paths = brandPaths(brand, page);
  const name = brandTitle(locale, brand);
  return {
    title:
      page === 1
        ? `${name} | Sekoya Parts`
        : `${name} (${pageLabel(locale, page, pages)}) | Sekoya Parts`,
    alternates: {
      canonical: paths[locale],
      languages: languageAlternates(paths, paths.fr),
    },
  };
}

/** One page of a brand's listing. */
export async function BrandPage({
  locale,
  entry,
  page,
  path,
}: {
  locale: Locale;
  entry: string;
  page: number;
  path: string;
}) {
  const { brand, pages, products } = await resolveBrand(
    locale,
    entry,
    page,
    path,
  );
  const dictionary = getDictionary(locale);
  const { rows, computedAt } = await getBrandRows(brand.id, page);
  return (
    <SiteFrame locale={locale} paths={brandPaths(brand, page)}>
      <Breadcrumbs
        locale={locale}
        crumbs={[
          indexCrumb(locale),
          { name: brand.name, path: brandPath(locale, brand.slug) },
          ...(page > 1
            ? [
                {
                  name: pageLabel(locale, page, pages),
                  path: brandPath(locale, brand.slug, page),
                },
              ]
            : []),
        ]}
      />
      <h1 className="text-3xl font-bold">{brandTitle(locale, brand)}</h1>
      {pages > 1 && (
        <p className="mt-1 text-slate">{pageLabel(locale, page, pages)}</p>
      )}
      <p data-intro className="mt-4 max-w-prose text-lg">
        {fill(dictionary.brandIntro, {
          brand: brand.name,
          count: new Intl.NumberFormat(locale).format(products),
        })}
      </p>
      <ProductListing
        locale={locale}
        rows={rows}
        computedAt={computedAt}
        page={page}
        pages={pages}
        pathOf={(n) => brandPath(locale, brand.slug, n)}
      />
    </SiteFrame>
  );
}
