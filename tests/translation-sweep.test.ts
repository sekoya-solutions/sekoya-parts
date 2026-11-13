// The translation sweep against fakes (issue #104): which texts go to DeepL,
// what the memory saves, and what a failure leaves behind.
import { describe, expect, it } from "vitest";
import { DEEPL_TARGETS, type TargetLocale } from "../cms/translation/deepl.ts";
import {
  type SweepProduct,
  sourceHash,
  sweep,
  type TranslationMemory,
  targetLocales,
} from "../cms/translation/sweep.ts";

/** A memory in a Map, keyed by language and hash. */
function fakeMemory() {
  const rows = new Map<string, string>();
  const memory: TranslationMemory = {
    async get(locale, hashes) {
      const found = new Map<string, string>();
      for (const hash of hashes) {
        const text = rows.get(`${locale}:${hash}`);
        if (text !== undefined) found.set(hash, text);
      }
      return found;
    },
    async put(locale, entries) {
      for (const { hash, text } of entries)
        if (!rows.has(`${locale}:${hash}`)) rows.set(`${locale}:${hash}`, text);
    },
  };
  return { rows, memory };
}

/** A fake DeepL echoing each text with its target code, failing on demand. */
function fakeDeepL(failFor: Partial<Record<string, number>> = {}) {
  const requests: { target: string; text: string[] }[] = [];
  const fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as {
      text: string[];
      target_lang: string;
    };
    requests.push({ target: body.target_lang, text: body.text });
    const status = failFor[body.target_lang];
    if (status) return new Response("{}", { status });
    return new Response(
      JSON.stringify({
        translations: body.text.map((text) => ({
          text: `${body.target_lang}:${text}`,
        })),
      }),
      { status: 200 },
    );
  }) as unknown as typeof globalThis.fetch;
  return { requests, client: { key: "k:fx", fetch } };
}

const product = (
  id: number,
  name: string,
  description: string,
): SweepProduct => ({
  id,
  fr: { name, description },
  stored: {},
});

/** Applies the writes to the products, as Payload would. */
function writer(products: SweepProduct[]) {
  const writes: { id: number; locale: TargetLocale; texts: object }[] = [];
  return {
    writes,
    write: async (
      id: number,
      locale: TargetLocale,
      texts: { name?: string | null; description?: string | null },
    ) => {
      writes.push({ id, locale, texts });
      const p = products.find((x) => x.id === id) as SweepProduct;
      p.stored[locale] = { ...p.stored[locale], ...texts };
    },
  };
}

