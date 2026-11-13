// The translation sweep against the database, with a fake DeepL (issue #104).
// Everything runs in one Payload transaction that is rolled back at the end,
// so the loaded catalog, the other tests running alongside, and a memory
// holding real translations (Neon's dev branch, locally) are left as they
// were. Needs a database loaded by `npm run generate`.

import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";
import {
  createLocalReq,
  getPayload,
  initTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from "payload";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Outside a Next.js request revalidateTag throws; the test records the tags.
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { revalidateTag } from "next/cache";
import { showcaseProducts } from "../catalog/showcase.ts";
import { catalogTables } from "../catalog/tables.ts";
import { DEEPL_TARGETS } from "../cms/translation/deepl.ts";
import { runTranslation } from "../cms/translation/store.ts";
import { targetLocales } from "../cms/translation/sweep.ts";
import config from "../payload.config.ts";
import { productAddresses } from "../site/addresses.ts";

for (const name of ["DATABASE_URL", "PAYLOAD_SECRET"]) {
  if (!process.env[name]) throw new Error(`${name} must be set for this test.`);
}

let payload: Payload;

beforeAll(async () => {
  payload = await getPayload({ config });
});

afterAll(async () => {
  await payload?.destroy();
});

/** A fake DeepL that prefixes each text with its target code. */
function fakeDeepL() {
  const requests: { target: string; texts: string[] }[] = [];
  const fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as {
      text: string[];
      target_lang: string;
    };
    requests.push({ target: body.target_lang, texts: body.text });
    return Response.json({
      translations: body.text.map((text) => ({
        text: `${body.target_lang} ${text}`,
      })),
    });
  }) as unknown as typeof globalThis.fetch;
  return { requests, client: { key: "test:fx", fetch } };
}

/** Runs `body` in a transaction that is always rolled back. */
async function inRollback(
  body: (
    req: PayloadRequest,
    execute: (query: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }>,
  ) => Promise<void>,
) {
  const req = await createLocalReq({}, payload);
  await initTransaction(req);
  const adapter = payload.db as unknown as PostgresAdapter;
  const session = adapter.sessions[String(await req.transactionID)];
  if (!session) throw new Error("No transaction.");
  const execute = (query: ReturnType<typeof sql>) =>
    session.db.execute(query) as Promise<{ rows: unknown[] }>;
  try {
    await body(req, execute);
  } finally {
    await killTransaction(req);
  }
}

const showcaseIds = showcaseProducts.map((p) => p.id);
const LANGUAGES = targetLocales.length;

describe("the translation sweep on the database", () => {
  it("translates, keeps the memory through a reload, and sends nothing twice", async () => {
    await inRollback(async (req, execute) => {
      // An empty memory, as on a new database.
      await execute(sql`DELETE FROM translation_memory`);
      await execute(sql`DELETE FROM translation_lease`);
      vi.mocked(revalidateTag).mockClear();

      // First run: one request per language, every product written.
      const first = fakeDeepL();
      const result = await runTranslation(payload, first.client, req);
      expect(result).toMatchObject({
        requests: LANGUAGES,
        written: showcaseIds.length * LANGUAGES,
        untranslated: 0,
        failed: false,
      });
      expect(first.requests.map((r) => r.target)).toEqual(
        targetLocales.map((locale) => DEEPL_TARGETS[locale]),
      );

      const one = showcaseProducts[0];
      if (!one) throw new Error("No showcase product.");
      const english = await payload.findByID({
        collection: "products",
        id: one.id,
        locale: "en",
        fallbackLocale: false,
        depth: 0,
        req,
      });
      expect(english.name).toBe(`EN-GB ${one.fr.name}`);
      expect(english.description).toBe(`EN-GB ${one.fr.description}`);

      // The save hook refreshed the parts of each translated product.
      const tags = vi.mocked(revalidateTag).mock.calls.map(([tag]) => tag);
      for (const id of showcaseIds)
        expect(tags).toContain(`product:${id}:description`);

      // The English address is built from the English name.
      const { paths } = productAddresses({
        reference: english.reference,
        showcaseNames: { fr: one.fr.name, en: english.name },
        categoryNames: { fr: "x" },
        categorySlugs: { fr: "x" },
        brand: "x",
      });
      expect(paths.en).toContain("en-gb-");
      expect(paths.fr).not.toContain("en-gb-");

      // Second run: nothing changed, nothing sent, nothing written.
      const second = fakeDeepL();
      expect(await runTranslation(payload, second.client, req)).toMatchObject({
        requests: 0,
        characters: 0,
        written: 0,
      });
      expect(second.requests).toHaveLength(0);

      // A reload writes French only: the memory restores everything, with
      // no key at all.
      await execute(sql`
        DELETE FROM products_locales
        WHERE _locale <> 'fr' AND _parent_id IN (${sql.join(
          showcaseIds.map((id) => sql`${id}`),
          sql`, `,
        )})`);
      expect(await runTranslation(payload, null, req)).toMatchObject({
        requests: 0,
        written: showcaseIds.length * LANGUAGES,
        untranslated: 0,
        stopped: null,
      });

      // A French edit sends only the edited text.
      await payload.update({
        collection: "products",
        id: one.id,
        locale: "fr",
        data: { description: `${one.fr.description} Modifié.` },
        req,
      });
      const third = fakeDeepL();
      expect(await runTranslation(payload, third.client, req)).toMatchObject({
        requests: LANGUAGES,
        written: LANGUAGES,
      });
      for (const request of third.requests)
        expect(request.texts).toEqual([`${one.fr.description} Modifié.`]);
    });
  });

  it("refuses a second run while one holds the lease", async () => {
    await inRollback(async (req, execute) => {
      await execute(sql`DELETE FROM translation_lease`);
      await execute(sql`
        INSERT INTO translation_lease (id, held_until)
        VALUES (1, now() + interval '5 minutes')`);
      const deepl = fakeDeepL();
      expect(await runTranslation(payload, deepl.client, req)).toEqual({
        busy: true,
      });
      expect(deepl.requests).toHaveLength(0);
    });
  });

  it("keeps the memory out of the generator's TRUNCATE", async () => {
    const tables: readonly string[] = catalogTables;
    expect(tables).not.toContain("translation_memory");
    expect(tables).not.toContain("translation_lease");
    // TRUNCATE ... CASCADE also empties tables that reference a truncated
    // one; the memory tables reference none.
    await inRollback(async (_req, execute) => {
      const { rows } = await execute(sql`
        SELECT conname FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid IN ('translation_memory'::regclass, 'translation_lease'::regclass)`);
      expect(rows).toEqual([]);
    });
  });
});
