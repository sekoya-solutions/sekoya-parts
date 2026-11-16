// The fit check's query parameters (issue #161), in a module of their own so
// the browser component (site/fit-check.tsx) loads them without the rest of
// site/addresses.ts. Not brand or sort, which the category query rewrites
// take (site/listing-rewrites.ts), as for the finder.
export const FIT_PARAMS = { part: "part", q: "q" } as const;
