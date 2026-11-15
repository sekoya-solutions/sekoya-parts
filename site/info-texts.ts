// The information pages' texts (issue #143), one JSON file per language in
// site/info. French is the source, written for the site as it is; agents
// translate the nine other languages in the same pull request, with no DeepL
// characters spent (owner decision, 2026-11-15). tests/info-pages.test.ts
// checks that every language has the same pages, sections and placeholders.
import type { Locale } from "../cms/locales.ts";
import type { InfoPage } from "./addresses.ts";
import da from "./info/da.json" with { type: "json" };
import de from "./info/de.json" with { type: "json" };
import en from "./info/en.json" with { type: "json" };
import es from "./info/es.json" with { type: "json" };
import fr from "./info/fr.json" with { type: "json" };
import it from "./info/it.json" with { type: "json" };
import nl from "./info/nl.json" with { type: "json" };
import pl from "./info/pl.json" with { type: "json" };
import pt from "./info/pt.json" with { type: "json" };
import sv from "./info/sv.json" with { type: "json" };

export type InfoSection = { heading: string; paragraphs: string[] };

export type InfoText = {
  /** The footer link's label. */
  link: string;
  title: string;
  description: string;
  sections: InfoSection[];
};

export const infoTexts: Record<Locale, Record<InfoPage, InfoText>> = {
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

export const getInfoText = (locale: Locale, page: InfoPage): InfoText =>
  infoTexts[locale][page];
