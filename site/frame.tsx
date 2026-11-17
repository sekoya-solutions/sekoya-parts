// The site layout around every page in a language (issue #83): a bar of facts
// about the demo (issue #144), a navy header with the wordmark, the search box
// (issue #113), the language switch and, under them, the menu by appliance
// (issue #198), the page's main content, and a footer with the information
// pages' links (issue #143). The skip link sits in the root layout, before it.
//
// The language switch and the menu by appliance are plain links (docs/adr/
// 0012-front-end-assets.md): a native <details> element folds each list
// without any script. On a phone they make way for one menu
// (issue #181), a <details> element too, so the header keeps one row. The language switch takes each page's own
// addresses in every language, the same ones as its hreflang tags, and shows
// each language's flag beside its name (issue #191). Following one of its
// links, a small browser script remembers the language for the bare domain
// (site/language-pick.tsx).
import type { CSSProperties, ReactNode } from "react";
import { type ApplianceType, MODEL_COUNT } from "../catalog/generator.ts";
import { type Locale, locales } from "../cms/locales.ts";
import { AccountState } from "./account-state.tsx";
import {
  accountPath,
  brandIndexPath,
  type CategoryNaming,
  cartPath,
  categoryPath,
  homePath,
  type InfoPage,
  infoPagePath,
} from "./addresses.ts";
import { MENU_GROUPS, menuGroupKey, typeCategories } from "./appliance-menu.ts";
import { CartCount } from "./cart-count.tsx";
import { CartForms } from "./cart-forms.tsx";
import { getCategories } from "./categories.tsx";
import {
  applianceTypeName,
  type Dictionary,
  fill,
  getDictionary,
} from "./dictionary.ts";
import { Flag } from "./flags.tsx";
import { AccountIcon, CartIcon, CloseIcon, MenuIcon } from "./header-icons.tsx";
import { getInfoText } from "./info-texts.ts";
import { LANGUAGE_PICK } from "./language-choice.ts";
import { LanguagePick } from "./language-pick.tsx";
import { MenuBackdrop } from "./menu-backdrop.tsx";
import { MenuCloser } from "./menu-closer.tsx";
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
      <summary className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm text-cream uppercase sm:text-base">
        <Flag locale={locale} />
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
                  {...{ [LANGUAGE_PICK]: other }}
                  className="flex items-center gap-2 rounded-sm px-2 py-1"
                >
                  <Flag locale={other} />
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
    <search className="order-last w-full sm:order-none">
      <form action={SEARCH_ROUTE} method="get" className="flex gap-2">
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
          className="search-input min-w-0 flex-1 rounded-md px-3 py-1.5 sm:py-2 sm:text-base"
        />
        <button
          type="submit"
          className="search-button rounded-md px-3 py-1.5 sm:px-4 sm:py-2 sm:text-base"
        >
          {dictionary.searchButton}
        </button>
      </form>
    </search>
  );
}

