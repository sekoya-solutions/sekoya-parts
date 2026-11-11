// The ten languages of docs/adr/0011-languages-and-seo.md; French is the source.
export const locales = [
  "fr",
  "en",
  "de",
  "es",
  "it",
  "nl",
  "pt",
  "pl",
  "sv",
  "da",
] as const;

export type Locale = (typeof locales)[number];
