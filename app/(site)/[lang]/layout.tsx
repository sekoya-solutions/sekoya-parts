// The root layout of every page in a language, under app/[lang], Next.js's
// own pattern (docs/adr/0011-languages-and-seo.md). Any first segment that is
// not one of the ten languages is a 404.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { locales } from "../../../cms/locales.ts";
import { isLocale } from "../../../site/addresses.ts";
import { getDictionary } from "../../../site/dictionary.ts";
import { fontVariables } from "../../../site/fonts.ts";
import { SkipLink } from "../../../site/frame.tsx";
import { siteUrl } from "../../../site/site-url.ts";
import "../../../site/site.css";

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return {
    metadataBase: siteUrl(process.env),
    title: "Sekoya Parts",
    description: getDictionary(lang).siteDescription,
  };
}

export default async function LanguageLayout({
  children,
  params,
}: LayoutProps<"/[lang]">) {
  // params is read outside any Suspense boundary: with partialPrefetching off,
  // a first visit then waits for the full render and gets complete HTML.
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <html lang={lang} className={fontVariables}>
      <body>
        <SkipLink locale={lang} />
        {children}
      </body>
    </html>
  );
}
