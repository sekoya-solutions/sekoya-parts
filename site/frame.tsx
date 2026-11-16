// The site layout around every page in a language (issue #83): a bar of facts
// about the demo (issue #144), a navy header with the wordmark, the search box
// (issue #113), the category menu (issue #144) and the language switch, the
// page's main content, and a footer with the information pages' links (issue
// #143). The skip link sits in the root layout, before it.
//
// The language switch and the category menu are plain links, with no browser
// code (docs/adr/0012-front-end-assets.md): a native <details> element folds
// each list without any script. The language switch takes each page's own
// addresses in every language, the same ones as its hreflang tags.
import type { ReactNode } from "react";
import { MODEL_COUNT } from "../catalog/generator.ts";
import { type Locale, locales } from "../cms/locales.ts";
import {
  brandIndexPath,
  categoryPath,
  homePath,
  type InfoPage,
  infoPagePath,
} from "./addresses.ts";
import { getCategories } from "./categories.tsx";
import { type Dictionary, fill, getDictionary } from "./dictionary.ts";
import { getInfoText } from "./info-texts.ts";
import { MAX_QUERY_LENGTH } from "./search-key.ts";
import type { Template } from "./templates.ts";
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

/**
 * The category menu (issue #144): the 12 categories in the page's language,
 * sorted by name, each linking to its first page. One cached read, shared by
 * every page (site/categories.tsx), so a renamed category refreshes the menu
 * with the pages that show it.
 */
export async function CategoryMenu({ locale }: { locale: Locale }) {
  const dictionary = getDictionary(locale);
  const categories = [...(await getCategories())].sort((a, b) =>
    a.names[locale].localeCompare(b.names[locale], locale),
  );
  return (
    <details className="relative">
      <summary className="cursor-pointer rounded-md px-2 py-1 text-sm text-cream">
        {dictionary.categoriesMenu}
      </summary>
      <nav
        aria-label={dictionary.categoriesMenu}
        className="absolute right-0 z-10 mt-2 w-64 rounded-md bg-navy p-2 shadow-lg ring-1 ring-slate"
      >
        <ul>
          {categories.map((category) => (
            <li key={category.id}>
              <a
                href={categoryPath(locale, category.slugs[locale])}
                className="block rounded-sm px-2 py-1"
              >
                {category.names[locale]}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}

/**
 * The bar above the header, outside its banner landmark (issue #144): true facts about the demo, where a
 * real shop puts its promises (owner decision, 2026-11-15). The model count is
 * the same at every catalog scale (ADR 0007).
 */
export function FactsBar({ locale }: { locale: Locale }) {
  const dictionary = getDictionary(locale);
  return (
    <div data-facts-bar className="on-navy border-b border-slate">
      <ul className="mx-auto flex max-w-page flex-wrap justify-center gap-x-6 gap-y-1 px-4 py-1.5 text-xs">
        <li>
          {fill(dictionary.factsModels, {
            models: new Intl.NumberFormat(locale).format(MODEL_COUNT),
          })}
        </li>
        <li>{dictionary.factsLanguages}</li>
        <li>
          <a href={infoPagePath(locale, "terms")}>{dictionary.factsDemo}</a>
        </li>
      </ul>
    </div>
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
        <div className="flex items-center gap-2">
          <CategoryMenu locale={locale} />
          <a
            href={brandIndexPath(locale)}
            className="rounded-md px-2 py-1 text-sm"
          >
            {getDictionary(locale).brands}
          </a>
          {paths && <LanguageSwitch locale={locale} paths={paths} />}
        </div>
      </div>
    </header>
  );
}

/**
 * The footer's columns of information pages (issue #143), each with its
 * heading's dictionary key and the id that labels its navigation.
 */
const FOOTER_COLUMNS = [
  { label: "footerHelp", id: "footer-help", pages: ["help", "delivery"] },
  {
    label: "footerLegal",
    id: "footer-legal",
    pages: ["legal", "terms", "privacy", "accessibility"],
  },
] as const satisfies readonly {
  label: keyof Dictionary;
  id: string;
  pages: readonly InfoPage[];
}[];

/**
 * The footer: two columns of links to the information pages, then the demo
 * notice, all in the page's language.
 */
export function SiteFooter({ locale }: { locale: Locale }) {
  const dictionary = getDictionary(locale);
  return (
    <footer className="on-navy mt-16">
      <div className="mx-auto grid max-w-page gap-6 px-4 py-8 text-sm sm:grid-cols-2">
        {FOOTER_COLUMNS.map((column) => (
          <nav key={column.id} aria-labelledby={column.id}>
            <h2 id={column.id} className="font-bold text-cream">
              {dictionary[column.label]}
            </h2>
            <ul className="footer-links mt-2">
              {column.pages.map((page) => (
                <li key={page}>
                  <a href={infoPagePath(locale, page)}>
                    {getInfoText(locale, page).link}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <p className="sm:col-span-2">{dictionary.footerNote}</p>
      </div>
    </footer>
  );
}

/**
 * A page in one language: header, main content and footer. `paths` are the
 * page's addresses in every language, for the language switch; a page with
 * none, like the 404, shows no switch. `query` fills the search box on the
 * results page. `template` names the page's template on <main>, which the
 * checks that reach a page through a link verify (site/templates.ts).
 */
export function SiteFrame({
  locale,
  template,
  paths,
  query,
  children,
}: {
  locale: Locale;
  template: Template;
  paths?: Record<Locale, string>;
  query?: string;
  children: ReactNode;
}) {
  return (
    <>
      <FactsBar locale={locale} />
      <SiteHeader locale={locale} paths={paths} query={query} />
      <main
        id={MAIN_ID}
        data-template={template}
        className="mx-auto max-w-page px-4 py-8"
      >
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
