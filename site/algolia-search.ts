// Parts from Algolia on the results page (docs/adr/0010-search.md, issue
// #119): the one query a search sends, from the server only, with the
// environment's search key. No Payload or Next.js imports, so the unit tests
// read it too; the page passes the visitor's address and the secret.
import { createHmac } from "node:crypto";
import type { Locale } from "../cms/locales.ts";
import { type AlgoliaClient, AlgoliaError, algoliaRequest } from "./algolia.ts";
import { indexName, isIndexEnvironment } from "./algolia-record.ts";

/** The most parts a results page lists. */
export const PART_RESULTS = 20;

/**
 * How long the page waits for Algolia. Beyond it, the page shows the models
 * and says the part search is unavailable, rather than waiting on.
 */
export const PART_SEARCH_TIMEOUT_MS = 2_000;

/** An environment's search connection: its own index and search key. */
export type SearchConnection = { client: AlgoliaClient; index: string };

/**
 * The search connection of this environment, or null when Algolia is not set
 * up here: the page then says the part search is unavailable.
 * ALGOLIA_SEARCH_URL replaces Algolia's host for the end-to-end tests' fake,
 * and is refused on Vercel, so a deployment only ever queries Algolia.
 */
export function searchConnectionFromEnvironment(
  env: Record<string, string | undefined>,
): SearchConnection | null {
  const appId = env.ALGOLIA_APP_ID?.trim();
  const key = env.ALGOLIA_SEARCH_KEY?.trim();
  const environment = env.ALGOLIA_ENVIRONMENT?.trim();
  if (!appId || !key || !environment || !isIndexEnvironment(environment))
    return null;
  const baseUrl = env.ALGOLIA_SEARCH_URL?.trim();
  if (baseUrl && env.VERCEL_ENV) return null;
  return {
    client: {
      appId,
      key,
      // The Distributed Search Network host serves reads from the nearest
      // cluster; writes keep the main host (site/algolia.ts).
      baseUrl: baseUrl || `https://${appId}-dsn.algolia.net`,
    },
    index: indexName(environment),
  };
}

/**
 * The visitor token sent with each query, so the search key's hourly limit
 * applies to each visitor rather than to the server's address: a keyed hash
 * of the visitor's address, which Algolia never sees. 32 hexadecimal
 * characters, within Algolia's user token format.
 */
export function visitorToken(address: string, secret: string): string {
  if (!secret) throw new Error("A visitor token needs a secret.");
  return createHmac("sha256", secret)
    .update(`algolia-visitor:${address}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * The search request's body (ADR 0010): only the visitor's language's name,
 * plus the reference, the compatible models and the brand, with typo
 * tolerance (the index's default); only the fields the page shows; no
 * highlighting; Algolia's analytics and personalization off.
 */
export function partsQuery(locale: Locale, query: string) {
  return {
    query,
    restrictSearchableAttributes: [
      `name_${locale}`,
      "reference",
      "models",
      "brand",
    ],
    queryLanguages: [locale],
    attributesToRetrieve: [
      "reference",
      "brand",
      "priceCents",
      `name_${locale}`,
      `path_${locale}`,
    ],
    attributesToHighlight: [],
    attributesToSnippet: [],
    hitsPerPage: PART_RESULTS,
    analytics: false,
    clickAnalytics: false,
    enablePersonalization: false,
  };
}

/** A part a search found, in the page's language. */
export type PartHit = {
  reference: string;
  brand: string;
  priceCents: number;
  name: string;
  path: string;
};

export type PartSearch =
  | {
      status: "ok";
      parts: PartHit[];
      /** How many records match, of which the page lists PART_RESULTS. */
      total: number;
      /** Algolia's own processing time, without the network. */
      processingMs: number;
    }
  | {
      /** Not set up here, refused (a limit or the quota), failed or too slow. */
      status: "unavailable";
      reason: string;
    };

type Hit = Record<string, unknown>;

/** A hit as the page shows it, or null when a field is missing. */
function partOf(hit: Hit, locale: Locale): PartHit | null {
  const { reference, brand, priceCents } = hit;
  const name = hit[`name_${locale}`];
  const path = hit[`path_${locale}`];
  if (
    typeof reference !== "string" ||
    typeof brand !== "string" ||
    typeof priceCents !== "number" ||
    typeof name !== "string" ||
    typeof path !== "string" ||
    // A site path, never a link elsewhere.
    !path.startsWith(`/${locale}/`)
  )
    return null;
  return { reference, brand, priceCents, name, path };
}

/**
 * The parts matching a query. Never throws: a failure is "unavailable", with
 * its reason for the server's log, so the page still shows the models.
 */
export async function searchParts(
  connection: SearchConnection | null,
  { locale, query, token }: { locale: Locale; query: string; token: string },
  timeoutMs = PART_SEARCH_TIMEOUT_MS,
): Promise<PartSearch> {
  if (!connection) return { status: "unavailable", reason: "not configured" };
  try {
    const response = await algoliaRequest<{
      hits: Hit[];
      nbHits: number;
      processingTimeMS: number;
    }>(
      connection.client,
      "POST",
      `/1/indexes/${encodeURIComponent(connection.index)}/query`,
      partsQuery(locale, query),
      { headers: { "X-Algolia-UserToken": token }, timeoutMs },
    );
    const parts = response.hits
      .map((hit) => partOf(hit, locale))
      .filter((part): part is PartHit => part !== null);
    return {
      status: "ok",
      parts,
      total: response.nbHits,
      processingMs: response.processingTimeMS,
    };
  } catch (error) {
    const reason =
      error instanceof AlgoliaError
        ? `status ${error.status}`
        : error instanceof Error && error.name === "TimeoutError"
          ? "timeout"
          : "network";
    return { status: "unavailable", reason };
  }
}
