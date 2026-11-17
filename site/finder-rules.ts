// The home page's part finder (issue #196): the rules its browser component
// (site/home-finder.tsx) and its models route (app/(site)/api/models/route.ts)
// share. Pure, with no Payload, Next.js or React import, so the browser loads
// it and the unit tests read it.

/** Where the model field asks for its list. */
export const MODELS_ROUTE = "/api/models";

/** The models route's query parameters. */
export const FINDER_QUERY = {
  lang: "lang",
  brand: "brand",
  type: "type",
  q: "q",
} as const;

/** The longest text the model field sends; no reference is longer. */
export const MAX_MODEL_QUERY = 64;

/** What the models route answers. */
export type FinderModels = {
  /** True for the pair's most popular models, false for a search's matches. */
  popular: boolean;
  models: { reference: string; path: string }[];
};

/** The models route's address for a brand, a type and the field's text. */
export function modelsUrl(
  lang: string,
  brand: string,
  type: string,
  query: string,
): string {
  const params = new URLSearchParams({
    [FINDER_QUERY.lang]: lang,
    [FINDER_QUERY.brand]: brand,
    [FINDER_QUERY.type]: type,
  });
  const q = query.trim();
  if (q) params.set(FINDER_QUERY.q, q);
  return `${MODELS_ROUTE}?${params}`;
}

/** Text compared without letter case or accents: "Bé" matches "BEKO". */
export const foldText = (text: string): string =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/**
 * The options whose name holds the typed text, those starting with it first,
 * each group in its given order. Empty text keeps every option.
 */
export function filterByName<T extends { name: string }>(
  options: readonly T[],
  text: string,
): T[] {
  const typed = foldText(text);
  if (!typed) return [...options];
  const starting: T[] = [];
  const containing: T[] = [];
  for (const option of options) {
    const name = foldText(option.name);
    if (name.startsWith(typed)) starting.push(option);
    else if (name.includes(typed)) containing.push(option);
  }
  return [...starting, ...containing];
}
