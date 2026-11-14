// The form a search query is compared to model references in
// (docs/adr/0010-search.md, issue #113): upper case, without spaces or dashes,
// so "ab00k1 42" finds AB00K1-42. Pure, with no Payload or Next.js imports,
// so the unit tests read it too.

/** The most models a results page lists. */
export const MODEL_RESULTS = 20;

/** The longest query the search page reads; a longer one finds nothing. */
export const MAX_QUERY_LENGTH = 100;

/**
 * The SQL expression of a model reference's search key. The index of
 * migrations/20261114_120000_model_search.ts is built on this exact
 * expression, which the planner needs to match to use it.
 */
export const MODEL_SEARCH_KEY = `upper(translate(m.reference, '- ', ''))`;

// Spaces, and the hyphen with the other dashes and minus signs a visitor may
// type or paste.
const SEPARATORS = /[\s\-‐-―−]+/g;

/**
 * A query's search key, or null when it cannot match any model reference:
 * longer than MAX_QUERY_LENGTH, or holding anything but ASCII letters and
 * digits once its separators are removed. The test comes before the upper
 * case, so a letter such as ß, which JavaScript capitalises as SS, never
 * reaches the database.
 */
export function searchKey(query: string): string | null {
  if (query.length > MAX_QUERY_LENGTH) return null;
  const key = query.normalize("NFKC").replace(SEPARATORS, "");
  return /^[A-Za-z0-9]+$/.test(key) ? key.toUpperCase() : null;
}

/** The query of a request's search parameters: the first q, trimmed. */
export function queryOf(q: string | string[] | undefined): string {
  const value = Array.isArray(q) ? q[0] : q;
  return (value ?? "").trim();
}
