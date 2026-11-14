// The search results page (docs/adr/0010-search.md, issues #113 and #119),
// at /<lang>/<search word>?q=<query>. The header's search box sends a plain
// GET form here, so the browser runs no search code and talks to no third
// party. Models are found in PostgreSQL by their search key
// (site/model-search.ts), parts by Algolia (site/algolia-search.ts), both at
// once, from the server.
//
// Not cached: each query is different, so storing its results would fill the
// Runtime Cache with entries that are rarely read again.
import config from "@payload-config";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { headers } from "next/headers";
import { getPayload } from "payload";
import type { Locale } from "../cms/locales.ts";
import { modelPath, perLocale, searchPath } from "./addresses.ts";
import {
  type PartSearch,
  searchConnectionFromEnvironment,
  searchParts,
  visitorToken,
} from "./algolia-search.ts";
import { fill, getDictionary } from "./dictionary.ts";
import { SiteFrame } from "./frame.tsx";
import { findModels, MODEL_RESULTS, type ModelMatch } from "./model-search.ts";
import { formatPrice } from "./product.tsx";
import { MAX_QUERY_LENGTH, searchKey } from "./search-key.ts";

/** Milliseconds since `start`, to a tenth. */
const since = (start: number) =>
  Math.round((performance.now() - start) * 10) / 10;

/** The models matching a search key, one more than the page lists. */
async function modelSearch(key: string | null) {
  const start = performance.now();
  if (!key) return { found: [] as ModelMatch[], ms: 0 };
  const payload = await getPayload({ config });
  const db = (payload.db as unknown as PostgresAdapter).drizzle;
  const found = await findModels(db, key, MODEL_RESULTS + 1);
  return { found, ms: since(start) };
}

/**
 * The visitor's address, as Vercel sets it: x-real-ip, or the first entry of
 * x-forwarded-for, which Vercel overwrites so a visitor cannot forge it.
 * Locally there may be none, and every request shares one token.
 */
async function visitorAddress(): Promise<string> {
  const list = await headers();
  return (
    list.get("x-real-ip")?.trim() ||
    list.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** The parts matching a query, from this environment's Algolia index. */
async function partSearch(locale: Locale, query: string) {
  const start = performance.now();
  const result: PartSearch = await searchParts(
    searchConnectionFromEnvironment(process.env),
    {
      locale,
      query,
      token: visitorToken(
        await visitorAddress(),
        process.env.PAYLOAD_SECRET ?? "",
      ),
    },
  );
  return { result, ms: since(start) };
}

/**
 * The results page for a query. The search route has already sent a query
 * matching exactly one model to that model's page; an address typed with
 * such a query lists that model. An empty or too long query searches nothing.
 */
export async function SearchPage({
  locale,
  query,
}: {
  locale: Locale;
  query: string;
}) {
  const dictionary = getDictionary(locale);
  const searched = query.length > 0 && query.length <= MAX_QUERY_LENGTH;
  // Both lookups at once: the page waits for the slower one only.
  const [models, parts] = searched
    ? await Promise.all([
        modelSearch(searchKey(query)),
        partSearch(locale, query),
      ])
    : [null, null];
  if (models && parts) {
    // One line per search for the server's log: durations only, never the
    // query or the visitor.
    console.info(
      JSON.stringify({
        event: "search",
        modelsMs: models.ms,
        partsMs: parts.ms,
        parts: parts.result.status,
        ...(parts.result.status === "ok"
          ? { algoliaProcessingMs: parts.result.processingMs }
          : { reason: parts.result.reason }),
      }),
    );
  }
  const found = models?.found ?? [];
  const shownModels = found.slice(0, MODEL_RESULTS);
  const result = parts?.result;
  const shownParts = result?.status === "ok" ? result.parts : [];

  return (
    <SiteFrame
      locale={locale}
      paths={perLocale((other) => searchPath(other, query))}
      query={query}
    >
      <h1 className="text-3xl font-bold sm:text-4xl">
        {query
          ? fill(dictionary.searchResultsFor, { query })
          : dictionary.searchTitle}
      </h1>
      {!query ? (
        <p className="mt-4 max-w-prose text-lg">{dictionary.searchHint}</p>
      ) : (
        // The durations, for the latency measurement (issue #119): data
        // attributes only, with no visible text.
        <div
          data-search-results
          data-models-ms={models?.ms}
          data-parts-ms={parts?.ms}
          data-parts-status={result?.status}
        >
          {shownModels.length === 0 ? (
            <p data-search-empty className="mt-4 max-w-prose text-lg">
              {fill(dictionary.searchNoModel, { query })}
            </p>
          ) : (
            <>
              <h2 className="mt-10 mb-4 text-2xl font-bold">
                {dictionary.searchModels}
              </h2>
              <ul data-list="models" className="reference-list">
                {shownModels.map((model) => (
                  <li key={`${model.brandSlug}-${model.reference}`}>
                    <a href={modelPath(locale, model)}>
                      {model.brand} {model.reference}
                    </a>
                  </li>
                ))}
              </ul>
              {found.length > MODEL_RESULTS && (
                <p className="mt-4 max-w-prose">
                  {fill(dictionary.searchMoreModels, { count: MODEL_RESULTS })}
                </p>
              )}
            </>
          )}
          <h2 className="mt-10 mb-4 text-2xl font-bold">
            {dictionary.searchParts}
          </h2>
          {result?.status === "unavailable" ? (
            <p data-parts-unavailable className="max-w-prose">
              {dictionary.searchPartsUnavailable}
            </p>
          ) : shownParts.length === 0 ? (
            <p data-parts-empty className="max-w-prose">
              {fill(dictionary.searchNoPart, { query })}
            </p>
          ) : (
            <>
              <ul data-list="parts" className="space-y-2">
                {shownParts.map((part) => (
                  <li key={part.reference}>
                    <a href={part.path}>{part.name}</a>{" "}
                    <span>{formatPrice(part.priceCents, locale)}</span>
                  </li>
                ))}
              </ul>
              {result?.status === "ok" && result.total > shownParts.length && (
                <p className="mt-4 max-w-prose">
                  {fill(dictionary.searchMoreParts, {
                    count: shownParts.length,
                  })}
                </p>
              )}
            </>
          )}
          {/* Algolia's attribution (ADR 0010): plain text, no script. */}
          <p className="mt-10 text-sm">
            <a href="https://www.algolia.com/" rel="noopener">
              Search by Algolia
            </a>
          </p>
        </div>
      )}
    </SiteFrame>
  );
}
