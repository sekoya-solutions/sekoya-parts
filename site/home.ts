// The home pages' language versions (docs/adr/0011-languages-and-seo.md):
// one per language, with the bare domain's language list as x-default.
import type { Metadata } from "next";
import { homePath, languageAlternates, perLocale } from "./addresses.ts";

export const homeAlternates = (
  canonical: string,
): NonNullable<Metadata["alternates"]> => ({
  canonical,
  languages: languageAlternates(perLocale(homePath), "/"),
});
