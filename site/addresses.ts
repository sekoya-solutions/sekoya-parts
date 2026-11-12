// The site's addresses (docs/adr/0011-languages-and-seo.md): every page sits
// under its language, and a product's address carries translated words before
// its reference, the stable key the page is found by. Pure functions with no
// Payload or Next.js imports, so the unit and end-to-end tests read them too.
import { slugify } from "../catalog/generator.ts";
import { productName } from "../catalog/text.ts";
import { type Locale, locales } from "../cms/locales.ts";

export const isLocale = (value: string): value is Locale =>
  (locales as readonly string[]).includes(value);

/**
 * The rule for product references: uppercase letters and digits only, so the
 * reference is always the last hyphen-separated word of the address and reads
 * back unchanged. Payload checks it when a product is saved.
 */
export const PRODUCT_REFERENCE = /^[A-Z0-9]+$/;

export const isProductReference = (value: string): boolean =>
  PRODUCT_REFERENCE.test(value);

/**
 * The rule for category slugs: lowercase ASCII words joined by single
 * hyphens, the form slugify gives. Payload checks it when a category is saved.
 */
export const CATEGORY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The words of a product's address: its name in one language, in lowercase
 * ASCII, without the reference, which the address adds at the end anyway.
 */
export function productWords(name: string, reference: string): string {
  const words = slugify(name);
  const ref = reference.toLowerCase();
  if (words === ref) return "";
  return words.endsWith(`-${ref}`) ? words.slice(0, -ref.length - 1) : words;
}

/**
 * A product's address in one language:
 * /<lang>/<category slug>/<words>-<reference>, in lowercase. The category slug
 * goes through slugify again, which leaves a valid slug unchanged, so an
 * address can never hold a character that reads back differently.
 */
export function productPath(
  locale: Locale,
  categorySlug: string,
  name: string,
  reference: string,
): string {
  const words = productWords(name, reference);
  const ref = reference.toLowerCase();
  return `/${locale}/${slugify(categorySlug)}/${words ? `${words}-${ref}` : ref}`;
}

/**
 * The reference at the end of a product address's last segment, or null when
 * that word cannot be a reference. Any letter case is accepted here: the page
 * then redirects to the address in lowercase.
 */
export function parseProductSegment(segment: string): string | null {
  const reference = segment.slice(segment.lastIndexOf("-") + 1).toUpperCase();
  return isProductReference(reference) ? reference : null;
}

type PerLocaleText = Partial<Record<string, string | null | undefined>>;

/** What a product's names and addresses are built from. */
export type ProductNaming = {
  reference: string;
  /** A showcase product's stored names, or null for an ordinary product. */
  showcaseNames: PerLocaleText | null;
  categoryNames: PerLocaleText;
  categorySlugs: PerLocaleText;
  brand: string;
};

/**
 * A translated value, falling back to the French source as Payload does when
 * a language is missing; a value missing in French too is an error, not an
 * address made of nothing.
 */
function inLocale(values: PerLocaleText, locale: Locale, field: string) {
  const value = values[locale] || values.fr;
  if (!value) throw new Error(`No ${field} in ${locale} or in French.`);
  return value;
}

/**
 * A product's name and address in each language. An ordinary product's name
 * is its part type, its brand and its reference (ADR 0007); a showcase
 * product's is its stored name, in that language or else in French, like
 * Payload's own fallback. The page's heading reads these names too.
 */
export function productAddresses(naming: ProductNaming): {
  names: Record<Locale, string>;
  paths: Record<Locale, string>;
} {
  const names = perLocale((locale) => {
    const stored = naming.showcaseNames?.[locale] || naming.showcaseNames?.fr;
    return stored
      ? stored
      : productName(
          inLocale(naming.categoryNames, locale, "category name"),
          naming.brand,
          naming.reference,
        );
  });
  const paths = perLocale((locale) =>
    productPath(
      locale,
      inLocale(naming.categorySlugs, locale, "category slug"),
      names[locale],
      naming.reference,
    ),
  );
  return { names, paths };
}

/** A language's home page. */
export const homePath = (locale: Locale): string => `/${locale}`;

/**
 * Each language's version of a page, for alternates.languages, with x-default
 * pointing to the given address (ADR 0011).
 */
export function languageAlternates(
  paths: Record<Locale, string>,
  xDefault: string,
): Record<Locale | "x-default", string> {
  return { ...paths, "x-default": xDefault };
}

/** Builds a record with one entry per language. */
export function perLocale<T>(make: (locale: Locale) => T): Record<Locale, T> {
  return Object.fromEntries(
    locales.map((locale) => [locale, make(locale)]),
  ) as Record<Locale, T>;
}
