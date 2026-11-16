// The site's addresses (docs/adr/0011-languages-and-seo.md): every page sits
// under its language, and a product's address carries translated words before
// its reference, the stable key the page is found by. Pure functions with no
// Payload or Next.js imports, so the unit and end-to-end tests read them too.
import {
  type ApplianceType,
  applianceTypes,
  slugify,
} from "../catalog/generator.ts";
import { productName } from "../catalog/text.ts";
import { type Locale, locales } from "../cms/locales.ts";
import { FIT_PARAMS } from "./fit-params.ts";

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
 * The section word of the search results page in each language (ADR 0010,
 * issue #113): /<lang>/<search word>?q=<query>. Like the model words, each
 * is a valid category slug's form, and Payload refuses a category slug equal
 * to any of them.
 */
export const SEARCH_WORDS: Record<Locale, string> = {
  fr: "recherche",
  en: "search",
  de: "suche",
  es: "busqueda",
  it: "ricerca",
  nl: "zoeken",
  pt: "pesquisa",
  pl: "szukaj",
  sv: "sok",
  da: "sog",
};

const searchWords = new Set(Object.values(SEARCH_WORDS));

/** Whether a section is the search page's, in any language. */
export const isSearchWord = (section: string): boolean =>
  searchWords.has(section.toLowerCase());

/** The search results page in one language, for a query if one is given. */
export function searchPath(locale: Locale, query?: string): string {
  const path = `/${locale}/${SEARCH_WORDS[locale]}`;
  return query ? `${path}?q=${encodeURIComponent(query)}` : path;
}

/**
 * The part finder's page in each language (issue #155): brand, then
 * appliance type, then the model, as query parameters of one page, like the
 * search page. Each is a valid category slug's form, and Payload refuses a
 * category slug equal to any of them.
 */
export const FINDER_WORDS: Record<Locale, string> = {
  fr: "trouver-une-piece",
  en: "find-a-part",
  de: "teil-finden",
  es: "buscar-una-pieza",
  it: "trova-un-ricambio",
  nl: "onderdeel-vinden",
  pt: "encontrar-uma-peca",
  pl: "znajdz-czesc",
  sv: "hitta-en-reservdel",
  da: "find-en-reservedel",
};

const finderWords = new Set(Object.values(FINDER_WORDS));

/** Whether a section is the part finder's, in any language. */
export const isFinderWord = (section: string): boolean =>
  finderWords.has(section.toLowerCase());

/**
 * The fit check's result page in each language (issue #161):
 * /<lang>/<fit word>?part=<product reference>&q=<model reference>, where the
 * product page's "Does it fit my appliance?" form leads without JavaScript.
 * Each is a valid category slug's form, and Payload refuses a category slug
 * equal to any of them.
 */
export const FIT_WORDS: Record<Locale, string> = {
  fr: "compatibilite",
  en: "does-it-fit",
  de: "passt-es",
  es: "compatibilidad",
  it: "compatibilita",
  nl: "past-het",
  pt: "compatibilidade",
  pl: "czy-pasuje",
  sv: "passar-den",
  da: "passer-den",
};

const fitWords = new Set(Object.values(FIT_WORDS));

/** Whether a section is the fit check's result page, in any language. */
export const isFitWord = (section: string): boolean =>
  fitWords.has(section.toLowerCase());

export { FIT_PARAMS };

/** The fit check's result page in one language, for a product and a model reference. */
export function fitPath(locale: Locale, part?: string, q?: string): string {
  const params = new URLSearchParams();
  if (part) params.set(FIT_PARAMS.part, part);
  if (q) params.set(FIT_PARAMS.q, q);
  const query = params.toString();
  return `/${locale}/${FIT_WORDS[locale]}${query ? `?${query}` : ""}`;
}

/** How many of a pair's models the finder's third step lists (owner decision). */
export const POPULAR_MODELS = 24;

/** Whether a value is one of the generator's appliance types. */
export const isApplianceType = (value: string): value is ApplianceType =>
  (applianceTypes as readonly string[]).includes(value);

/**
 * The finder's query parameters. Not brand or sort: the query rewrites of
 * category pages (site/listing-rewrites.ts) serve any section's ?brand= or
 * ?sort= as a filtered category view, which would take the finder's page
 * away; they never rewrite a query with q.
 */
export const FINDER_PARAMS = {
  brand: "make",
  type: "appliance",
  q: "q",
} as const;

/** What the finder has been told so far. */
export type FinderChoice = { brand?: string; type?: string; q?: string };

/** The finder's page in one language, with the choices made so far. */
export function finderPath(locale: Locale, choice: FinderChoice = {}): string {
  const params = new URLSearchParams();
  for (const key of ["brand", "type", "q"] as const) {
    const value = choice[key];
    if (value) params.set(FINDER_PARAMS[key], value);
  }
  const query = params.toString();
  return `/${locale}/${FINDER_WORDS[locale]}${query ? `?${query}` : ""}`;
}

/**
 * The section word of brand addresses in each language (issue #147): the
 * brand index at /<lang>/<brand word>, and each brand’s listing at
 * /<lang>/<brand word>/<brand slug>, then /<n>. Like the model and search
 * words, each is a valid category slug’s form, and Payload refuses a
 * category slug equal to any of them.
 */
export const BRAND_WORDS: Record<Locale, string> = {
  fr: "marques",
  en: "brands",
  de: "marken",
  es: "marcas",
  it: "marche",
  nl: "merken",
  pt: "marcas",
  pl: "marki",
  sv: "varumarken",
  da: "maerker",
};

const brandWords = new Set(Object.values(BRAND_WORDS));

/** Whether a section is the brand section, in any language. */
export const isBrandWord = (section: string): boolean =>
  brandWords.has(section.toLowerCase());

/** The brand index in one language. */
export const brandIndexPath = (locale: Locale): string =>
  `/${locale}/${BRAND_WORDS[locale]}`;

/** A brand listing’s address: page 1 without a number, then /<n>. */
export function brandPath(locale: Locale, slug: string, page = 1): string {
  const path = `${brandIndexPath(locale)}/${slug}`;
  return page === 1 ? path : `${path}/${page}`;
}

/**
 * The information pages (issue #143), in the footer's order: help first, then
 * the legal information.
 */
export const INFO_PAGES = [
  "help",
  "delivery",
  "legal",
  "terms",
  "privacy",
  "accessibility",
] as const;

export type InfoPage = (typeof INFO_PAGES)[number];

/**
 * Each information page's slug in each language: /<lang>/<page slug>. Two
 * languages may share a slug for the same page (`privacy`), never for two
 * pages. Like the model and search words, each is a valid category slug's
 * form, and Payload refuses a category slug equal to any of them.
 */
export const INFO_SLUGS: Record<InfoPage, Record<Locale, string>> = {
  help: {
    fr: "aide",
    en: "help",
    de: "hilfe",
    es: "ayuda",
    it: "aiuto",
    nl: "hulp",
    pt: "ajuda",
    pl: "pomoc",
    sv: "hjalp",
    da: "hjaelp",
  },
  delivery: {
    fr: "livraison-et-retours",
    en: "delivery-and-returns",
    de: "versand-und-ruecksendung",
    es: "envios-y-devoluciones",
    it: "spedizioni-e-resi",
    nl: "verzending-en-retour",
    pt: "entregas-e-devolucoes",
    pl: "dostawa-i-zwroty",
    sv: "leverans-och-retur",
    da: "levering-og-returnering",
  },
  legal: {
    fr: "mentions-legales",
    en: "legal-notice",
    de: "impressum",
    es: "aviso-legal",
    it: "note-legali",
    nl: "juridische-informatie",
    pt: "informacao-legal",
    pl: "nota-prawna",
    sv: "juridisk-information",
    da: "juridiske-oplysninger",
  },
  terms: {
    fr: "conditions-de-vente",
    en: "terms-of-sale",
    de: "verkaufsbedingungen",
    es: "condiciones-de-venta",
    it: "condizioni-di-vendita",
    nl: "verkoopvoorwaarden",
    pt: "condicoes-de-venda",
    pl: "warunki-sprzedazy",
    sv: "kopvillkor",
    da: "salgsbetingelser",
  },
  privacy: {
    fr: "confidentialite",
    en: "privacy",
    de: "datenschutz",
    es: "privacidad",
    it: "privacy",
    nl: "privacy",
    pt: "privacidade",
    pl: "prywatnosc",
    sv: "integritet",
    da: "privatliv",
  },
  accessibility: {
    fr: "accessibilite",
    en: "accessibility",
    de: "barrierefreiheit",
    es: "accesibilidad",
    it: "accessibilita",
    nl: "toegankelijkheid",
    pt: "acessibilidade",
    pl: "dostepnosc",
    sv: "tillganglighet",
    da: "tilgaengelighed",
  },
};

const infoPageBySlug = new Map<string, InfoPage>(
  INFO_PAGES.flatMap((page) =>
    Object.values(INFO_SLUGS[page]).map((slug) => [slug, page] as const),
  ),
);

/**
 * The information page a section names, in any language and letter case, or
 * null.
 */
export const infoPageOf = (section: string): InfoPage | null =>
  infoPageBySlug.get(section.toLowerCase()) ?? null;

/** An information page's address in one language. */
export const infoPagePath = (locale: Locale, page: InfoPage): string =>
  `/${locale}/${INFO_SLUGS[page][locale]}`;

/** An information page's address in every language. */
export const infoPagePaths = (page: InfoPage): Record<Locale, string> =>
  perLocale((locale) => infoPagePath(locale, page));

/**
 * Whether a word is reserved for a section of addresses, so no category may
 * take it as its slug.
 */
export const isReservedWord = (section: string): boolean =>
  isModelWord(section) ||
  isSearchWord(section) ||
  isBrandWord(section) ||
  isFinderWord(section) ||
  isFitWord(section) ||
  infoPageOf(section) !== null;

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

/**
 * The orders a category page can be sorted in (issue #148): by reference, the
 * default, or by price either way. The query values are the same in every
 * language.
 */
export const LISTING_SORTS = ["reference", "price-asc", "price-desc"] as const;

export type ListingSort = (typeof LISTING_SORTS)[number];

export const isListingSort = (value: string): value is ListingSort =>
  (LISTING_SORTS as readonly string[]).includes(value);

/** A sorted or filtered view of a category: its order and brand, if any. */
export type ListingView = { sort: ListingSort; brand: string | null };

export const PLAIN_VIEW: ListingView = { sort: "reference", brand: null };

export const isPlainView = (view: ListingView): boolean =>
  view.sort === "reference" && view.brand === null;

/**
 * The mark that starts a view's segment in the internal addresses the query
 * rewrites of next.config.ts lead to (issue #148):
 * /<lang>/<section>/~<sort>~<brand>/<n>, served by the numbered-page route.
 * No product, page number or other segment can hold it.
 */
export const VIEW_MARK = "~";

/** The brand part of a view's segment when no brand is chosen. */
export const ANY_BRAND = "-";

/** Whether a segment is a view's, rather than a product's. */
export const isViewEntry = (entry: string): boolean =>
  entry.startsWith(VIEW_MARK);

/** A view's segment in the internal addresses, such as ~price-asc~-. */
export const viewEntry = (view: ListingView): string =>
  `${VIEW_MARK}${view.sort}${VIEW_MARK}${view.brand ?? ANY_BRAND}`;

/** A view's query string, empty for the plain view. */
export function viewQuery(view: ListingView): string {
  const params = new URLSearchParams();
  if (view.sort !== "reference") params.set("sort", view.sort);
  if (view.brand !== null) params.set("brand", view.brand);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** A category page's address, with the view's query when it is not plain. */
export const categoryViewPath = (
  locale: Locale,
  categorySlug: string,
  page: number,
  view: ListingView,
): string => `${categoryPath(locale, categorySlug, page)}${viewQuery(view)}`;

/**
 * The view a segment names, or null when it cannot be one: no mark, an
 * unknown order, or a brand part that is not a brand slug.
 */
export function parseViewEntry(entry: string): ListingView | null {
  const parts = entry.split(VIEW_MARK);
  if (parts.length !== 3 || parts[0] !== "") return null;
  const [, sort = "", brand = ""] = parts;
  if (!isListingSort(sort)) return null;
  if (brand === ANY_BRAND) return { sort, brand: null };
  return BRAND_SLUG.test(brand) ? { sort, brand } : null;
}
