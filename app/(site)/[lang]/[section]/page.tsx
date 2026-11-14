// Two templates share the address shape /<lang>/<section>
// (docs/adr/0011-languages-and-seo.md):
// - a category's first page, at /<lang>/<category slug> (issue #81). Its
//   other pages are at /<lang>/<category slug>/<n>, which the entry route
//   hands to the same template;
// - the search results page, at /<lang>/<search word>?q=<query>
//   (docs/adr/0010-search.md, issue #113). Payload refuses a category slug
//   equal to a search word, in any language.
import type { Metadata } from "next";
import { isSearchWord } from "../../../../site/addresses.ts";
import { getCategories } from "../../../../site/categories.tsx";
import {
  CategoryPage,
  categoryMetadata,
  requestedPath,
} from "../../../../site/category-page.tsx";
import { getDictionary } from "../../../../site/dictionary.ts";
import { localeOf } from "../../../../site/resolve.ts";
import { SearchPage } from "../../../../site/search.tsx";
import { queryOf } from "../../../../site/search-key.ts";

// Built in advance: each category's first page in each language. The other
// pages render on their first visit (docs/adr/0008-caching-and-partial-refresh.md),
// and the search page on every request.
export async function generateStaticParams({
  params,
}: {
  params: { lang: string };
}) {
  const locale = localeOf(params.lang);
  const categories = await getCategories();
  if (categories.length === 0)
    throw new Error("No category: load the catalog before building.");
  return categories.map((category) => ({ section: category.slugs[locale] }));
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
  return (
    <CategoryPage
      locale={locale}
      section={section}
      page={1}
      path={requestedPath(lang, section)}
    />
  );
}
