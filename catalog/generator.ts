// The catalog generator's data (docs/adr/0007-catalog-data-model.md): pure
// functions of a seed and a scale, with no database access. scripts/generate.ts
// loads these rows with COPY.
//
// Each table draws from its own random stream, derived from the seed and the
// table's name, so a table's rows do not depend on the order in which the
// tables are read. Math.random is never used.
import { type Locale, locales } from "../cms/locales.ts";

/** Appliance models at every scale: the million-model product needs them all. */
export const MODEL_COUNT = 1_000_000;

/** The product compatible with every model, at every scale. */
export const MILLION_PRODUCT_ID = 1;

/**
 * A generated product's reference, such as SP000001: uppercase letters and
 * digits only, the rule every product reference follows (site/addresses.ts).
 */
export const productReference = (id: number): string =>
  `SP${String(id).padStart(6, "0")}`;

export const scales = {
  small: { products: 1_000, brands: 20 },
  full: { products: 100_000, brands: 60 },
} as const;

export type ScaleName = keyof typeof scales;

export function isScaleName(value: string): value is ScaleName {
  return Object.hasOwn(scales, value);
}

// ---------------------------------------------------------------------------
// Seeded random numbers

/** A random stream in [0, 1), from the mulberry32 generator. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A 32-bit seed for one table, from the catalog seed and a label (FNV-1a). */
export function deriveSeed(seed: number, label: string): number {
  let hash = 0x811c9dc5;
  for (const char of `${seed}:${label}`) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function randomInt(rng: () => number, size: number): number {
  return Math.floor(rng() * size);
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[randomInt(rng, items.length)];
  if (item === undefined) throw new Error("pick: empty list");
  return item;
}

// ---------------------------------------------------------------------------
// Fixed vocabulary

/** Part types, named in each language. The same twelve at every scale. */
const categoryNames: readonly Record<Locale, string>[] = [
  {
    fr: "Courroie",
    en: "Belt",
    de: "Riemen",
    es: "Correa",
    it: "Cinghia",
    nl: "Riem",
    pt: "Correia",
    pl: "Pasek",
    sv: "Drivrem",
    da: "Drivrem",
  },
  {
    fr: "Joint de porte",
    en: "Door seal",
    de: "Türdichtung",
    es: "Junta de puerta",
    it: "Guarnizione della porta",
    nl: "Deurrubber",
    pt: "Vedante da porta",
    pl: "Uszczelka drzwi",
    sv: "Dörrtätning",
    da: "Dørpakning",
  },
  {
    fr: "Pompe de vidange",
    en: "Drain pump",
    de: "Laugenpumpe",
    es: "Bomba de desagüe",
    it: "Pompa di scarico",
    nl: "Afvoerpomp",
    pt: "Bomba de drenagem",
    pl: "Pompa odpływowa",
    sv: "Tömningspump",
    da: "Afløbspumpe",
  },
  {
    fr: "Résistance",
    en: "Heating element",
    de: "Heizelement",
    es: "Resistencia",
    it: "Resistenza",
    nl: "Verwarmingselement",
    pt: "Resistência",
    pl: "Grzałka",
    sv: "Värmeelement",
    da: "Varmelegeme",
  },
  {
    fr: "Filtre",
    en: "Filter",
    de: "Filter",
    es: "Filtro",
    it: "Filtro",
    nl: "Filter",
    pt: "Filtro",
    pl: "Filtr",
    sv: "Filter",
    da: "Filter",
  },
  {
    fr: "Thermostat",
    en: "Thermostat",
    de: "Thermostat",
    es: "Termostato",
    it: "Termostato",
    nl: "Thermostaat",
    pt: "Termóstato",
    pl: "Termostat",
    sv: "Termostat",
    da: "Termostat",
  },
  {
    fr: "Moteur",
    en: "Motor",
    de: "Motor",
    es: "Motor",
    it: "Motore",
    nl: "Motor",
    pt: "Motor",
    pl: "Silnik",
    sv: "Motor",
    da: "Motor",
  },
  {
    fr: "Carte électronique",
    en: "Control board",
    de: "Steuerplatine",
    es: "Placa electrónica",
    it: "Scheda elettronica",
    nl: "Printplaat",
    pt: "Placa eletrónica",
    pl: "Płyta sterująca",
    sv: "Kretskort",
    da: "Printkort",
  },
  {
    fr: "Charnière",
    en: "Hinge",
    de: "Scharnier",
    es: "Bisagra",
    it: "Cerniera",
    nl: "Scharnier",
    pt: "Dobradiça",
    pl: "Zawias",
    sv: "Gångjärn",
    da: "Hængsel",
  },
  {
    fr: "Bouton",
    en: "Knob",
    de: "Drehknopf",
    es: "Mando",
    it: "Manopola",
    nl: "Knop",
    pt: "Botão",
    pl: "Pokrętło",
    sv: "Vred",
    da: "Knap",
  },
  {
    fr: "Ampoule",
    en: "Lamp",
    de: "Lampe",
    es: "Bombilla",
    it: "Lampadina",
    nl: "Lamp",
    pt: "Lâmpada",
    pl: "Żarówka",
    sv: "Lampa",
    da: "Pære",
  },
  {
    fr: "Panier",
    en: "Basket",
    de: "Korb",
    es: "Cesta",
    it: "Cestello",
    nl: "Korf",
    pt: "Cesto",
    pl: "Kosz",
    sv: "Korg",
    da: "Kurv",
  },
];

/** Language-neutral keys; the site translates them when it renders. */
export const applianceTypes = [
  "washing-machine",
  "dishwasher",
  "dryer",
  "oven",
  "refrigerator",
  "cooktop",
  "range-hood",
  "microwave",
] as const;

export type ApplianceType = (typeof applianceTypes)[number];

// Invented brand names are built from these syllables.
const brandStarts = [
  "Ka",
  "Vo",
  "Te",
  "Lu",
  "Ma",
  "Ri",
  "So",
  "Da",
  "Ne",
  "Pa",
  "Zo",
  "Fi",
  "Be",
  "Ta",
  "Mo",
  "Ve",
  "Ro",
  "Li",
  "Sa",
  "No",
] as const;
const brandMiddles = [
  "ri",
  "la",
  "ven",
  "to",
  "mar",
  "si",
  "dor",
  "ne",
  "lu",
  "ka",
] as const;
const brandEnds = ["x", "on", "ia", "is", "ar", "o", "en", "um"] as const;

const letters = [..."ABCDEFGHJKLMNPRSTUVWXYZ"];

// ---------------------------------------------------------------------------
// Helpers

/** A URL slug in ASCII: "Pompa odpływowa" becomes "pompa-odplywowa". */
export function slugify(text: string): string {
  return text
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/ø/g, "o")
    .replace(/Ø/g, "O")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "AE")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Rows, in each table's column order (see scripts/generate.ts)

