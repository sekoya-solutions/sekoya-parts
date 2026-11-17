// The page templates, each named on its page's <main> as data-template, so a
// check that reaches a page through a link can tell which template it landed
// on (AGENTS.md, section 3). Lighthouse's checks are named after them and
// stop when a measured page is another template (scripts/lighthouse.ts).
export const TEMPLATES = [
  "home",
  "category",
  "product",
  "references",
  "model",
  "brand",
  "brands",
  "finder",
  "fit",
  "cart",
  "account",
  "sign-up",
  "sign-out",
  "order",
  "checkout",
  "payment",
  "confirmation",
  "search",
  "info",
  "languages",
  "not-found",
] as const;

export type Template = (typeof TEMPLATES)[number];

/** The attribute naming a page's template on its <main>. */
export const TEMPLATE_ATTRIBUTE = "data-template";

export const isTemplate = (value: string): value is Template =>
  (TEMPLATES as readonly string[]).includes(value);
