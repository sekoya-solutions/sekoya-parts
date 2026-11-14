// Algolia's REST API (docs/adr/0010-search.md, issue #115): only the calls the
// project needs, with fetch, so no SDK and no telemetry. Nothing here
// retries: a failed call throws, and the caller decides.
import { locales } from "../cms/locales.ts";
import {
  type IndexEnvironment,
  indexName,
  isIndexEnvironment,
  type ProductRecord,
} from "./algolia-record.ts";

export type AlgoliaClient = {
  appId: string;
  key: string;
  /** Replaced by the tests, which fake Algolia. */
  fetch?: typeof globalThis.fetch;
};

export class AlgoliaError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** One call to the application's main host. */
export async function algoliaRequest<T>(
  client: AlgoliaClient,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await (client.fetch ?? fetch)(
    `https://${client.appId}.algolia.net${path}`,
    {
      method,
      headers: {
        "X-Algolia-Application-Id": client.appId,
        "X-Algolia-API-Key": client.key,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    // Algolia's error body holds a message, never the key.
    const text = await response.text().catch(() => "");
    throw new AlgoliaError(
      response.status,
      `Algolia ${method} ${path}: ${response.status} ${text.slice(0, 200)}`,
    );
  }
  return (await response.json()) as T;
}

/** A key's rights, as the keys API describes them. */
export type KeySpec = {
  description: string;
  acl: string[];
  indexes: string[];
  maxQueriesPerIPPerHour?: number;
};

/** The search key's limit per visitor and hour (ADR 0010). */
export const SEARCH_QUERIES_PER_HOUR = 60;

/**
 * The two keys of an environment, each limited to its own index (owner,
 * 2026-11-14): the write key fills and updates the index, the search key only
 * searches it, at most SEARCH_QUERIES_PER_HOUR an hour per visitor.
 */
export function environmentKeys(
  environment: IndexEnvironment,
): Record<"write" | "search", KeySpec> {
  const index = indexName(environment);
  return {
    write: {
      description: `sekoya-parts ${index} write`,
      acl: ["addObject", "deleteObject", "editSettings", "browse", "settings"],
      indexes: [index],
    },
    search: {
      description: `sekoya-parts ${index} search`,
      acl: ["search"],
      indexes: [index],
      maxQueriesPerIPPerHour: SEARCH_QUERIES_PER_HOUR,
    },
  };
}

export type ExistingKey = KeySpec & { value: string };

/** Whether an existing key has exactly the rights of a spec. */
export function keyMatches(key: ExistingKey, spec: KeySpec): boolean {
  const same = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();
  return (
    same(key.acl, spec.acl) &&
    same(key.indexes ?? [], spec.indexes) &&
    (key.maxQueriesPerIPPerHour ?? 0) === (spec.maxQueriesPerIPPerHour ?? 0)
  );
}

/** An environment's connection to its own index, from its variables. */
export type IndexConnection = {
  client: AlgoliaClient;
  environment: IndexEnvironment;
  index: string;
};

/**
 * The write connection of this environment, or null when Algolia is not set
 * up here (CI and tests without a fake). A wrong ALGOLIA_ENVIRONMENT is an
 * error, not a silent skip.
 */
export function writeConnectionFromEnvironment(
  env: Record<string, string | undefined>,
): IndexConnection | null {
  const appId = env.ALGOLIA_APP_ID?.trim();
  const key = env.ALGOLIA_WRITE_KEY?.trim();
  const environment = env.ALGOLIA_ENVIRONMENT?.trim();
  if (!appId || !key || !environment) return null;
  if (!isIndexEnvironment(environment)) {
    throw new Error(
      `ALGOLIA_ENVIRONMENT is "${environment}": use production, preview or dev.`,
    );
  }
  // On Vercel, each environment may only write its own index.
  const vercel = env.VERCEL_ENV;
  if (
    (vercel === "production" || vercel === "preview") &&
    vercel !== environment
  ) {
    throw new Error(
      `ALGOLIA_ENVIRONMENT is "${environment}" on Vercel's ${vercel} environment.`,
    );
  }
  return { client: { appId, key }, environment, index: indexName(environment) };
}

/** The records a batch call sends at most (ADR 0010). */
export const BATCH_SIZE = 1_000;

export type BatchRequest =
  | { action: "addObject"; body: ProductRecord }
  | { action: "deleteObject"; body: { objectID: string } };

/** Sends one batch of writes to an index; Algolia applies them in order. */
export async function sendBatch(
  connection: IndexConnection,
  requests: BatchRequest[],
): Promise<void> {
  if (requests.length === 0) return;
  if (requests.length > BATCH_SIZE) {
    throw new Error(`A batch holds at most ${BATCH_SIZE} requests.`);
  }
  await algoliaRequest(
    connection.client,
    "POST",
    `/1/indexes/${encodeURIComponent(connection.index)}/batch`,
    { requests },
  );
}

/**
 * Every objectID an index holds, read with Algolia's browse, 1,000 per call.
 * Only used when this environment's state is unknown (a new index, a reset
 * branch or a reloaded catalog), so its few calls are rare.
 */
export async function listObjectIds(
  connection: IndexConnection,
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    let page: { hits: { objectID: string }[]; cursor?: string };
    try {
      page = await algoliaRequest(
        connection.client,
        "POST",
        `/1/indexes/${encodeURIComponent(connection.index)}/browse`,
        cursor
          ? { cursor }
          : { attributesToRetrieve: ["objectID"], hitsPerPage: 1000 },
      );
    } catch (error) {
      // An index that does not exist yet holds nothing.
      if (error instanceof AlgoliaError && error.status === 404 && !cursor) {
        return [];
      }
      throw error;
    }
    for (const hit of page.hits) ids.push(hit.objectID);
    cursor = page.cursor;
  } while (cursor);
  return ids;
}

/**
 * The index's settings (ADR 0010): every language's name searchable, then the
 * reference, the models and the brand; popularity breaks ties; the ten
 * languages are set explicitly, as Algolia recommends. Queries restrict the
 * searched names to the visitor's language.
 */
export const indexSettings = {
  searchableAttributes: [
    locales.map((locale) => `name_${locale}`).join(","),
    "reference",
    "unordered(models)",
    "brand",
  ],
  customRanking: ["desc(popularity)"],
  indexLanguages: [...locales],
  queryLanguages: [...locales],
  attributesForFaceting: ["filterOnly(categoryId)"],
  unretrievableAttributes: ["models"],
};

/** Applies indexSettings; the same call creates the index when it is new. */
export async function applySettings(
  connection: IndexConnection,
): Promise<void> {
  await algoliaRequest(
    connection.client,
    "PUT",
    `/1/indexes/${encodeURIComponent(connection.index)}/settings`,
    indexSettings,
  );
}