describe("sweep", () => {
  it("translates each text once per language, in one request per language", async () => {
    const products = [
      product(1, "Joint", "Un joint."),
      product(2, "Pompe", "Une pompe."),
    ];
    const { memory } = fakeMemory();
    const deepl = fakeDeepL();
    const { writes, write } = writer(products);
    const result = await sweep({
      products,
      memory,
      deepl: deepl.client,
      write,
    });

    expect(deepl.requests).toHaveLength(9);
    for (const request of deepl.requests) expect(request.text).toHaveLength(4);
    expect(result).toMatchObject({
      requests: 9,
      characters: 9 * "JointUn joint.PompeUne pompe.".length,
      written: 18,
      untranslated: 0,
      failed: false,
    });
    expect(writes).toHaveLength(18);
    expect(products[0]?.stored.en).toEqual({
      name: "EN-GB:Joint",
      description: "EN-GB:Un joint.",
    });
    expect(products[1]?.stored.pt?.name).toBe("PT-PT:Pompe");
  });

  it("sends a text shared by two products once", async () => {
    const products = [
      product(1, "Joint", "Même texte."),
      product(2, "Pompe", "Même texte."),
    ];
    const deepl = fakeDeepL();
    await sweep({
      products,
      ...fakeMemory(),
      deepl: deepl.client,
      ...writer(products),
    });
    expect(deepl.requests[0]?.text).toEqual(["Joint", "Même texte.", "Pompe"]);
  });

  it("calls DeepL zero times and writes nothing on a second run", async () => {
    const products = [product(1, "Joint", "Un joint.")];
    const { memory } = fakeMemory();
    const deepl = fakeDeepL();
    await sweep({ products, memory, deepl: deepl.client, ...writer(products) });
    deepl.requests.length = 0;
    const { writes, write } = writer(products);
    const result = await sweep({
      products,
      memory,
      deepl: deepl.client,
      write,
    });
    expect(deepl.requests).toHaveLength(0);
    expect(writes).toHaveLength(0);
    expect(result).toMatchObject({ requests: 0, characters: 0, written: 0 });
  });

  it("restores every language from the memory after a reload, with no request and no key", async () => {
    const products = [product(1, "Joint", "Un joint.")];
    const { memory } = fakeMemory();
    await sweep({
      products,
      memory,
      deepl: fakeDeepL().client,
      ...writer(products),
    });

    // A reload writes French only.
    const reloaded = [product(1, "Joint", "Un joint.")];
    const { writes, write } = writer(reloaded);
    const result = await sweep({
      products: reloaded,
      memory,
      deepl: null,
      write,
    });
    expect(writes).toHaveLength(9);
    expect(reloaded[0]?.stored.da).toEqual({
      name: "DA:Joint",
      description: "DA:Un joint.",
    });
    expect(result).toMatchObject({
      requests: 0,
      untranslated: 0,
      stopped: null,
    });
  });

  it("sends only the edited text when one product's French changes, and overwrites that field", async () => {
    const products = [
      product(1, "Joint", "Un joint."),
      product(2, "Pompe", "Une pompe."),
    ];
    const { memory } = fakeMemory();
    const deepl = fakeDeepL();
    await sweep({ products, memory, deepl: deepl.client, ...writer(products) });
    deepl.requests.length = 0;

    (products[1] as SweepProduct).fr.description = "Une pompe neuve.";
    const { writes, write } = writer(products);
    const result = await sweep({
      products,
      memory,
      deepl: deepl.client,
      write,
    });
    expect(deepl.requests).toHaveLength(9);
    for (const request of deepl.requests)
      expect(request.text).toEqual(["Une pompe neuve."]);
    expect(writes.every((w) => w.id === 2)).toBe(true);
    expect(writes[0]?.texts).toEqual({ description: "EN-GB:Une pompe neuve." });
    expect(result.characters).toBe(9 * "Une pompe neuve.".length);
  });

  it("overwrites a hand edit in another language with the translation of the French", async () => {
    const products = [product(1, "Joint", "Un joint.")];
    const { memory } = fakeMemory();
    await sweep({
      products,
      memory,
      deepl: fakeDeepL().client,
      ...writer(products),
    });
    (products[0] as SweepProduct).stored.de = {
      name: "Handarbeit",
      description: "DE:Un joint.",
    };
    const { writes, write } = writer(products);
    await sweep({ products, memory, deepl: null, write });
    expect(writes).toEqual([
      { id: 1, locale: "de", texts: { name: "DE:Joint" } },
    ]);
  });

  it("without a key and an empty memory, sends nothing, writes nothing and says why", async () => {
    const products = [product(1, "Joint", "Un joint.")];
    const { writes, write } = writer(products);
    const result = await sweep({
      products,
      ...fakeMemory(),
      deepl: null,
      write,
    });
    expect(writes).toHaveLength(0);
    expect(result).toMatchObject({
      requests: 0,
      written: 0,
      untranslated: 18,
      failed: false,
      stopped: "No DeepL key: only the memory is used.",
    });
  });

  it.each([456, 429, 403])(
    "stops at the first %i, keeps what was paid for and reports the failure",
    async (status) => {
      const products = [product(1, "Joint", "Un joint.")];
      const { rows, memory } = fakeMemory();
      // The third language fails: en and de succeed first.
      const deepl = fakeDeepL({ ES: status });
      const { writes, write } = writer(products);
      const result = await sweep({
        products,
        memory,
        deepl: deepl.client,
        write,
      });

      expect(deepl.requests.map((r) => r.target)).toEqual([
        "EN-GB",
        "DE",
        "ES",
      ]);
      expect(rows.size).toBe(4);
      expect(writes.map((w) => w.locale)).toEqual(["en", "de"]);
      expect(result).toMatchObject({
        failed: true,
        written: 2,
        untranslated: 14,
      });
      expect(result.stopped).toMatch(String(status));

      // The next run sends only what is still missing.
      const retry = fakeDeepL();
      await sweep({
        products,
        memory,
        deepl: retry.client,
        ...writer(products),
      });
      expect(retry.requests.map((r) => r.target)).toEqual(
        targetLocales.slice(2).map((locale) => DEEPL_TARGETS[locale]),
      );
    },
  );

  it("keys the memory by the SHA-256 of the French text", () => {
    expect(sourceHash("Joint")).toMatch(/^[0-9a-f]{64}$/);
    expect(sourceHash("Joint")).not.toBe(sourceHash("Joint "));
  });
});
