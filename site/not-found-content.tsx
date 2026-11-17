"use client";
// The 404 page's content, in the language of its address (issue #83).
//
// Next.js gives a not-found file no props, so the language comes from the
// route's parameters through useParams, which also works while the server
// renders the page: the 404 arrives in its language with no wait for
// browser code. Next.js embeds the not-found tree in every page under its
// segment, and loads this module's script with each of them, so it holds
// only the 404's own labels (site/not-found-texts.ts, issue #209), never
// the dictionaries.
import { useParams } from "next/navigation";
import { type Locale, locales } from "../cms/locales.ts";
import { NOT_FOUND_TEXTS } from "./not-found-texts.ts";
import { Wordmark } from "./wordmark.tsx";

/**
 * The whole 404 page: the header with the wordmark, the message and the
 * footer, as SiteFrame lays out the other pages, without the language switch.
 */
export function NotFoundPage() {
  const lang = useParams<{ lang?: string }>()?.lang;
  const locale: Locale = locales.includes(lang as Locale)
    ? (lang as Locale)
    : "fr";
  const text = NOT_FOUND_TEXTS[locale];
  const home = `/${locale}`;
  return (
    <>
      <header className="on-navy">
        <div className="mx-auto flex max-w-page items-center px-4 py-3">
          <a href={home}>
            <Wordmark />
          </a>
        </div>
      </header>
      <main
        id="main"
        data-template="not-found"
        className="mx-auto max-w-page px-4 py-16"
      >
        <p className="text-sm font-bold text-slate">404</p>
        <h1 className="mt-1 text-3xl font-bold">{text.notFoundTitle}</h1>
        <p className="mt-2 text-slate">{text.notFoundText}</p>
        <p className="mt-6">
          <a href={home}>{text.notFoundHome}</a>
        </p>
      </main>
      <footer className="on-navy mt-16">
        <div className="mx-auto max-w-page px-4 py-6 text-sm">
          <p>{text.footerNote}</p>
        </div>
      </footer>
    </>
  );
}
