// Text that is generated at render time instead of stored
// (docs/adr/0007-catalog-data-model.md): an ordinary product's name and its
// placeholder description. Pure functions with no database access, so a
// render, a test and a cache refresh all produce the same text.
import type { Locale } from "../cms/locales.ts";
import { createRng, deriveSeed } from "./generator.ts";

/** An ordinary product's name: its part type, its brand and its reference. */
export function productName(
  categoryName: string,
  brandName: string,
  reference: string,
): string {
  return `${categoryName} ${brandName} ${reference}`;
}

// Placeholder words in the lorem ipsum tradition, used in every language.
const words = [
  "lorem",
  "ipsum",
  "dolor",
  "sit",
  "amet",
  "consectetur",
  "adipiscing",
  "elit",
  "sed",
  "do",
  "eiusmod",
  "tempor",
  "incididunt",
  "ut",
  "labore",
  "et",
  "dolore",
  "magna",
  "aliqua",
  "enim",
  "ad",
  "minim",
  "veniam",
  "quis",
  "nostrud",
  "exercitation",
  "ullamco",
  "laboris",
  "nisi",
  "aliquip",
  "ex",
  "ea",
  "commodo",
  "consequat",
  "duis",
  "aute",
  "irure",
  "in",
  "reprehenderit",
  "voluptate",
  "velit",
  "esse",
  "cillum",
  "fugiat",
  "nulla",
  "pariatur",
] as const;

/**
 * An ordinary product's placeholder description: three to five sentences
 * drawn from a seed of the product and the language, so the same product and
 * language always give the same text, and each language its own.
 */
export function placeholderDescription(
  productId: number,
  locale: Locale,
): string {
  const rng = createRng(deriveSeed(productId, `description:${locale}`));
  const sentenceCount = 3 + Math.floor(rng() * 3);
  const sentences: string[] = [];
  for (let s = 0; s < sentenceCount; s++) {
    const wordCount = 8 + Math.floor(rng() * 7);
    const picked: string[] = [];
    for (let w = 0; w < wordCount; w++) {
      picked.push(words[Math.floor(rng() * words.length)] as string);
    }
    const sentence = picked.join(" ");
    sentences.push(`${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`);
  }
  return sentences.join(" ");
}

/**
 * A product id from the address, or null when it is not a positive integer
 * that fits PostgreSQL's integer column.
 */
export function parseProductId(raw: string): number | null {
  if (!/^[1-9][0-9]{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id <= 2_147_483_647 ? id : null;
}
