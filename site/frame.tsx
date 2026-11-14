// The site layout around every page in a language (issue #83): a navy header
// with the wordmark, the search box (issue #113) and the language switch, the page's main content, and a
// footer. The skip link sits in the root layout, before it.
//
// The language switch is plain links, with no browser code
// (docs/adr/0012-front-end-assets.md): each page passes its own addresses in
// every language, the same ones as its hreflang tags. A native <details>
// element folds the list on small screens without any script.
import type { ReactNode } from "react";
import { type Locale, locales } from "../cms/locales.ts";
import { homePath } from "./addresses.ts";
import { getDictionary } from "./dictionary.ts";
import { MAX_QUERY_LENGTH } from "./search-key.ts";
import { Wordmark } from "./wordmark.tsx";

/** Where the search box sends its form: app/(site)/api/search/route.ts. */
export const SEARCH_ROUTE = "/api/search";

/** The id the skip link points to. */
export const MAIN_ID = "main";

export function LanguageSwitch({
  locale,
  paths,
}: {
  locale: Locale;
  paths: Record<Locale, string>;
}) {
  const dictionary = getDictionary(locale);
  return (
    <details className="relative">
      <summary className="cursor-pointer rounded-md px-2 py-1 text-sm text-cream uppercase">
        <span className="sr-only">{dictionary.languageMenu}: </span>
        {locale}
      </summary>
      <nav
        aria-label={dictionary.languageMenu}
        className="absolute right-0 z-10 mt-2 w-44 rounded-md bg-navy p-2 shadow-lg ring-1 ring-slate"
      >
        <ul>
          {locales.map((other) =>
            other === locale ? null : (
              <li key={other}>
                <a
                  href={paths[other]}
                  hrefLang={other}
                  lang={other}
                  className="block rounded-sm px-2 py-1"
                >
                  {getDictionary(other).languageName}
                </a>
              </li>
            ),
          )}
        </ul>
      </nav>
    </details>
  );
}

/**
 * The search box (docs/adr/0010-search.md): a plain form sent with GET to
 * SEARCH_ROUTE with the page's language, with no browser code. On phones it
 * takes its own row under the wordmark.
 */
export function SearchBox({
  locale,
  query = "",
}: {
  locale: Locale;
  query?: string;
}) {
  const dictionary = getDictionary(locale);
  return (
    <search className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
      <form
        action={SEARCH_ROUTE}
        method="get"
        className="flex gap-2 sm:justify-end"
      >
        <input type="hidden" name="lang" value={locale} />
        <label htmlFor="search-query" className="sr-only">
          {dictionary.searchLabel}
        </label>
        <input
          id="search-query"
          type="search"
          name="q"
          defaultValue={query}
          maxLength={MAX_QUERY_LENGTH}
          required
          placeholder={dictionary.searchPlaceholder}
          className="search-input min-w-0 flex-1 rounded-md px-3 py-1.5 sm:max-w-80"
        />
        <button type="submit" className="search-button rounded-md px-3 py-1.5">
          {dictionary.searchButton}
        </button>
      </form>
    </search>
  );
}

export function SiteHeader({
  locale,
  paths,
  query,
}: {
  locale: Locale;
  paths?: Record<Locale, string>;
  query?: string;
}) {
  return (
    <header className="on-navy">
      <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3">
        <a href={homePath(locale)}>
          <Wordmark />
        </a>
        <SearchBox locale={locale} query={query} />
        {paths && <LanguageSwitch locale={locale} paths={paths} />}
      </div>
    </header>
  );
}

export function SiteFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="on-navy mt-16">
      <div className="mx-auto max-w-page px-4 py-6 text-sm">
        <p>{getDictionary(locale).footerNote}</p>
      </div>
    </footer>
  );
}

/**
 * A page in one language: header, main content and footer. `paths` are the
 * page's addresses in every language, for the language switch; a page with
 * none, like the 404, shows no switch. `query` fills the search box on the
 * results page.
 */
export function SiteFrame({
  locale,
  paths,
  query,
  children,
}: {
  locale: Locale;
  paths?: Record<Locale, string>;
  query?: string;
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader locale={locale} paths={paths} query={query} />
      <main id={MAIN_ID} className="mx-auto max-w-page px-4 py-8">
        {children}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

/** The skip link, first in the body: hidden until it takes keyboard focus. */
export function SkipLink({ locale }: { locale: Locale }) {
  return (
    <a
      href={`#${MAIN_ID}`}
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:rounded-md focus:bg-white focus:px-4 focus:py-2"
    >
      {getDictionary(locale).skipToContent}
    </a>
  );
}
