// Four templates share the address shape /<lang>/<section>
// (docs/adr/0011-languages-and-seo.md):
// - a category's first page, at /<lang>/<category slug> (issue #81). Its
//   other pages are at /<lang>/<category slug>/<n>, which the entry route
//   hands to the same template;
// - the search results page, at /<lang>/<search word>?q=<query>
//   (docs/adr/0010-search.md, issue #113);
// - the information pages, at /<lang>/<page slug> (issue #143);
// - the brand index, at /<lang>/<brand word> (issue #147);
// - the part finder, at /<lang>/<finder word>?brand=…&type=…&q=… (issue #155).
// Payload refuses a category slug equal to a search word, a brand word or a
// page slug, in any language.
import type { Metadata } from "next";
import {
  BRAND_WORDS,
  INFO_PAGES,
  INFO_SLUGS,
  infoPageOf,
  isBrandWord,
  isFinderWord,
  isSearchWord,
} from "../../../../site/addresses.ts";
import {
  BrandIndexPage,
  brandIndexMetadata,
} from "../../../../site/brands.tsx";
import { getCategories } from "../../../../site/categories.tsx";
import {
  CategoryPage,
  categoryMetadata,
  requestedPath,
} from "../../../../site/category-page.tsx";
import { getDictionary } from "../../../../site/dictionary.ts";
import { FinderPage } from "../../../../site/finder.tsx";
import { InfoPageView, infoMetadata } from "../../../../site/info-page.tsx";
import { localeOf } from "../../../../site/resolve.ts";
import { SearchPage } from "../../../../site/search.tsx";
import { queryOf } from "../../../../site/search-key.ts";

// Built in advance: each category's first page, each information page and the
// brand index in each language. The other category pages render on their first visit
// (docs/adr/0008-caching-and-partial-refresh.md), and the search page on every
// request.
export async function generateStaticParams({
  params,
}: {
  params: { lang: string };
}) {
  const locale = localeOf(params.lang);
  const categories = await getCategories();
  if (categories.length === 0)
    throw new Error("No category: load the catalog before building.");
  return [
    ...categories.map((category) => ({ section: category.slugs[locale] })),
    ...INFO_PAGES.map((page) => ({ section: INFO_SLUGS[page][locale] })),
    { section: BRAND_WORDS[locale] },
  ];
}

// The search page reads the request's query outside any Suspense boundary,
// which Cache Components allows only on a route that may block: its results
// then come with the page rather than after it. Category pages are still built
// in advance; this only lifts the check that the page could stream instantly.
export const instant = false;

type Props = PageProps<"/[lang]/[section]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, section } = await params;
  const locale = localeOf(lang);
  // Results pages stay out of search engines' indexes (ADR 0010), with no
  // canonical address or hreflang.
  if (isSearchWord(section))
    return {
      title: `${getDictionary(locale).searchTitle} | Sekoya Parts`,
      robots: { index: false },
    };
  // The finder's steps stay out of indexes too, like the search page.
  if (isFinderWord(section))
    return {
      title: `${getDictionary(locale).finderTitle} | Sekoya Parts`,
      robots: { index: false },
    };
  if (infoPageOf(section)) return infoMetadata(locale, section);
  if (isBrandWord(section)) return brandIndexMetadata(locale, section);
  return categoryMetadata(locale, section, 1, requestedPath(lang, section));
}

// params is read outside any Suspense boundary, as on the product page.
export default async function SectionPage({ params, searchParams }: Props) {
  const { lang, section } = await params;
  const locale = localeOf(lang);
  if (isSearchWord(section)) {
    // Another language's search word or another letter case shows the same
    // page in the address's language, rather than redirecting: a redirect
    // from a page that reads the query would only reach the browser after a
    // 200, and results pages are kept out of search engines anyway.
    const query = queryOf((await searchParams).q);
    return <SearchPage locale={locale} query={query} />;
  }
  if (isFinderWord(section)) {
    const query = await searchParams;
    const one = (value: string | string[] | undefined) =>
      typeof value === "string" ? value : undefined;
    return (
      <FinderPage
        locale={locale}
        choice={{
          brand: one(query.brand),
          type: one(query.type),
          q: one(query.q),
        }}
      />
    );
  }
  if (infoPageOf(section))
    return <InfoPageView locale={locale} section={section} />;
  if (isBrandWord(section))
    return <BrandIndexPage locale={locale} section={section} />;
  return (
    <CategoryPage
      locale={locale}
      section={section}
      page={1}
      path={requestedPath(lang, section)}
    />
  );
}
