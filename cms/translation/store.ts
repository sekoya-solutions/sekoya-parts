// Connects the sweep to the database (issue #104): the showcase products
// through Payload, and the translation memory and run lease in the project's
// own tables (migrations/20261113_230000_translation_memory.ts). The
// generator's TRUNCATE does not list them (catalog/tables.ts) and they
// reference no table, so a catalog reload keeps them.
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import type { DeepLClient, TargetLocale } from "./deepl.ts";
import {
  type SweepProduct,
  type SweepResult,
  sweep,
  type TranslationMemory,
  targetLocales,
} from "./sweep.ts";

type Drizzle = Pick<PostgresAdapter["drizzle"], "execute">;

/**
 * The connection to use: the request's transaction when it has one (the
 * database test rolls everything back), else the pool, where each statement
 * commits at once, so translations paid for are kept even if the run fails.
 */
async function drizzleFor(
  payload: Payload,
  req?: Partial<PayloadRequest>,
): Promise<Drizzle> {
  const adapter = payload.db as unknown as PostgresAdapter;
  const id = req?.transactionID ? await req.transactionID : undefined;
  const session = id === undefined ? undefined : adapter.sessions[String(id)];
  return session ? (session.db as unknown as Drizzle) : adapter.drizzle;
}

/** The memory in the translation_memory table. Rows are only ever added. */
export function databaseMemory(drizzle: Drizzle): TranslationMemory {
  return {
    async get(locale, hashes) {
      if (hashes.length === 0) return new Map();
      const { rows } = await drizzle.execute<{
        source_hash: string;
        translation: string;
      }>(sql`
        SELECT source_hash, translation FROM translation_memory
        WHERE locale = ${locale}
          AND source_hash IN (${sql.join(
            hashes.map((hash) => sql`${hash}`),
            sql`, `,
          )})`);
      return new Map(rows.map((row) => [row.source_hash, row.translation]));
    },
    async put(locale, entries) {
      if (entries.length === 0) return;
      await drizzle.execute(sql`
        INSERT INTO translation_memory (locale, source_hash, translation)
        VALUES ${sql.join(
          entries.map(({ hash, text }) => sql`(${locale}, ${hash}, ${text})`),
          sql`, `,
        )}
        ON CONFLICT (locale, source_hash) DO NOTHING`);
    },
  };
}

type AllLocales = Record<string, string | null | undefined>;
const allLocales = (value: unknown): AllLocales =>
  value !== null && typeof value === "object" ? (value as AllLocales) : {};

/** Every showcase product, with its texts in each language. */
export async function readShowcase(
  payload: Payload,
  req?: Partial<PayloadRequest>,
): Promise<SweepProduct[]> {
  const { docs } = await payload.find({
    collection: "products",
    where: { showcase: { equals: true } },
    locale: "all",
    // No fallback: an empty language must read as empty, not as French.
    fallbackLocale: false,
    depth: 0,
    pagination: false,
    select: { name: true, description: true },
    req,
  });
  return docs.map((doc) => {
    const names = allLocales(doc.name);
    const descriptions = allLocales(doc.description);
    const stored: SweepProduct["stored"] = {};
    for (const locale of targetLocales)
      stored[locale] = {
        name: names[locale] ?? null,
        description: descriptions[locale] ?? null,
      };
    return {
      id: doc.id,
      fr: { name: names.fr ?? null, description: descriptions.fr ?? null },
      stored,
    };
  });
}

/**
 * Takes the run lease, or returns false when another run holds it, so two
 * runs (the cron and the owner) never pay DeepL twice for the same text. A
 * run that crashed frees it when it expires, after ten minutes: well over a
 * function's longest run. clock_timestamp(), not now(): now() is fixed for a
 * whole transaction, so a lease released and taken again in one would read
 * as still held.
 */
async function takeLease(drizzle: Drizzle): Promise<boolean> {
  const { rows } = await drizzle.execute(sql`
    INSERT INTO translation_lease (id, held_until)
    VALUES (1, clock_timestamp() + interval '10 minutes')
    ON CONFLICT (id) DO UPDATE SET held_until = EXCLUDED.held_until
    WHERE translation_lease.held_until < clock_timestamp()
    RETURNING id`);
  return rows.length === 1;
}

async function releaseLease(drizzle: Drizzle): Promise<void> {
  await drizzle.execute(sql`
    UPDATE translation_lease SET held_until = '-infinity' WHERE id = 1`);
}

export type RunResult = SweepResult | { busy: true };

/**
 * One sweep over the showcase products, with the key given (or none). Each
 * language written goes through Payload, so the product save hook refreshes
 * exactly the parts it changed.
 */
export async function runTranslation(
  payload: Payload,
  deepl: DeepLClient | null,
  req?: Partial<PayloadRequest>,
): Promise<RunResult> {
  const drizzle = await drizzleFor(payload, req);
  if (!(await takeLease(drizzle))) return { busy: true };
  try {
    return await sweep({
      products: await readShowcase(payload, req),
      memory: databaseMemory(drizzle),
      deepl,
      write: async (id, locale: TargetLocale, data) => {
        await payload.update({
          collection: "products",
          id,
          locale,
          data,
          req,
        });
      },
    });
  } finally {
    await releaseLease(drizzle);
  }
}
