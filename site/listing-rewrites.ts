// The query rewrites of sorted and filtered category pages (issue #148):
// /<lang>/<section>[/<n>]?sort=…&brand=… is served at the internal address
// /<lang>/<section>/~<sort>~<brand>/<n> by the numbered-page route, which
// reads only its path, so each combination is rendered once and cached like
// a numbered category page, and the plain pages stay built in advance. beforeFiles rewrites run before any page is
// matched, and an unknown value matches no rule, so it shows the plain page.
// Pure, with no Next.js import, so the unit tests read it too.
import { locales } from "../cms/locales.ts";
import { ANY_BRAND, LISTING_SORTS, VIEW_MARK } from "./addresses.ts";

type Has = { type: "query"; key: string; value: string };
export type ListingRewrite = {
  source: string;
  has: Has[];
  missing?: { type: "query"; key: string }[];
  destination: string;
};

const LANG = `:lang(${locales.join("|")})`;
const SECTION = ":section([a-z0-9][a-z0-9-]*)";
const PAGE = ":page([0-9]+)";
const SORT: Has = {
  type: "query",
  key: "sort",
  // Reference order is the default, so it needs no internal route.
  value: `(?<sort>${LISTING_SORTS.filter((s) => s !== "reference").join("|")})`,
};
const BRAND: Has = {
  type: "query",
  key: "brand",
  value: "(?<brand>[a-z0-9]+)",
};

/**
 * The rewrites, most specific first. Each rewritten address has more
 * segments than any source, so no later rule matches it again. A search
 * query (q) is never rewritten, so the search page keeps it.
 */
export function listingRewrites(): ListingRewrite[] {
  const target = (sort: string, brand: string, page: string) =>
    `/:lang/:section/${VIEW_MARK}${sort}${VIEW_MARK}${brand}/${page}`;
  const views = [
    { has: [SORT, BRAND], sort: ":sort", brand: ":brand" },
    { has: [SORT], sort: ":sort", brand: ANY_BRAND },
    { has: [BRAND], sort: "reference", brand: ":brand" },
  ];
  return views.flatMap(({ has, sort, brand }) => [
    {
      source: `/${LANG}/${SECTION}/${PAGE}`,
      has,
      missing: [{ type: "query" as const, key: "q" }],
      destination: target(sort, brand, ":page"),
    },
    {
      source: `/${LANG}/${SECTION}`,
      has,
      missing: [{ type: "query" as const, key: "q" }],
      destination: target(sort, brand, "1"),
    },
  ]);
}
