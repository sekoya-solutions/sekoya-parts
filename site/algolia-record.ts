// Algolia's product records (docs/adr/0010-search.md, issue #115): which
// products each environment's index holds, and what a record holds. Pure,
// with no Payload, Next.js or network imports, so the unit tests read it too.
import { deriveSeed } from "../catalog/generator.ts";
import { type Locale, locales } from "../cms/locales.ts";
import { type ProductNaming, productAddresses } from "./addresses.ts";

/** The environments sharing the one Algolia application (owner, 2026-11-14). */
export const indexEnvironments = ["production", "preview", "dev"] as const;
export type IndexEnvironment = (typeof indexEnvironments)[number];

export const isIndexEnvironment = (value: string): value is IndexEnvironment =>
  (indexEnvironments as readonly string[]).includes(value);

/**
 * The most records each environment's index holds: 49,000 of the free plan's
 * 50,000 in all, so the three never exceed it together.
 */
export const INDEX_CAPACITY: Record<IndexEnvironment, number> = {
  production: 45_000,
  preview: 2_000,
  dev: 2_000,
};

/** An environment's index name. */
export const indexName = (environment: IndexEnvironment): string =>
  `products_${environment}`;

/**
 * Algolia's record size limit on the free plan is 10 KB. Records are kept
 * under 10,000 bytes of JSON, below either reading of a kilobyte.
 */
export const MAX_RECORD_BYTES = 10_000;

/** The most compatible model references a record holds (ADR 0010). */
export const RECORD_MODEL_REFERENCES = 500;

/**
 * A product's popularity, from 0 to 999,999: a pure function of its id, like
 * the generated names (ADR 0007 left the score to search). The same product
 * always gets the same score, so every reload selects the same products.
 */
export function productPopularity(id: number): number {
  return deriveSeed(id, "popularity") % 1_000_000;
}

/**
 * The ids an index of the given capacity holds: every showcase product, then
 * the most popular others, ties by id. Showcase products beyond the capacity
 * are an error, since the index must hold them all.
 */
export function selectIndexed(
  products: Iterable<{ id: number; showcase: boolean }>,
  capacity: number,
): number[] {
  const showcase: number[] = [];
  const others: { id: number; popularity: number }[] = [];
  for (const product of products) {
    if (product.showcase) showcase.push(product.id);
    else
      others.push({
        id: product.id,
        popularity: productPopularity(product.id),
      });
  }
  if (showcase.length > capacity) {
    throw new Error(
      `${showcase.length} showcase products do not fit an index of ${capacity} records.`,
    );
  }
  others.sort((a, b) => b.popularity - a.popularity || a.id - b.id);
  return [
    ...showcase.sort((a, b) => a - b),
    ...others.slice(0, capacity - showcase.length).map((o) => o.id),
  ];
}

/**
 * A model reference as the model search compares it: upper case, without
 * spaces or dashes, the rule of MODEL_SEARCH_KEY in site/search-key.ts.
 */
export const recordModelKey = (reference: string): string =>
  reference.replace(/[- ]/g, "").toUpperCase();

export type ProductRecord = {
  objectID: string;
  reference: string;
  brand: string;
  categoryId: number;
  priceCents: number;
  popularity: number;
  showcase: boolean;
  /** Compatible model references, most popular first, normalised. */
  models: string[];
} & { [K in `name_${Locale}` | `path_${Locale}`]: string };

export type RecordInput = ProductNaming & {
  id: number;
  categoryId: number;
  priceCents: number;
  showcase: boolean;
  /** Compatible model references, most popular first. */
  modelReferences: readonly string[];
};

/** A record's size as Algolia counts it: its JSON in UTF-8 bytes. */
export const recordBytes = (record: ProductRecord): number =>
  Buffer.byteLength(JSON.stringify(record), "utf8");

/**
 * A product's record. It holds at most RECORD_MODEL_REFERENCES models, and
 * fewer when that is needed to stay under MAX_RECORD_BYTES: the least popular
 * are dropped first. A record over the limit even without models is an error.
 */
export function buildRecord(input: RecordInput): ProductRecord {
  const { names, paths } = productAddresses(input);
  const localized = {} as Record<`name_${Locale}` | `path_${Locale}`, string>;
  for (const locale of locales) {
    localized[`name_${locale}`] = names[locale];
    localized[`path_${locale}`] = paths[locale];
  }
  const record: ProductRecord = {
    objectID: String(input.id),
    reference: input.reference,
    brand: input.brand,
    categoryId: input.categoryId,
    priceCents: input.priceCents,
    popularity: productPopularity(input.id),
    showcase: input.showcase,
    ...localized,
    models: input.modelReferences
      .slice(0, RECORD_MODEL_REFERENCES)
      .map(recordModelKey),
  };
  let excess = recordBytes(record) - MAX_RECORD_BYTES;
  while (excess > 0 && record.models.length > 0) {
    // A model costs its characters, two quotes and a comma.
    excess -= (record.models.pop() as string).length + 3;
  }
  // The estimate above is a fast first pass; this measures until it fits.
  while (recordBytes(record) > MAX_RECORD_BYTES && record.models.length > 0) {
    record.models.pop();
  }
  if (recordBytes(record) > MAX_RECORD_BYTES) {
    throw new Error(
      `Product ${input.reference}: its record exceeds ${MAX_RECORD_BYTES} bytes without models.`,
    );
  }
  return record;
}
