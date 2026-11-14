// The crawl showcase (docs/adr/0011-languages-and-seo.md, ADR 0002 option B,
// issue #121): the only addresses search engines may crawl. One list feeds
// both robots.txt, which disallows everything and then allows each address
// exactly, and the sitemap, which lists the same addresses, so the two cannot
// drift apart. Pure functions with no Payload or Next.js imports, so the
// unit tests read them too.
import { locales } from "../cms/locales.ts";
import {
  type CategoryNaming,
  categoryPath,
  homePath,
  type ModelKey,
  modelPath,
} from "./addresses.ts";

/**
 * The sampled model pages per showcase product: its most popular compatible
 * models, the first ones its own page lists.
 */
export const SHOWCASE_MODELS_PER_PRODUCT = 10;

/** What the showcase is built from. */
export type CrawlInput = {
  categories: readonly CategoryNaming[];
  /** The showcase products, with their address in each language. */
  products: readonly { paths: Readonly<Record<string, string>> }[];
  /** Each showcase product's sampled models. */
  models: readonly ModelKey[];
};

/**
 * Addresses that robots.txt can name exactly: lowercase ASCII words, digits,
 * hyphens and slashes, as site/addresses.ts builds them. Neither of the
 * pattern characters `*` and `$`, nor any character a crawler would read back
 * encoded, can appear, so `Allow: <path>$` matches that address and no other.
 */
const PLAIN_PATH = /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/;

/**
 * The showcase's addresses, in a stable order: the bare domain, each home
 * page, each category's first page, each showcase product's page, then the
 * sampled model pages, every one in the ten languages and each listed once.
 * Later category pages and numbered reference pages stay out.
 */
export function crawlPaths(input: CrawlInput): string[] {
  const paths = new Set<string>(["/"]);
  for (const locale of locales) paths.add(homePath(locale));
  for (const category of input.categories)
    for (const locale of locales)
      paths.add(categoryPath(locale, category.slugs[locale]));
  for (const product of input.products)
    for (const locale of locales) {
      const path = product.paths[locale];
      if (!path)
        throw new Error(`A showcase product has no ${locale} address.`);
      paths.add(path);
    }
  for (const model of input.models)
    for (const locale of locales) paths.add(modelPath(locale, model));
  for (const path of paths)
    if (!PLAIN_PATH.test(path))
      throw new Error(`${path} cannot be named exactly in robots.txt.`);
  return [...paths];
}

/** The address of the sitemap, which robots.txt names. */
export const SITEMAP_PATH = "/sitemap.xml";

/**
 * What the showcase pages load, allowed so search engines render them as
 * visitors see them: Next.js's scripts, styles and fonts, and the images.
 */
export const CRAWLABLE_ASSETS = ["/_next/static/", "/images/"] as const;

/** robots.txt's rules for every crawler. */
export type RobotsRules = { allow: string[]; disallow: string[] };

/**
 * Disallows everything, then allows each showcase address exactly, the
 * assets its pages load and the sitemap. Google and Bing apply the most
 * specific (longest) matching rule, so every allowed address wins over
 * `Disallow: /`, and search pages, the admin, the API, later category pages,
 * reference pages and every other product and model stay disallowed.
 */
export function robotsRules(paths: readonly string[]): RobotsRules {
  return {
    allow: [
      ...paths.map((path) => `${path}$`),
      ...CRAWLABLE_ASSETS,
      `${SITEMAP_PATH}$`,
    ],
    disallow: ["/"],
  };
}
