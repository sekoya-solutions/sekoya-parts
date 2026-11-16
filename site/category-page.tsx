// The category page (issue #81): 48 products per page in reference order,
// or sorted by price or filtered by brand (issue #148),
// page 1 at /<lang>/<category slug> and page n at /<lang>/<category slug>/<n>,
// with links to the previous and next pages. Each page is its own canonical
// address, the first included, and links to the same page in the other
// languages. Not cached itself: it renders the shared entries of
// site/categories.tsx in its language.

import type { Metadata } from "next";
import type { Locale } from "../cms/locales.ts";
import {
  categoryPath,
  categoryViewPath,
  isPlainView,
  LISTING_SORTS,
  type ListingSort,
  type ListingView,
  languageAlternates,
  PLAIN_VIEW,
  perLocale,
} from "./addresses.ts";
import { type Brand, getBrands } from "./brands.tsx";
import { Breadcrumbs } from "./breadcrumbs.tsx";
import {
  type CategoryRow,
  categoryPaths,
  getCategoryBrandCounts,
  getCategoryCounts,
  getCategoryRows,
} from "./categories.tsx";
import { fill, getDictionary } from "./dictionary.ts";
import { SiteFrame } from "./frame.tsx";
import { ProductCard } from "./product-card.tsx";
import { resolveCategory, resolveCategoryView } from "./resolve.ts";

/** The address a category route was requested at. */
export const requestedPath = (lang: string, section: string, page?: string) =>
  page === undefined ? `/${lang}/${section}` : `/${lang}/${section}/${page}`;

export function pageLabel(locale: Locale, page: number, pages: number) {
  const format = new Intl.NumberFormat(locale);
  return fill(getDictionary(locale).pageOf, {
    page: format.format(page),
    pages: format.format(pages),
  });
}

/** What a category route resolved to, in its view. */
async function resolve(
  locale: Locale,
  section: string,
  page: number,
  path: string,
  view: ListingView | undefined,
) {
  if (view) return resolveCategoryView(locale, section, page, view);
  const resolved = await resolveCategory(locale, section, page, path);
  const counts = await getCategoryCounts();
  return {
    ...resolved,
    brand: null,
    count: counts[resolved.category.id] ?? 0,
    view: PLAIN_VIEW,
  };
}

export async function categoryMetadata(
  locale: Locale,
  section: string,
  page: number,
  path: string,
  view?: ListingView,
): Promise<Metadata> {
  const resolved = await resolve(locale, section, page, path, view);
  const { category, pages } = resolved;
  const paths = categoryPaths(category, page);
  const name = resolved.brand
    ? `${category.names[locale]} ${resolved.brand.name}`
    : category.names[locale];
  const title =
    page === 1
      ? `${name} | Sekoya Parts`
      : `${name} (${pageLabel(locale, page, pages)}) | Sekoya Parts`;
  // A sorted or filtered page stays out of search engines' indexes, with no
  // canonical address or hreflang, like the search page (issue #148).
  if (!isPlainView(resolved.view)) return { title, robots: { index: false } };
  return {
    title,
    alternates: {
      canonical: paths[locale],
      languages: languageAlternates(paths, paths.fr),
    },
  };
}