export type Category = { id: number; names: Record<Locale, string> };
export type CategoryLocaleRow = [
  name: string,
  slug: string,
  locale: Locale,
  parentId: number,
];
export type BrandRow = [id: number, name: string, slug: string];
export type ProductRow = [
  id: number,
  reference: string,
  brandId: number,
  categoryId: number,
  priceCents: number,
  showcase: boolean,
];
export type ModelRow = [
  id: number,
  brandId: number,
  reference: string,
  applianceType: string,
];
export type CompatibilityRow = [
  productId: number,
  rank: number,
  modelId: number,
];

export function categories(): Category[] {
  return categoryNames.map((names, index) => ({ id: index + 1, names }));
}

export function* categoryLocaleRows(): Generator<CategoryLocaleRow> {
  for (const category of categories()) {
    for (const locale of locales) {
      const name = category.names[locale];
      yield [name, slugify(name), locale, category.id];
    }
  }
}

export function brandRows(seed: number, scale: ScaleName): BrandRow[] {
  const rng = createRng(deriveSeed(seed, "brands"));
  const count = scales[scale].brands;
  const names = new Set<string>();
  // 20 × 10 × 8 = 1,600 combinations, far more than any scale needs.
  while (names.size < count) {
    names.add(
      pick(rng, brandStarts) + pick(rng, brandMiddles) + pick(rng, brandEnds),
    );
  }
  return [...names].map((name, index) => [index + 1, name, slugify(name)]);
}

export function* productRows(
  seed: number,
  scale: ScaleName,
): Generator<ProductRow> {
  const rng = createRng(deriveSeed(seed, "products"));
  const { products, brands } = scales[scale];
  const categoryCount = categoryNames.length;
  const minCents = Math.log(400);
  const maxCents = Math.log(25_000);
  for (let id = 1; id <= products; id++) {
    // Prices from about 4 to 250 euros, more of them cheap, ending in .90.
    const cents = Math.exp(minCents + rng() * (maxCents - minCents));
    const priceCents = Math.floor(cents / 100) * 100 + 90;
    yield [
      id,
      productReference(id),
      1 + randomInt(rng, brands),
      1 + randomInt(rng, categoryCount),
      priceCents,
      false,
    ];
  }
}

export function* modelRows(
  seed: number,
  scale: ScaleName,
): Generator<ModelRow> {
  const rng = createRng(deriveSeed(seed, "models"));
  const { brands } = scales[scale];
  for (let id = 1; id <= MODEL_COUNT; id++) {
    // Two letters, the id in base 36, then two digits: unique because the id
    // sits between a fixed-length prefix and a separator.
    const prefix = pick(rng, letters) + pick(rng, letters);
    const suffix = String(randomInt(rng, 100)).padStart(2, "0");
    const reference = `${prefix}${id.toString(36).toUpperCase().padStart(4, "0")}-${suffix}`;
    yield [
      id,
      1 + randomInt(rng, brands),
      reference,
      pick(rng, applianceTypes),
    ];
  }
}

/**
 * Compatibility rows, product by product, ranks from 1 (the most popular).
 * The million-model product gets every model, in a shuffled popularity order;
 * the others get a few models each, five on average and at most fifty.
 */
export function* compatibilityRows(
  seed: number,
  scale: ScaleName,
): Generator<CompatibilityRow> {
  const rng = createRng(deriveSeed(seed, "compatibility"));

  const order = new Int32Array(MODEL_COUNT);
  for (let i = 0; i < MODEL_COUNT; i++) order[i] = i + 1;
  for (let i = MODEL_COUNT - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    const swap = order[i] as number;
    order[i] = order[j] as number;
    order[j] = swap;
  }
  for (let rank = 1; rank <= MODEL_COUNT; rank++) {
    yield [MILLION_PRODUCT_ID, rank, order[rank - 1] as number];
  }

  const { products } = scales[scale];
  for (
    let productId = MILLION_PRODUCT_ID + 1;
    productId <= products;
    productId++
  ) {
    const count = Math.min(50, 1 + Math.floor(-Math.log(1 - rng()) * 4));
    const chosen = new Set<number>();
    while (chosen.size < count) chosen.add(1 + randomInt(rng, MODEL_COUNT));
    let rank = 1;
    for (const modelId of chosen) yield [productId, rank++, modelId];
  }
}
