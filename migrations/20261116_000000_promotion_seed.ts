import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

// The home page's first promotions (issue #155): three slides and three tiles
// over the owner's images, with texts written in French and translated by
// agents, no DeepL characters spent. Each links to the category its image
// shows, by the generator's English slug, or to the part finder; editors
// change them in Payload afterwards. The data is written here, not imported, so
// this migration stays the same whatever the site's code becomes.
type Text = { headline: string; text: string };
type Seed = {
  kind: "slide" | "tile";
  image: number;
  order: number;
  linkTo: "category" | "finder";
  category?: string;
  texts: Record<string, Text>;
};

const SEEDS: Seed[] = [
  {
    kind: "slide",
    image: 1,
    order: 1,
    linkTo: "finder",
    texts: {
      fr: {
        headline: "Trouvez la bonne pièce en trois étapes",
        text: "Marque, type d’appareil, modèle : la page de votre modèle liste toutes les pièces compatibles.",
      },
      en: {
        headline: "Find the right part in three steps",
        text: "Brand, appliance type, model: your model’s page lists every compatible part.",
      },
      de: {
        headline: "Das passende Teil in drei Schritten",
        text: "Marke, Gerätetyp, Modell: Die Seite Ihres Modells listet alle passenden Teile auf.",
      },
      es: {
        headline: "Encuentre la pieza correcta en tres pasos",
        text: "Marca, tipo de aparato, modelo: la página de su modelo muestra todas las piezas compatibles.",
      },
      it: {
        headline: "Trovate il ricambio giusto in tre passi",
        text: "Marca, tipo di apparecchio, modello: la pagina del vostro modello elenca tutti i ricambi compatibili.",
      },
      nl: {
        headline: "Vind het juiste onderdeel in drie stappen",
        text: "Merk, type apparaat, model: de pagina van uw model toont alle passende onderdelen.",
      },
      pt: {
        headline: "Encontre a peça certa em três passos",
        text: "Marca, tipo de aparelho, modelo: a página do seu modelo lista todas as peças compatíveis.",
      },
      pl: {
        headline: "Znajdź właściwą część w trzech krokach",
        text: "Marka, rodzaj urządzenia, model: strona modelu pokazuje wszystkie pasujące części.",
      },
      sv: {
        headline: "Hitta rätt reservdel i tre steg",
        text: "Varumärke, typ av apparat, modell: modellens sida visar alla delar som passar.",
      },
      da: {
        headline: "Find den rigtige reservedel i tre trin",
        text: "Mærke, type apparat, model: modellens side viser alle dele, der passer.",
      },
    },
  },
  {
    kind: "slide",
    image: 2,
    order: 2,
    linkTo: "category",
    category: "heating-element",
    texts: {
      fr: {
        headline: "Votre four ne chauffe plus ?",
        text: "Résistances pour fours, lave-linge et lave-vaisselle, avec la liste des modèles compatibles.",
      },
      en: {
        headline: "Oven not heating any more?",
        text: "Heating elements for ovens, washing machines and dishwashers, with their compatible models.",
      },
      de: {
        headline: "Ihr Backofen heizt nicht mehr?",
        text: "Heizelemente für Backöfen, Waschmaschinen und Geschirrspüler, mit den passenden Modellen.",
      },
      es: {
        headline: "¿Su horno ya no calienta?",
        text: "Resistencias para hornos, lavadoras y lavavajillas, con sus modelos compatibles.",
      },
      it: {
        headline: "Il forno non scalda più?",
        text: "Resistenze per forni, lavatrici e lavastoviglie, con i modelli compatibili.",
      },
      nl: {
        headline: "Wordt uw oven niet meer warm?",
        text: "Verwarmingselementen voor ovens, wasmachines en vaatwassers, met de passende modellen.",
      },
      pt: {
        headline: "O seu forno já não aquece?",
        text: "Resistências para fornos, máquinas de lavar roupa e loiça, com os modelos compatíveis.",
      },
      pl: {
        headline: "Piekarnik przestał grzać?",
        text: "Grzałki do piekarników, pralek i zmywarek, z listą zgodnych modeli.",
      },
      sv: {
        headline: "Blir ugnen inte varm längre?",
        text: "Värmeelement till ugnar, tvättmaskiner och diskmaskiner, med modellerna de passar.",
      },
      da: {
        headline: "Bliver ovnen ikke varm længere?",
        text: "Varmelegemer til ovne, vaskemaskiner og opvaskemaskiner, med de modeller, de passer til.",
      },
    },
  },
  {
    kind: "slide",
    image: 3,
    order: 3,
    linkTo: "category",
    category: "thermostat",
    texts: {
      fr: {
        headline: "La bonne température, à nouveau",
        text: "Thermostats de four, de réfrigérateur et de sèche-linge.",
      },
      en: {
        headline: "The right temperature, again",
        text: "Thermostats for ovens, refrigerators and dryers.",
      },
      de: {
        headline: "Wieder die richtige Temperatur",
        text: "Thermostate für Backöfen, Kühlschränke und Wäschetrockner.",
      },
      es: {
        headline: "De nuevo la temperatura justa",
        text: "Termostatos para hornos, frigoríficos y secadoras.",
      },
      it: {
        headline: "Di nuovo la temperatura giusta",
        text: "Termostati per forni, frigoriferi e asciugatrici.",
      },
      nl: {
        headline: "Weer de juiste temperatuur",
        text: "Thermostaten voor ovens, koelkasten en drogers.",
      },
      pt: {
        headline: "De novo a temperatura certa",
        text: "Termóstatos para fornos, frigoríficos e máquinas de secar.",
      },
      pl: {
        headline: "Znów właściwa temperatura",
        text: "Termostaty do piekarników, lodówek i suszarek.",
      },
      sv: {
        headline: "Rätt temperatur igen",
        text: "Termostater till ugnar, kylskåp och torktumlare.",
      },
      da: {
        headline: "Den rigtige temperatur igen",
        text: "Termostater til ovne, køleskabe og tørretumblere.",
      },
    },
  },
  {
    kind: "tile",
    image: 1,
    order: 4,
    linkTo: "category",
    category: "drain-pump",
    texts: {
      fr: {
        headline: "Pompes de vidange",
        text: "Pour un lave-linge ou un lave-vaisselle qui ne vidange plus.",
      },
      en: {
        headline: "Drain pumps",
        text: "For a washing machine or dishwasher that no longer drains.",
      },
      de: {
        headline: "Laugenpumpen",
        text: "Für Waschmaschinen und Geschirrspüler, die nicht mehr abpumpen.",
      },
      es: {
        headline: "Bombas de desagüe",
        text: "Para una lavadora o un lavavajillas que ya no desagua.",
      },
      it: {
        headline: "Pompe di scarico",
        text: "Per una lavatrice o una lavastoviglie che non scarica più.",
      },
      nl: {
        headline: "Afvoerpompen",
        text: "Voor een wasmachine of vaatwasser die niet meer afpompt.",
      },
      pt: {
        headline: "Bombas de esgoto",
        text: "Para uma máquina de lavar que já não escoa a água.",
      },
      pl: {
        headline: "Pompy odpływowe",
        text: "Do pralki lub zmywarki, która nie odprowadza już wody.",
      },
      sv: {
        headline: "Avloppspumpar",
        text: "För en tvätt- eller diskmaskin som inte längre tömmer ut vattnet.",
      },
      da: {
        headline: "Afløbspumper",
        text: "Til en vaske- eller opvaskemaskine, der ikke længere tømmer vandet ud.",
      },
    },
  },
  {
    kind: "tile",
    image: 2,
    order: 5,
    linkTo: "category",
    category: "knob",
    texts: {
      fr: {
        headline: "Boutons et manettes",
        text: "Un bouton cassé se remplace en quelques secondes.",
      },
      en: {
        headline: "Knobs and buttons",
        text: "A broken knob is replaced in seconds.",
      },
      de: {
        headline: "Knöpfe und Schalter",
        text: "Ein gebrochener Knopf ist in Sekunden ersetzt.",
      },
      es: {
        headline: "Mandos y botones",
        text: "Un mando roto se cambia en unos segundos.",
      },
      it: {
        headline: "Manopole e pulsanti",
        text: "Una manopola rotta si sostituisce in pochi secondi.",
      },
      nl: {
        headline: "Knoppen",
        text: "Een kapotte knop vervangt u in enkele seconden.",
      },
      pt: {
        headline: "Botões e manípulos",
        text: "Um botão partido substitui-se em segundos.",
      },
      pl: {
        headline: "Pokrętła i przyciski",
        text: "Złamane pokrętło wymienisz w kilka sekund.",
      },
      sv: {
        headline: "Vred och knappar",
        text: "Ett trasigt vred byts på några sekunder.",
      },
      da: {
        headline: "Knapper og drejeknapper",
        text: "En knækket knap skiftes på få sekunder.",
      },
    },
  },
  {
    kind: "tile",
    image: 3,
    order: 6,
    linkTo: "category",
    category: "filter",
    texts: {
      fr: {
        headline: "Filtres",
        text: "Filtres à graisse, à eau et à peluches.",
      },
      en: {
        headline: "Filters",
        text: "Grease, water and lint filters.",
      },
      de: {
        headline: "Filter",
        text: "Fett-, Wasser- und Flusenfilter.",
      },
      es: {
        headline: "Filtros",
        text: "Filtros de grasa, de agua y de pelusas.",
      },
      it: {
        headline: "Filtri",
        text: "Filtri antigrasso, per l’acqua e per la lanugine.",
      },
      nl: {
        headline: "Filters",
        text: "Vet-, water- en pluizenfilters.",
      },
      pt: {
        headline: "Filtros",
        text: "Filtros de gordura, de água e de cotão.",
      },
      pl: {
        headline: "Filtry",
        text: "Filtry przeciwtłuszczowe, wody i kłaczków.",
      },
      sv: {
        headline: "Filter",
        text: "Fett-, vatten- och luddfilter.",
      },
      da: {
        headline: "Filtre",
        text: "Fedt-, vand- og fnugfiltre.",
      },
    },
  },
];

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const seed of SEEDS) {
    const { rows } = await db.execute<{ id: number }>(sql`
      INSERT INTO promotions (kind, image, link_to, category, "order")
      VALUES (${seed.kind}, ${seed.image}, ${seed.linkTo},
              ${seed.category ?? null}, ${seed.order})
      RETURNING id
    `);
    const id = rows[0]?.id;
    if (id === undefined) throw new Error("A promotion was not inserted.");
    for (const [locale, { headline, text }] of Object.entries(seed.texts))
      await db.execute(sql`
        INSERT INTO promotions_locales (headline, text, _locale, _parent_id)
        VALUES (${headline}, ${text}, ${locale}, ${id})
      `);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DELETE FROM promotions`);
}
