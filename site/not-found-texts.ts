// The 404 page's labels in the ten languages (issue #209): the four the
// page shows, copied from the dictionaries, which stay their source;
// tests/not-found-texts.test.ts fails when a copy differs. Next.js loads a
// segment's not-found code with every page under it, so the browser
// component imports these few labels rather than the ten dictionaries,
// which would add about 140 KB of script to every page.
import type { Locale } from "../cms/locales.ts";

export const NOT_FOUND_KEYS = [
  "notFoundTitle",
  "notFoundText",
  "notFoundHome",
  "footerNote",
] as const;

export type NotFoundTexts = Record<(typeof NOT_FOUND_KEYS)[number], string>;

export const NOT_FOUND_TEXTS: Record<Locale, NotFoundTexts> = {
  fr: {
    notFoundTitle: "Page introuvable",
    notFoundText: "Cette adresse ne correspond à aucune page du catalogue.",
    notFoundHome: "Retour à l’accueil",
    footerNote:
      "Catalogue de démonstration : les produits, prix et références sont fictifs.",
  },
  en: {
    notFoundTitle: "Page not found",
    notFoundText: "This address matches no page in the catalog.",
    notFoundHome: "Back to the home page",
    footerNote:
      "Demonstration catalog: products, prices and references are fictitious.",
  },
  de: {
    notFoundTitle: "Seite nicht gefunden",
    notFoundText: "Diese Adresse entspricht keiner Seite des Katalogs.",
    notFoundHome: "Zur Startseite",
    footerNote:
      "Demonstrationskatalog: Produkte, Preise und Referenzen sind fiktiv.",
  },
  es: {
    notFoundTitle: "Página no encontrada",
    notFoundText:
      "Esta dirección no corresponde a ninguna página del catálogo.",
    notFoundHome: "Volver al inicio",
    footerNote:
      "Catálogo de demostración: los productos, precios y referencias son ficticios.",
  },
  it: {
    notFoundTitle: "Pagina non trovata",
    notFoundText:
      "Questo indirizzo non corrisponde a nessuna pagina del catalogo.",
    notFoundHome: "Torna alla home page",
    footerNote:
      "Catalogo dimostrativo: prodotti, prezzi e riferimenti sono fittizi.",
  },
  nl: {
    notFoundTitle: "Pagina niet gevonden",
    notFoundText:
      "Dit adres komt niet overeen met een pagina van de catalogus.",
    notFoundHome: "Terug naar de startpagina",
    footerNote:
      "Demonstratiecatalogus: producten, prijzen en referenties zijn fictief.",
  },
  pt: {
    notFoundTitle: "Página não encontrada",
    notFoundText: "Este endereço não corresponde a nenhuma página do catálogo.",
    notFoundHome: "Voltar à página inicial",
    footerNote:
      "Catálogo de demonstração: os produtos, preços e referências são fictícios.",
  },
  pl: {
    notFoundTitle: "Nie znaleziono strony",
    notFoundText: "Ten adres nie odpowiada żadnej stronie katalogu.",
    notFoundHome: "Powrót do strony głównej",
    footerNote: "Katalog demonstracyjny: produkty, ceny i numery są fikcyjne.",
  },
  sv: {
    notFoundTitle: "Sidan hittades inte",
    notFoundText: "Den här adressen motsvarar ingen sida i katalogen.",
    notFoundHome: "Tillbaka till startsidan",
    footerNote:
      "Demonstrationskatalog: produkter, priser och referenser är fiktiva.",
  },
  da: {
    notFoundTitle: "Siden blev ikke fundet",
    notFoundText: "Denne adresse svarer ikke til nogen side i kataloget.",
    notFoundHome: "Tilbage til forsiden",
    footerNote:
      "Demonstrationskatalog: produkter, priser og referencer er fiktive.",
  },
};
