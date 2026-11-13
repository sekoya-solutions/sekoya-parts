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
 * back unchanged, with at least one letter, so a number after a category slug
 * is always a category page (issue #81). Payload checks it when a product is
 * saved.
 */
export const PRODUCT_REFERENCE = /^(?=[0-9]*[A-Z])[A-Z0-9]+$/;

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

/**
 * The section word of model addresses in each language (ADR 0011). Each is a
 * valid category slug's form, and Payload refuses a category slug equal to
 * any of them, so a section is never both a category and the model section.
 */
export const MODEL_WORDS: Record<Locale, string> = {
  fr: "appareil",
  en: "appliance",
  de: "geraet",
  es: "aparato",
  it: "apparecchio",
  nl: "apparaat",
  pt: "aparelho",
  pl: "urzadzenie",
  sv: "apparat",
  da: "apparat",
};

const modelWords = new Set(Object.values(MODEL_WORDS));

/** Whether a section is the model section, in any language. */
export const isModelWord = (section: string): boolean =>
  modelWords.has(section.toLowerCase());

/**
 * The rule for brand slugs: lowercase letters and digits, with no hyphen, so
 * the brand is always the first hyphen-separated word of a model address.
 * Payload checks it when a brand is saved.
 */
export const BRAND_SLUG = /^[a-z0-9]+$/;

/**
 * The rule for model references, which the generator writes: groups of
 * uppercase letters and digits joined by single hyphens, such as AB00K1-42.
 */
export const MODEL_REFERENCE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

/** A model's stable key: its brand's slug and its reference, unique together. */
export type ModelKey = { brandSlug: string; reference: string };

/** A model's address in one language: /<lang>/<model word>/<brand>-<reference>. */
export function modelPath(locale: Locale, key: ModelKey): string {
  return `/${locale}/${MODEL_WORDS[locale]}/${key.brandSlug}-${key.reference.toLowerCase()}`;
}

/** A model's address in each language. */
export const modelPaths = (key: ModelKey): Record<Locale, string> =>
  perLocale((locale) => modelPath(locale, key));

/**
 * The model key of a model address's last segment, or null when it cannot be
 * one. The brand slug has no hyphen, so it ends at the first one; the rest is
 * the reference. Any letter case is accepted here: the page then redirects to
 * the address in lowercase.
 */
export function parseModelSegment(segment: string): ModelKey | null {
  const lower = segment.toLowerCase();
  const hyphen = lower.indexOf("-");
  if (hyphen < 0) return null;
  const brandSlug = lower.slice(0, hyphen);
  const reference = lower.slice(hyphen + 1).toUpperCase();
  return BRAND_SLUG.test(brandSlug) && MODEL_REFERENCE.test(reference)
    ? { brandSlug, reference }
    : null;
}

/** References on each numbered reference page (ADR 0009). */
export const REFERENCES_PER_PAGE = 500;

/**
 * The ranks a reference page reads: page n holds ranks (n − 1) × 500 + 1 to
 * n × 500, so pages start at rank 1 (ADR 0009, owner decision on issue #79).
 */
export const referencePageRanks = (page: number) => ({
  first: (page - 1) * REFERENCES_PER_PAGE + 1,
  last: page * REFERENCES_PER_PAGE,
});

/** The number of reference pages for a product with this many references. */
export const referencePageCount = (references: number): number =>
  Math.ceil(references / REFERENCES_PER_PAGE);

/** A reference page's address: the product's address followed by /<n>. */
export const referencePagePath = (productPath: string, page: number) =>
  `${productPath}/${page}`;

/**
 * A reference page's number, or null for anything but a positive whole number
 * written without a sign or leading zero, which the page answers with a 404.
 */
export function parsePageNumber(segment: string): number | null {
  if (!/^[1-9][0-9]{0,6}$/.test(segment)) return null;
  return Number(segment);
}

/** Products on each category page (owner decision on issue #81). */
export const PRODUCTS_PER_CATEGORY_PAGE = 48;

/**
 * A category page's address: /<lang>/<category slug> for page 1, then
 * /<lang>/<category slug>/<n> (issue #81). The slug goes through slugify, as
 * in product addresses.
 */
export function categoryPath(
  locale: Locale,
  categorySlug: string,
  page = 1,
): string {
  const path = `/${locale}/${slugify(categorySlug)}`;
  return page === 1 ? path : `${path}/${page}`;
}

/**
 * The number of pages of a category with this many products. A category with
 * no product still has its first page, which lists nothing.
 */
export const categoryPageCount = (products: number): number =>
  Math.max(1, Math.ceil(products / PRODUCTS_PER_CATEGORY_PAGE));

/**
 * Whether the segment after a section is made of digits only, so it names a
 * category page rather than a product, whose reference holds a letter.
 * parsePageNumber then reads it, or refuses a form such as 01.
 */
export const isPageSegment = (segment: string): boolean =>
  /^[0-9]+$/.test(segment);

/** A category's names and slugs in each language, French filling any gap. */
export type CategoryNaming = {
  id: number;
  names: Record<Locale, string>;
  slugs: Record<Locale, string>;
};

/**
 * The category a section names, found by its slug in any letter case: in the
 * address's language first, then in any language, the categories taken in the
 * order given, so the page can redirect to its slug in the address's language.
 * Null when no category has that slug.
 */
export function findCategory(
  categories: readonly CategoryNaming[],
  locale: Locale,
  section: string,
): CategoryNaming | null {
  const slug = section.toLowerCase();
  return (
    categories.find((category) => category.slugs[locale] === slug) ??
    categories.find((category) =>
      locales.some((other) => category.slugs[other] === slug),
    ) ??
    null
  );
}
