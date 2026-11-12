// The bare domain: a small page listing the ten languages, and the x-default
// of the home pages. Nothing redirects by the browser's language
// (docs/adr/0011-languages-and-seo.md).
import type { Metadata } from "next";
import { locales } from "../../../cms/locales.ts";
import { getDictionary } from "../../../site/dictionary.ts";
import { homeAlternates } from "../../../site/home.ts";

export const metadata: Metadata = {
  description: getDictionary("fr").siteDescription,
  alternates: homeAlternates("/"),
};

export default function LanguagesPage() {
  return (
    <main>
      <h1>Sekoya Parts</h1>
      <ul>
        {locales.map((locale) => (
          <li key={locale}>
            <a href={`/${locale}`} hrefLang={locale} lang={locale}>
              {getDictionary(locale).languageName}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
