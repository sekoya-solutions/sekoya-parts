// The bare domain: a small page listing the ten languages, and the x-default
// of the home pages. Nothing redirects by the browser's language
// (docs/adr/0011-languages-and-seo.md).
import type { Metadata } from "next";
import { locales } from "../../../cms/locales.ts";
import { getDictionary } from "../../../site/dictionary.ts";
import { SiteFrame } from "../../../site/frame.tsx";
import { homeAlternates } from "../../../site/home.ts";

export const metadata: Metadata = {
  description: getDictionary("fr").siteDescription,
  alternates: homeAlternates("/"),
};

export default function LanguagesPage() {
  return (
    <SiteFrame locale="fr">
      <h1 className="text-3xl font-bold">Sekoya Parts</h1>
      <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
        {locales.map((locale) => (
          <li key={locale}>
            <a
              href={`/${locale}`}
              hrefLang={locale}
              lang={locale}
              className="block rounded-md border border-line px-4 py-3 font-semibold no-underline hover:border-action"
            >
              {getDictionary(locale).languageName}
            </a>
          </li>
        ))}
      </ul>
    </SiteFrame>
  );
}
