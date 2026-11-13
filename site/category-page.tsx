// The category page (issue #81): 48 products per page in reference order,
// page 1 at /<lang>/<category slug> and page n at /<lang>/<category slug>/<n>,
// with links to the previous and next pages. Each page is its own canonical
// address, the first included, and links to the same page in the other
// languages. Not cached itself: it renders the shared entries of
// site/categories.tsx in its language.
import type { Metadata } from "next";
import type { Locale } from "../cms/locales.ts";
import { categoryPath, languageAlternates } from "./addresses.ts";
import { categoryPaths, getCategoryRows } from "./categories.tsx";
import { fill, getDictionary } from "./dictionary.ts";
import { SiteFrame } from "./frame.tsx";
import { formatPrice } from "./product.tsx";
import { resolveCategory } from "./resolve.ts";

/** The address a category route was requested at. */
export const requestedPath = (lang: string, section: string, page?: string) =>
  page === undefined ? `/${lang}/${section}` : `/${lang}/${section}/${page}`;

function pageLabel(locale: Locale, page: number, pages: number) {
  const format = new Intl.NumberFormat(locale);
  return fill(getDictionary(locale).pageOf, {
    page: format.format(page),
    pages: format.format(pages),
  });
}

export async function categoryMetadata(
  locale: Locale,
  section: string,
  page: number,
  path: string,
): Promise<Metadata> {
  const { category, pages } = await resolveCategory(
    locale,
    section,
    page,
    path,
  );
  const paths = categoryPaths(category, page);
  const name = category.names[locale];
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

export async function CategoryPage({
  locale,
  section,
  page,
  path,
}: {
  locale: Locale;
  section: string;
  page: number;
  path: string;
}) {
  const { category, pages } = await resolveCategory(
    locale,
    section,
    page,
    path,
  );
  const dictionary = getDictionary(locale);
  const slug = category.slugs[locale];
  const { rows, computedAt } = await getCategoryRows(category.id, page);

  return (
    <SiteFrame locale={locale} paths={categoryPaths(category, page)}>
      <h1 className="text-3xl font-bold">{category.names[locale]}</h1>
      {pages > 1 && (
        <p className="mt-1 text-slate">{pageLabel(locale, page, pages)}</p>
      )}
      <ul data-computed-at={computedAt} className="product-list mt-6">
        {rows.map(({ route, priceCents }) => (
          <li key={route.id}>
            <a href={route.paths[locale]}>{route.names[locale]}</a>{" "}
            <span>{formatPrice(priceCents, locale)}</span>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <nav className="pager">
          {page > 1 && (
            <a href={categoryPath(locale, slug, page - 1)} rel="prev">
              {dictionary.previousPage}
            </a>
          )}{" "}
          {page < pages && (
            <a href={categoryPath(locale, slug, page + 1)} rel="next">
              {dictionary.nextPage}
            </a>
          )}
        </nav>
      )}
    </SiteFrame>
  );
}
