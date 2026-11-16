// The recently viewed products (issue #162), kept in the visitor's browser
// only, in local storage: never sent to the server, so the product page stays
// the same static output for everyone (docs/adr/0013-visitor-state.md). Pure
// functions, with no browser or framework code, so the unit tests read them;
// site/recently-viewed.tsx does the storage access.
//
// A stored value can be malformed, from an older version or edited by hand,
// so every read checks each entry and drops the ones that fail. React renders
// the names as text, never as HTML, and an address is only kept when it has
// the exact shape of a product address in its language, so no link can lead
// off the site or run a script.
import { type Locale, locales } from "../cms/locales.ts";
import { PRODUCT_REFERENCE } from "./product-reference.ts";

/** The local storage key, versioned so a later shape can drop older values. */
export const HISTORY_KEY = "sekoya-parts:recently-viewed:v1";

/** The most products remembered, across languages. */
export const HISTORY_SIZE = 10;

/** The longest name or address kept; real ones are far shorter. */
const MAX_TEXT = 200;
const MAX_REFERENCE = 40;

/** One viewed product, in the language its page was read in. */
export type HistoryEntry = {
  reference: string;
  locale: Locale;
  name: string;
  path: string;
};

/** Lowercase ASCII words joined by single hyphens, as slugify gives. */
const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const PRODUCT_PATH = new RegExp(`^/([a-z]{2})/${SLUG}/(${SLUG})$`);

const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (locales as readonly string[]).includes(value);

/** No control characters, which a real product name never has. */
const isText = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= MAX_TEXT &&
  !/\p{Cc}/u.test(value);

/**
 * A product address in its language: /<lang>/<category slug>/<words>-<ref>,
 * whose last word reads back as the entry's reference (site/addresses.ts).
 */
export function isProductPath(
  path: unknown,
  locale: Locale,
  reference: string,
): boolean {
  if (typeof path !== "string" || path.length > MAX_TEXT) return false;
  const match = PRODUCT_PATH.exec(path);
  if (!match || match[1] !== locale) return false;
  const segment = match[2] as string;
  return (
    segment.slice(segment.lastIndexOf("-") + 1).toUpperCase() === reference
  );
}

/** An entry as stored, or null when any field fails its check. */
export function checkEntry(value: unknown): HistoryEntry | null {
  if (value === null || typeof value !== "object") return null;
  const { reference, locale, name, path } = value as Record<string, unknown>;
  if (
    typeof reference !== "string" ||
    reference.length > MAX_REFERENCE ||
    !PRODUCT_REFERENCE.test(reference) ||
    !isLocale(locale) ||
    !isText(name) ||
    !isProductPath(path, locale, reference)
  )
    return null;
  return { reference, locale, name, path: path as string };
}

/**
 * The stored history, newest first: the valid entries of a stored value, at
 * most HISTORY_SIZE, each reference once (its newest entry). Anything that is
 * not the expected JSON gives an empty history.
 */
export function parseHistory(raw: string | null): HistoryEntry[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entries: HistoryEntry[] = [];
  for (const item of value) {
    const entry = checkEntry(item);
    if (!entry || seen.has(entry.reference)) continue;
    seen.add(entry.reference);
    entries.push(entry);
    if (entries.length === HISTORY_SIZE) break;
  }
  return entries;
}

/**
 * The history once a product is viewed: it moves first, in the language just
 * read, and the oldest entry drops beyond HISTORY_SIZE.
 */
export const remember = (
  history: HistoryEntry[],
  viewed: HistoryEntry,
): HistoryEntry[] =>
  [
    viewed,
    ...history.filter((entry) => entry.reference !== viewed.reference),
  ].slice(0, HISTORY_SIZE);

/**
 * What a product page shows: the other products viewed in the page's
 * language, newest first. An entry from another language stays stored, for
 * that language's pages.
 */
export const shownHistory = (
  history: HistoryEntry[],
  locale: Locale,
  current: string,
): HistoryEntry[] =>
  history.filter(
    (entry) => entry.locale === locale && entry.reference !== current,
  );
