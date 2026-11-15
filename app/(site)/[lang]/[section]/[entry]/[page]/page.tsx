// A numbered reference page, at the product's address followed by /<n>
// (docs/adr/0009-compatible-references.md, docs/adr/0011-languages-and-seo.md):
// 500 references, read by rank range, with links to the previous and next
// pages and to the product. Only a product with more references than its own
// page shows has these pages. Each page is its own canonical address; none
// points to the first page.
// A brand listing's pages after the first, /<lang>/<brand word>/<brand
// slug>/<n> (issue #147), share the address shape: the section tells them
// apart, since Payload refuses a category slug equal to a brand word.
// Sorted and filtered category pages (issue #148) are served here too, at
// /<lang>/<category slug>/~<sort>~<brand>/<n>: visitors never see that
// address, which the query rewrites of next.config.ts lead to from
// /<lang>/<category slug>[/<n>]?sort=…&brand=…. The page reads only its
// path, so each combination renders once and is cached.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "../../../../../../cms/locales.ts";
import {
  categoryPath,
  isBrandWord,
  isModelWord,
  isViewEntry,
  languageAlternates,
  parsePageNumber,
  parseViewEntry,
  perLocale,
  referencePageCount,
  referencePagePath,
  referencePageRanks,
} from "../../../../../../site/addresses.ts";
import { BrandPage, brandMetadata } from "../../../../../../site/brands.tsx";
import { Breadcrumbs } from "../../../../../../site/breadcrumbs.tsx";
import { getCategories } from "../../../../../../site/categories.tsx";
import {
  CategoryPage,
  categoryMetadata,
  requestedPath,
} from "../../../../../../site/category-page.tsx";
import { fill, getDictionary } from "../../../../../../site/dictionary.ts";
import { SiteFrame } from "../../../../../../site/frame.tsx";
import {
  getReferenceRows,
  getReferenceTotal,
  ReferenceList,
} from "../../../../../../site/models.tsx";
import { PRODUCT_PAGE_REFERENCES } from "../../../../../../site/references.ts";
import {
  localeOf,
  millionProductParams,
  resolveProduct,
} from "../../../../../../site/resolve.ts";

// Built in advance in each language: the first reference page of the product
// with a million models. The others render on their first visit.
export async function generateStaticParams({
  params,
}: {
  params: { lang: string };
}) {
  return [{ ...(await millionProductParams(params.lang)), page: "1" }];
}

type Props = PageProps<"/[lang]/[section]/[entry]/[page]">;

/** The product, the page number and its references; otherwise a 404 or a redirect. */
async function resolve(params: Props["params"]) {
  const { lang, section, entry, page } = await params;
  const locale = localeOf(lang);
  // Models have no numbered pages.
  if (isModelWord(section)) notFound();
  const number = parsePageNumber(page);
  if (number === null) notFound();
  const route = await resolveProduct(locale, section, entry, `/${number}`);
  // The number of pages first, so a number past the end reads no range.
  const total = await getReferenceTotal(route.id);
  const pages = referencePageCount(total);
  if (total <= PRODUCT_PAGE_REFERENCES || number > pages) notFound();
  const { first, last } = referencePageRanks(number);
  const references = await getReferenceRows(route.id, first, last);
  return { locale, route, number, pages, references };
}

/** A sorted or filtered category page's view and number, or a 404. */
function viewOf(entry: string, page: string) {
  const view = parseViewEntry(entry);
  const number = parsePageNumber(page);
  if (view === null || number === null) notFound();
  return { view, number };
}

/** A brand page's number, or a 404 for anything but a page number. */
function brandPageNumber(page: string): number {
  const number = parsePageNumber(page);
  if (number === null) notFound();
  return number;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, section, entry, page } = await params;
  if (isViewEntry(entry)) {
    const { view, number } = viewOf(entry, page);
    return categoryMetadata(
      localeOf(lang),
      section,
      number,
      requestedPath(lang, section),
      view,
    );
  }
  if (isBrandWord(section))
    return brandMetadata(
      localeOf(lang),
      entry,
      brandPageNumber(page),
      `/${lang}/${section}/${entry}/${page}`,
    );
  const { locale, route, number, pages } = await resolve(params);
  const dictionary = getDictionary(locale);
  const format = new Intl.NumberFormat(locale);
  const paths = perLocale((l: Locale) =>
    referencePagePath(route.paths[l], number),
  );
  return {
    title: `${fill(dictionary.referencePageHeading, {
      product: route.names[locale],
    })} (${fill(dictionary.pageOf, {
      page: format.format(number),
      pages: format.format(pages),
    })}) | Sekoya Parts`,
    alternates: {
      canonical: paths[locale],
      languages: languageAlternates(paths, paths.fr),
    },
  };
}

// params is read outside any Suspense boundary, as on the product page.
export default async function ReferencePage({ params }: Props) {
  const { lang, section, entry, page } = await params;
  if (isViewEntry(entry)) {
    const { view, number } = viewOf(entry, page);
    return (
      <CategoryPage
        locale={localeOf(lang)}
        section={section}
        page={number}
        path={requestedPath(lang, section)}
        view={view}
      />
    );
  }
  if (isBrandWord(section))
    return (
      <BrandPage
        locale={localeOf(lang)}
        entry={entry}
        page={brandPageNumber(page)}
        path={`/${lang}/${section}/${entry}/${page}`}
      />
    );
  const { locale, route, number, pages, references } = await resolve(params);
  const dictionary = getDictionary(locale);
  const productPath = route.paths[locale];
  const format = new Intl.NumberFormat(locale);
  const paths = perLocale((l: Locale) =>
    referencePagePath(route.paths[l], number),
  );
  const category = (await getCategories()).find(
    (c) => c.id === route.categoryId,
  );
  const pageText = fill(dictionary.pageOf, {
    page: format.format(number),
    pages: format.format(pages),
  });

  return (
    <SiteFrame locale={locale} paths={paths}>
      <Breadcrumbs
        locale={locale}
        crumbs={[
          ...(category
            ? [
                {
                  name: category.names[locale],
                  path: categoryPath(locale, category.slugs[locale]),
                },
              ]
            : []),
          { name: route.names[locale], path: productPath },
          {
            name: `${dictionary.compatibleModels} (${pageText})`,
            path: paths[locale],
          },
        ]}
      />
      <h1 data-computed-at={route.computedAt} className="text-3xl font-bold">
        {fill(dictionary.referencePageHeading, {
          product: route.names[locale],
        })}
      </h1>
      <p className="mt-1 text-slate">
        {fill(dictionary.pageOf, {
          page: format.format(number),
          pages: format.format(pages),
        })}
      </p>
      <p className="mt-4 mb-6">
        <a href={productPath}>{dictionary.backToProduct}</a>
      </p>
      <ReferenceList references={references} locale={locale} />
      <nav className="pager">
        {number > 1 && (
          <a href={referencePagePath(productPath, number - 1)} rel="prev">
            {dictionary.previousPage}
          </a>
        )}{" "}
        {number < pages && (
          <a href={referencePagePath(productPath, number + 1)} rel="next">
            {dictionary.nextPage}
          </a>
        )}
      </nav>
    </SiteFrame>
  );
}