/** One appliance type's heading and category links, in a menu (issue #198). */
function ApplianceTypeLinks({
  locale,
  type,
  categories,
}: {
  locale: Locale;
  type: ApplianceType;
  categories: readonly CategoryNaming[];
}) {
  return (
    <section>
      <h2>{applianceTypeName(getDictionary(locale), type)}</h2>
      <ul data-list={`menu-${type}`}>
        {typeCategories(type, categories, locale).map((category) => (
          <li key={category.id}>
            <a href={categoryPath(locale, category.slugs[locale])}>
              {category.names[locale]}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The menu by appliance (issue #198), from 40rem: a row under the header's
 * top row with the three appliance groups, then the brand index. Each group
 * is a native <details> element opening a panel the page's width, with one
 * column per appliance type and its categories (site/appliance-menu.ts). The
 * groups share a name, so the browser keeps one open at a time; a small
 * script closes it on Escape, a click outside or focus leaving it
 * (site/menu-closer.tsx). The category names come from one cached read,
 * shared by every page (site/categories.tsx), so a renamed category refreshes
 * the menus with the pages that show it.
 */
export async function ApplianceMenu({ locale }: { locale: Locale }) {
  const dictionary = getDictionary(locale);
  const categories = await getCategories();
  return (
    <nav
      aria-label={dictionary.applianceMenu}
      data-appliance-menu
      className="appliance-menu"
    >
      <ul className="appliance-menu-row">
        {MENU_GROUPS.map(({ group, types }) => (
          <li key={group}>
            <details name="appliance-menu" data-menu-group={group}>
              <summary>{dictionary[menuGroupKey(group)]}</summary>
              <MenuCloser />
              <div className="appliance-menu-panel">
                <div className="appliance-menu-columns">
                  {types.map((type) => (
                    <ApplianceTypeLinks
                      key={type}
                      locale={locale}
                      type={type}
                      categories={categories}
                    />
                  ))}
                </div>
              </div>
            </details>
          </li>
        ))}
        <li>
          <a
            href={brandIndexPath(locale)}
            data-menu-brands
            className="appliance-menu-brands"
          >
            {dictionary.brands}
          </a>
        </li>
      </ul>
    </nav>
  );
}

/**
 * The bar above the header, outside its banner landmark (issue #144): true facts about the demo, where a
 * real shop puts its promises (owner decision, 2026-11-15). The model count is
 * the same at every catalog scale (ADR 0007).
 *
 * On a phone the facts hold one line that scrolls in a loop, with CSS only
 * (issue #194, `.facts-bar` in site.css). The list is rendered twice so the
 * loop has no gap; the copy is hidden from screen readers and the keyboard.
 * The loop's duration follows the text's length, so every language scrolls at
 * the same pace.
 */
export function FactsBar({ locale }: { locale: Locale }) {
  const dictionary = getDictionary(locale);
  const facts = [
    fill(dictionary.factsModels, {
      models: new Intl.NumberFormat(locale).format(MODEL_COUNT),
    }),
    dictionary.factsLanguages,
    dictionary.factsDemo,
  ];
  const characters = facts.reduce((sum, fact) => sum + fact.length, 0);
  const list = (copy: boolean) => (
    <ul
      className="facts-list"
      {...(copy ? { "aria-hidden": true, "data-facts-copy": "" } : {})}
    >
      <li>{facts[0]}</li>
      <li>{facts[1]}</li>
      <li>
        <a
          href={infoPagePath(locale, "terms")}
          {...(copy ? { tabIndex: -1 } : {})}
        >
          {facts[2]}
        </a>
      </li>
    </ul>
  );
  return (
    // tabIndex -1: a tap focuses the bar, which pauses the loop until the
    // visitor taps elsewhere, with no stop added to the keyboard's order.
    <div
      data-facts-bar
      tabIndex={-1}
      className="facts-bar on-navy border-b border-slate text-xs"
      style={{ "--facts-characters": characters } as CSSProperties}
    >
      <div className="facts-track">
        {list(false)}
        {list(true)}
      </div>
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
      <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-6 sm:py-4 lg:grid-cols-[1fr_minmax(0,36rem)_1fr]">
        <div className="flex items-center gap-2">
          <MobileMenu locale={locale} paths={paths} />
          <a href={homePath(locale)} className="whitespace-nowrap">
            <Wordmark />
          </a>
        </div>
        <SearchBox locale={locale} query={query} />
        {/* On a phone the menu above holds these links but the account and
            the cart, which show icons, so the header keeps one row (issue
            #181). */}
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 sm:flex-nowrap sm:justify-self-end sm:gap-x-3">
          <div data-wide-links className="hidden sm:contents">
            {paths && <LanguageSwitch locale={locale} paths={paths} />}
          </div>
          <AccountLink locale={locale} />
          <CartLink locale={locale} />
        </div>
      </div>
      <ApplianceMenu locale={locale} />
      {paths && <LanguagePick />}
    </header>
  );
}

/**
 * The phone menu (issue #181): a button with three lines, then the menu, a
 * panel from the left side of the screen with the three appliance groups,
 * each folded in its own <details> element until tapped, the brands as a
 * group of their own, and the languages (issue #198); the account and the
 * cart keep their icons in the
 * header's row. A native <details> element, so it opens and closes without
 * any script; its button becomes the panel's top bar, "Close" with a cross,
 * while it is open. Hidden from 40rem on, where the header's own links fit. The backdrop's script adds Escape, a tap beside
 * the panel and focus leaving it (site/menu-backdrop.tsx).
 */
export async function MobileMenu({
  locale,
  paths,
}: {
  locale: Locale;
  paths?: Record<Locale, string>;
}) {
  const dictionary = getDictionary(locale);
  const categories = await getCategories();
  return (
    <details data-mobile-menu className="mobile-menu sm:hidden">
      <summary className="mobile-menu-button">
        <span className="mobile-menu-open">
          <MenuIcon />
          <span className="text-[0.625rem] uppercase tracking-widest">
            {dictionary.menu}
          </span>
        </span>
        <span className="mobile-menu-close">
          {dictionary.menuClose}
          <CloseIcon />
        </span>
      </summary>
      <MenuBackdrop />
      <nav aria-label={dictionary.menu} className="mobile-menu-panel">
        {MENU_GROUPS.map(({ group, types }) => (
          <details key={group} data-menu-group={group} className="menu-group">
            <summary>{dictionary[menuGroupKey(group)]}</summary>
            {types.map((type) => (
              <ApplianceTypeLinks
                key={type}
                locale={locale}
                type={type}
                categories={categories}
              />
            ))}
          </details>
        ))}
        <a
          href={brandIndexPath(locale)}
          data-menu-brands
          className="menu-group-link"
        >
          {dictionary.brands}
        </a>
        {paths && (
          <>
            <h2>{dictionary.languageMenu}</h2>
            <ul>
              {locales.map((other) =>
                other === locale ? null : (
                  <li key={other}>
                    <a
                      href={paths[other]}
                      hrefLang={other}
                      lang={other}
                      {...{ [LANGUAGE_PICK]: other }}
                    >
                      <Flag locale={other} />
                      {getDictionary(other).languageName}
                    </a>
                  </li>
                ),
              )}
            </ul>
          </>
        )}
      </nav>
    </details>
  );
}

/**
 * The account link (issue #177): the same for every visitor, to the account
 * address, which shows the sign-in form to a visitor who is not signed in.
 * It shows an icon, with its name under it from 40rem and kept for screen
 * readers alone on a phone (owner decisions, 2026-11-16 and 2026-11-17). Whether the visitor is signed in is shown in the browser
 * (site/account-state.tsx, ADR 0013), in a space reserved so nothing shifts.
 */
export function AccountLink({ locale }: { locale: Locale }) {
  const dictionary = getDictionary(locale);
  return (
    <a
      href={accountPath(locale)}
      data-account-link
      className="header-badge-link"
    >
      <span className="header-icon-box">
        <AccountIcon />
        <AccountState label={dictionary.accountSignedIn} />
      </span>
      <span className="sr-only sm:not-sr-only">{dictionary.account}</span>
    </a>
  );
}

/**
 * The cart link (issue #168): the same for every visitor. Its count is filled
 * in the browser from the cart cookie (site/cart-count.tsx, ADR 0013), in a
 * space reserved so nothing shifts.
 */
export function CartLink({ locale }: { locale: Locale }) {
  const dictionary = getDictionary(locale);
  return (
    <a href={cartPath(locale)} data-cart-link className="header-badge-link">
      <span className="header-icon-box">
        <CartIcon />
        <CartCount label={dictionary.cartCount} />
      </span>
      <span className="sr-only sm:not-sr-only">{dictionary.cart}</span>
    </a>
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
  const dictionary = getDictionary(locale);
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
      <CartForms
        cartPath={cartPath(locale)}
        labels={{
          cartAdded: dictionary.cartAdded,
          cartViewCart: dictionary.cartViewCart,
          cartFull: dictionary.cartFull,
          cartUnavailable: dictionary.cartUnavailable,
          cartClose: dictionary.cartClose,
          cartError: dictionary.cartError,
        }}
      />
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
