// The part finder moves onto the home page and its own page is removed
// (issue #196), so no promotion may lead to it any more. Hand-written first:
// - every promotion that led to the finder leads to the brand index instead;
// - the first seeded slide gets its new text in the ten languages (owner
//   decision, 2026-11-17), written by agents with no DeepL characters spent,
//   only in the languages whose headline is still the seed's
//   (20261116_000000_promotion_seed.ts), so an editor's text is kept.
// Then Payload's generated statements remove 'finder' from the link choices.
// The data is written here, not imported, so this migration stays the same
// whatever the site's code becomes.
import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

type Text = { headline: string; text: string };

/** The finder slide's seeded headline, per language. */
const OLD_HEADLINES: Record<string, string> = {
  fr: "Trouvez la bonne pièce en trois étapes",
  en: "Find the right part in three steps",
  de: "Das passende Teil in drei Schritten",
  es: "Encuentre la pieza correcta en tres pasos",
  it: "Trovate il ricambio giusto in tre passi",
  nl: "Vind het juiste onderdeel in drie stappen",
  pt: "Encontre a peça certa em três passos",
  pl: "Znajdź właściwą część w trzech krokach",
  sv: "Hitta rätt reservdel i tre steg",
  da: "Find den rigtige reservedel i tre trin",
};

/** Its new text, leading to the brand index. */
const NEW_TEXTS: Record<string, Text> = {
  fr: {
    headline: "Des pièces pour 60 marques",
    text: "Choisissez la marque de votre appareil : sa page liste toutes ses pièces, avec leur prix.",
  },
  en: {
    headline: "Parts for 60 brands",
    text: "Choose your appliance’s brand: its page lists all its parts, with their prices.",
  },
  de: {
    headline: "Ersatzteile für 60 Marken",
    text: "Wählen Sie die Marke Ihres Geräts: Ihre Seite listet alle Teile mit ihren Preisen auf.",
  },
  es: {
    headline: "Piezas para 60 marcas",
    text: "Elija la marca de su aparato: su página muestra todas sus piezas, con sus precios.",
  },
  it: {
    headline: "Ricambi per 60 marche",
    text: "Scegliete la marca del vostro apparecchio: la sua pagina elenca tutti i ricambi, con i prezzi.",
  },
  nl: {
    headline: "Onderdelen voor 60 merken",
    text: "Kies het merk van uw apparaat: de pagina van het merk toont al zijn onderdelen, met hun prijs.",
  },
  pt: {
    headline: "Peças para 60 marcas",
    text: "Escolha a marca do seu aparelho: a página da marca lista todas as suas peças, com os preços.",
  },
  pl: {
    headline: "Części do 60 marek",
    text: "Wybierz markę swojego urządzenia: jej strona pokazuje wszystkie części wraz z cenami.",
  },
  sv: {
    headline: "Reservdelar för 60 varumärken",
    text: "Välj märket på din apparat: märkets sida visar alla dess delar, med priser.",
  },
  da: {
    headline: "Reservedele til 60 mærker",
    text: "Vælg mærket på dit apparat: mærkets side viser alle dets dele med priser.",
  },
};

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const { rows } = await db.execute<{ id: number }>(sql`
    UPDATE promotions SET link_to = 'brands', category = NULL
     WHERE link_to = 'finder'
    RETURNING id
  `);
  for (const { id } of rows)
    for (const [locale, { headline, text }] of Object.entries(NEW_TEXTS))
      await db.execute(sql`
        UPDATE promotions_locales SET headline = ${headline}, text = ${text}
         WHERE _parent_id = ${id} AND _locale = ${locale}
           AND headline = ${OLD_HEADLINES[locale]}
      `);
  await db.execute(sql`
   ALTER TABLE "promotions" ALTER COLUMN "link_to" SET DATA TYPE text;
  DROP TYPE "public"."enum_promotions_link_to";
  CREATE TYPE "public"."enum_promotions_link_to" AS ENUM('category', 'brands');
  ALTER TABLE "promotions" ALTER COLUMN "link_to" SET DATA TYPE "public"."enum_promotions_link_to" USING "link_to"::"public"."enum_promotions_link_to";`);
}

// Down gives the choice back; the promotions keep leading to the brand index.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_promotions_link_to" ADD VALUE 'finder';`);
}
