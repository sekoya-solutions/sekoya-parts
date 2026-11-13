// A numbered reference page, at the product's address followed by /<n>
// (docs/adr/0009-compatible-references.md, docs/adr/0011-languages-and-seo.md):
// 500 references, read by rank range, with links to the previous and next
// pages and to the product. Only a product with more references than its own
// page shows has these pages. Each page is its own canonical address; none
// points to the first page.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "../../../../../../cms/locales.ts";
import {
  isModelWord,
  languageAlternates,
  parsePageNumber,
  perLocale,
  referencePageCount,
  referencePagePath,
  referencePageRanks,
} from "../../../../../../site/addresses.ts";
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
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
  const { locale, route, number, pages, references } = await resolve(params);
  const dictionary = getDictionary(locale);
  const productPath = route.paths[locale];
  const format = new Intl.NumberFormat(locale);
  const paths = perLocale((l: Locale) =>
    referencePagePath(route.paths[l], number),
  );

  return (
    <SiteFrame locale={locale} paths={paths}>
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
