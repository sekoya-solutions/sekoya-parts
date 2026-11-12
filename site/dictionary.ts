// Interface labels, one JSON dictionary per language in site/dictionaries,
// loaded on the server (docs/adr/0011-languages-and-seo.md). French is the
// source: its keys are the ones every language must have, which
// tests/dictionaries.test.ts checks.
import type { Locale } from "../cms/locales.ts";
import da from "./dictionaries/da.json" with { type: "json" };
import de from "./dictionaries/de.json" with { type: "json" };
import en from "./dictionaries/en.json" with { type: "json" };
import es from "./dictionaries/es.json" with { type: "json" };
import fr from "./dictionaries/fr.json" with { type: "json" };
import it from "./dictionaries/it.json" with { type: "json" };
import nl from "./dictionaries/nl.json" with { type: "json" };
import pl from "./dictionaries/pl.json" with { type: "json" };
import pt from "./dictionaries/pt.json" with { type: "json" };
import sv from "./dictionaries/sv.json" with { type: "json" };

export type Dictionary = typeof fr;

export const dictionaries: Record<Locale, Dictionary> = {
  fr,
  en,
  de,
  es,
  it,
  nl,
  pt,
  pl,
  sv,
  da,
};

export const getDictionary = (locale: Locale): Dictionary =>
  dictionaries[locale];
