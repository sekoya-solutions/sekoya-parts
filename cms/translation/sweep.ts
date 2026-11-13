// The translation sweep (issue #104): brings every showcase product's nine
// other languages in line with its French source. It reads nothing from the
// database itself, so unit tests run it against fakes; store.ts connects it
// to Payload and the translation memory.
//
// Each French text is translated once per language, ever: DeepL's answers go
// into the memory as soon as they arrive, keyed by language and the text's
// hash. A catalog reload, which keeps the memory, then costs no character,
// and a run with nothing changed sends no request.
import { createHash } from "node:crypto";
import { locales } from "../locales.ts";
import {
  type DeepLClient,
  DeepLError,
  MAX_TEXTS_PER_REQUEST,
  type TargetLocale,
  translateFromFrench,
} from "./deepl.ts";

export const targetLocales = locales.filter(
  (locale): locale is TargetLocale => locale !== "fr",
);

/** The translated fields of a product. */
export const TRANSLATED_FIELDS = ["name", "description"] as const;
type Field = (typeof TRANSLATED_FIELDS)[number];
type Texts = Partial<Record<Field, string | null>>;

/** A showcase product as the sweep sees it. */
export type SweepProduct = {
  id: number;
  /** The French source. */
  fr: Texts;
  /** What each other language holds now, null or missing when empty. */
  stored: Partial<Record<TargetLocale, Texts>>;
};

/** Translations already paid for, by language and French text hash. */
export type TranslationMemory = {
  get(
    locale: TargetLocale,
    hashes: readonly string[],
  ): Promise<Map<string, string>>;
  put(
    locale: TargetLocale,
    entries: readonly { hash: string; text: string }[],
  ): Promise<void>;
};

export type SweepDependencies = {
  products: readonly SweepProduct[];
  memory: TranslationMemory;
  /** Null without a key: the memory is still used, DeepL never. */
  deepl: DeepLClient | null;
  /** Writes one language of one product. */
  write(id: number, locale: TargetLocale, texts: Texts): Promise<void>;
};

export type SweepResult = {
  /** Requests sent to DeepL. */
  requests: number;
  /** Characters sent to DeepL, which is what its quota counts. */
  characters: number;
  /** Languages of products written. */
  written: number;
  /** French texts and languages left without a translation. */
  untranslated: number;
  /** Why DeepL was not called, or stopped, when it was needed. */
  stopped: string | null;
  /** True when DeepL refused or failed: the run must be reported as failed. */
  failed: boolean;
};

/** The memory's key for a French text. */
export const sourceHash = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex");

/** How DeepL counts characters: code points, not UTF-16 units. */
const characterCount = (text: string): number => [...text].length;

const frenchTexts = (
  products: readonly SweepProduct[],
): Map<string, string> => {
  const byHash = new Map<string, string>();
  for (const product of products)
    for (const field of TRANSLATED_FIELDS) {
      const text = product.fr[field];
      if (text) byHash.set(sourceHash(text), text);
    }
  return byHash;
};

/**
 * Runs the sweep. A DeepL failure stops every later request, but what the
 * memory already holds is still written, and the result says it failed.
 */
export async function sweep(deps: SweepDependencies): Promise<SweepResult> {
  const result: SweepResult = {
    requests: 0,
    characters: 0,
    written: 0,
    untranslated: 0,
    stopped: null,
    failed: false,
  };
  const sources = frenchTexts(deps.products);
  const hashes = [...sources.keys()];
  const known = new Map<TargetLocale, Map<string, string>>();

  for (const locale of targetLocales) {
    const found = await deps.memory.get(locale, hashes);
    known.set(locale, found);
    const missing = hashes.filter((hash) => !found.has(hash));
    if (missing.length === 0 || result.failed) continue;
    if (!deps.deepl) {
      result.stopped = "No DeepL key: only the memory is used.";
      continue;
    }
    const texts = missing.map((hash) => sources.get(hash) as string);
    try {
      const translated = await translateFromFrench(deps.deepl, texts, locale);
      result.requests += Math.ceil(texts.length / MAX_TEXTS_PER_REQUEST);
      result.characters += texts.reduce((n, t) => n + characterCount(t), 0);
      const entries = missing.map((hash, i) => ({
        hash,
        text: translated[i] as string,
      }));
      // Stored at once: these characters are paid for.
      await deps.memory.put(locale, entries);
      for (const { hash, text } of entries) found.set(hash, text);
    } catch (error) {
      if (!(error instanceof DeepLError)) throw error;
      result.failed = true;
      result.stopped = error.message;
    }
  }

  for (const product of deps.products) {
    for (const locale of targetLocales) {
      const found = known.get(locale) as Map<string, string>;
      const stored = product.stored[locale] ?? {};
      const update: Texts = {};
      for (const field of TRANSLATED_FIELDS) {
        const source = product.fr[field];
        if (!source) continue;
        const translation = found.get(sourceHash(source));
        if (translation === undefined) {
          result.untranslated += 1;
          continue;
        }
        if (stored[field] !== translation) update[field] = translation;
      }
      if (Object.keys(update).length > 0) {
        await deps.write(product.id, locale, update);
        result.written += 1;
      }
    }
  }

  return result;
}
