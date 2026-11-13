"use client";
// The 404 page's content, in the language of its address (issue #83).
//
// Next.js gives a not-found file no props, so the language comes from the
// route's parameters through useParams, which also works while the server
// renders the page: the 404 arrives in its language with no wait for
// browser code. Next.js embeds the not-found tree in every page under its
// segment, so its texts live in this module's script, loaded once and
// cached, rather than in each page's HTML.
import { useParams } from "next/navigation";
import { type Locale, locales } from "../cms/locales.ts";
import da from "./dictionaries/da.json" with { type: "json" };
import de from "./dictionaries/de.json" with { type: "json" };
import en from "./dictionaries/en.json" with { type: "json" };
import es from "./dictionaries/es.json" with { type: "json" };
import fr from "./dictionaries/fr.json" with { type: "json" };
import it from "./dictionaries/it.json" with { type: "json" };
import nl from "./dictionaries/nl.json" with { type: "json" };
import pl from "./dictionaries/pl.json" with { type: "json" };
import pt from "./dictionaries/pt.json" with { type: "json" };
import sv from "./dictionaries/sv.json" with { type: "json" };
import { Wordmark } from "./wordmark.tsx";

const all = { fr, en, de, es, it, nl, pt, pl, sv, da };

/** The labels the 404 page shows. */
const TEXTS = Object.fromEntries(
  locales.map((locale) => {
    const { notFoundTitle, notFoundText, notFoundHome, footerNote } =
      all[locale];
    return [locale, { notFoundTitle, notFoundText, notFoundHome, footerNote }];
  }),
) as Record<
  Locale,
  Pick<
    typeof fr,
    "notFoundTitle" | "notFoundText" | "notFoundHome" | "footerNote"
  >
>;

/**
 * The whole 404 page: the header with the wordmark, the message and the
 * footer, as SiteFrame lays out the other pages, without the language switch.
 */
export function NotFoundPage() {
  const lang = useParams<{ lang?: string }>()?.lang;
  const locale: Locale = locales.includes(lang as Locale)
    ? (lang as Locale)
    : "fr";
  const text = TEXTS[locale];
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
      <main id="main" className="mx-auto max-w-page px-4 py-16">
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
