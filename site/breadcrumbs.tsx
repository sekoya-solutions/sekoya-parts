// Breadcrumbs (issue #144): the trail from the home page to the current page,
// as links in a <nav>, and the same trail as schema.org BreadcrumbList
// structured data, which search engines read. The JSON-LD is inline data, not
// a script that runs, so the pages still run no browser code of their own.
import type { Locale } from "../cms/locales.ts";
import { homePath } from "./addresses.ts";
import { getDictionary } from "./dictionary.ts";
import { siteUrl } from "./site-url.ts";

export type Crumb = { name: string; path: string };

/**
 * The trail with the home page first; the last crumb is the current page.
 * Pure, so the unit tests read it.
 */
export function trail(locale: Locale, crumbs: Crumb[]): Crumb[] {
  return [
    { name: getDictionary(locale).homeCrumb, path: homePath(locale) },
    ...crumbs,
  ];
}

/** The BreadcrumbList structured data of a trail, at full addresses. */
export function breadcrumbList(trailCrumbs: Crumb[], origin: URL) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trailCrumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: new URL(crumb.path, origin).href,
    })),
  };
}

/** JSON for a <script> element: "<" escaped, so no text can close it. */
export const scriptJson = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, "\\u003c");

export function Breadcrumbs({
  locale,
  crumbs,
}: {
  locale: Locale;
  crumbs: Crumb[];
}) {
  const all = trail(locale, crumbs);
  const last = all.length - 1;
  return (
    <>
      <nav
        aria-label={getDictionary(locale).breadcrumb}
        className="breadcrumbs mb-4"
      >
        <ol>
          {all.map((crumb, index) => (
            <li key={crumb.path}>
              {index === last ? (
                <span aria-current="page">{crumb.name}</span>
              ) : (
                <a href={crumb.path}>{crumb.name}</a>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped JSON data, built from the catalog
        dangerouslySetInnerHTML={{
          __html: scriptJson(breadcrumbList(all, siteUrl(process.env))),
        }}
      />
    </>
  );
}