export async function CategoryPage({
  locale,
  section,
  page,
  path,
  view: requested,
}: {
  locale: Locale;
  section: string;
  page: number;
  path: string;
  /** The internal route's view (issue #148); absent on a plain address. */
  view?: ListingView;
}) {
  const { category, pages, brand, count, view } = await resolve(
    locale,
    section,
    page,
    path,
    requested,
  );
  const dictionary = getDictionary(locale);
  const slug = category.slugs[locale];
  const plain = isPlainView(view);
  const [{ rows, computedAt }, brandCounts, brands] = await Promise.all([
    getCategoryRows(category.id, page, view.sort, brand?.id ?? null),
    getCategoryBrandCounts(category.id),
    getBrands(),
  ]);
  const format = new Intl.NumberFormat(locale);

  return (
    <SiteFrame
      locale={locale}
      template="category"
      paths={perLocale((l) =>
        categoryViewPath(l, category.slugs[l], page, view),
      )}
    >
      <Breadcrumbs
        locale={locale}
        crumbs={[
          { name: category.names[locale], path: categoryPath(locale, slug) },
          ...(page > 1
            ? [
                {
                  name: pageLabel(locale, page, pages),
                  path: categoryViewPath(locale, slug, page, view),
                },
              ]
            : []),
        ]}
      />
      <h1 className="text-3xl font-bold">{category.names[locale]}</h1>
      {pages > 1 && (
        <p className="mt-1 text-slate">{pageLabel(locale, page, pages)}</p>
      )}
      {/* The first screen's largest element, painted with the HTML rather
          than after the card images (issue #87); e2e/intro.spec.ts checks it. */}
      <p data-intro className="mt-4 max-w-prose text-lg">
        {plain
          ? fill(dictionary.categoryIntro, {
              category: category.names[locale],
              count: format.format(count),
            })
          : fill(dictionary.categoryViewIntro, {
              category: category.names[locale],
              count: format.format(count),
            })}
      </p>
      <ListingControls
        locale={locale}
        action={categoryPath(locale, slug)}
        view={view}
        brands={brands
          .filter((b) => (brandCounts[b.id] ?? 0) > 0)
          .map((b) => ({ ...b, count: brandCounts[b.id] ?? 0 }))}
      />
      <ProductListing
        locale={locale}
        rows={rows}
        computedAt={computedAt}
        page={page}
        pages={pages}
        pathOf={(n) => categoryViewPath(locale, slug, n, view)}
      />
    </SiteFrame>
  );
}

/**
 * The sort and brand controls (issue #148): one GET form to the category's
 * first page, so a new choice starts on page 1, with no browser code. The
 * query rewrites of next.config.ts serve its address.
 */
export function ListingControls({
  locale,
  action,
  view,
  brands,
}: {
  locale: Locale;
  action: string;
  view: ListingView;
  brands: (Brand & { count: number })[];
}) {
  const dictionary = getDictionary(locale);
  const format = new Intl.NumberFormat(locale);
  const sortLabels: Record<ListingSort, string> = {
    reference: dictionary.sortReference,
    "price-asc": dictionary.sortPriceAsc,
    "price-desc": dictionary.sortPriceDesc,
  };
  return (
    <form
      method="get"
      action={action}
      data-listing-controls
      className="listing-controls mt-6"
    >
      <label>
        <span>{dictionary.sortLabel}</span>
        <select name="sort" defaultValue={view.sort}>
          {LISTING_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {sortLabels[sort]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{dictionary.brandFilter}</span>
        <select name="brand" defaultValue={view.brand ?? ""}>
          <option value="">{dictionary.allBrands}</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.slug}>
              {`${brand.name} (${format.format(brand.count)})`}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">{dictionary.applyFilters}</button>
    </form>
  );
}

/**
 * A listing page's product cards and its previous and next links, shared by
 * the category and brand pages (issue #147). `pathOf` gives page n's address.
 */
export function ProductListing({
  locale,
  rows,
  computedAt,
  page,
  pages,
  pathOf,
}: {
  locale: Locale;
  rows: CategoryRow[];
  computedAt: string;
  page: number;
  pages: number;
  pathOf: (page: number) => string;
}) {
  const dictionary = getDictionary(locale);
  return (
    <>
      <ul data-computed-at={computedAt} className="product-list mt-6">
        {rows.map(({ route, price }, index) => (
          <ProductCard
            key={route.id}
            route={route}
            price={price}
            locale={locale}
            index={index}
          />
        ))}
      </ul>
      {pages > 1 && (
        <nav className="pager">
          {page > 1 && (
            <a href={pathOf(page - 1)} rel="prev">
              {dictionary.previousPage}
            </a>
          )}{" "}
          {page < pages && (
            <a href={pathOf(page + 1)} rel="next">
              {dictionary.nextPage}
            </a>
          )}
        </nav>
      )}
    </>
  );
}
