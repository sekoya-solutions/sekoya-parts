// The information pages (issue #143): legal notice, demo terms of sale,
// privacy, delivery and returns, help, and accessibility statement, at
// /<lang>/<page slug>. Their texts are committed in site/info, so each page is
// static: built in advance, with no database read.
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import type { Locale } from "../cms/locales.ts";
import {
  INFO_SLUGS,
  type InfoPage,
  infoPageOf,
  infoPagePath,
  infoPagePaths,
  languageAlternates,
} from "./addresses.ts";
import { fill, getDictionary } from "./dictionary.ts";
import { SiteFrame } from "./frame.tsx";
import { getInfoText } from "./info-texts.ts";
import { legalValues, PUBLISHER, usesPublisher } from "./publisher.ts";

/**
 * The information page a section names. Another language's slug or another
 * letter case redirects permanently to the page in the address's language,
 * as the model words do (ADR 0011).
 */
export function resolveInfoPage(locale: Locale, section: string): InfoPage {
  const page = infoPageOf(section);
  if (!page) notFound();
  if (section !== INFO_SLUGS[page][locale])
    permanentRedirect(infoPagePath(locale, page));
  return page;
}

export function infoMetadata(locale: Locale, section: string): Metadata {
  const page = resolveInfoPage(locale, section);
  const text = getInfoText(locale, page);
  const paths = infoPagePaths(page);
  return {
    title: `${text.title} | Sekoya Parts`,
    description: text.description,
    alternates: {
      canonical: paths[locale],
      languages: languageAlternates(paths, paths.fr),
    },
  };
}

export function InfoPageView({
  locale,
  section,
}: {
  locale: Locale;
  section: string;
}) {
  const page = resolveInfoPage(locale, section);
  const text = getInfoText(locale, page);
  // Only the legal notice has placeholders; fill() fails on any other.
  const values = page === "legal" ? legalValues() : {};
  // While the publisher's details are pending, a section that shows them
  // says they will be published soon instead.
  const pending = getDictionary(locale).publisherPending;
  const paragraphsOf = (paragraphs: string[]) =>
    PUBLISHER === null && paragraphs.some(usesPublisher)
      ? [pending]
      : paragraphs.map((paragraph) => fill(paragraph, values));
  return (
    <SiteFrame locale={locale} paths={infoPagePaths(page)}>
      <article className="info-page max-w-prose">
        <h1 className="text-3xl font-bold">{text.title}</h1>
        {text.sections.map((part) => (
          <section key={part.heading}>
            <h2>{part.heading}</h2>
            {paragraphsOf(part.paragraphs).map((paragraph, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static texts, never reordered
              <p key={index}>{paragraph}</p>
            ))}
          </section>
        ))}
      </article>
    </SiteFrame>
  );
}
