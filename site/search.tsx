// The search results page (docs/adr/0010-search.md, issue #113), at
// /<lang>/<search word>?q=<query>. The header's search box sends a plain GET
// form here, so the browser runs no search code. Models are found in
// PostgreSQL by their search key (site/model-search.ts). Parts from Algolia
// join this page in a later part of ADR 0010's step.
//
// Not cached: each query is different, so storing its results would fill the
// Runtime Cache with entries that are rarely read again.
import config from "@payload-config";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { getPayload } from "payload";
import type { Locale } from "../cms/locales.ts";
import { modelPath, perLocale, searchPath } from "./addresses.ts";
import { fill, getDictionary } from "./dictionary.ts";
import { SiteFrame } from "./frame.tsx";
import { findModels, MODEL_RESULTS } from "./model-search.ts";
import { searchKey } from "./search-key.ts";

async function database() {
  const payload = await getPayload({ config });
  return (payload.db as unknown as PostgresAdapter).drizzle;
}

/**
 * The results page for a query. The search route has already sent a query
 * matching exactly one model to that model's page; an address typed with
 * such a query lists that model. An empty query shows a hint only.
 */
export async function SearchPage({
  locale,
  query,
}: {
  locale: Locale;
  query: string;
}) {
  const dictionary = getDictionary(locale);
  const key = query ? searchKey(query) : null;
  // One more row than the page lists, to tell whether more models match.
  const found = key
    ? await findModels(await database(), key, MODEL_RESULTS + 1)
    : [];
  const models = found.slice(0, MODEL_RESULTS);

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
      ) : models.length === 0 ? (
        <p data-search-empty className="mt-4 max-w-prose text-lg">
          {fill(dictionary.searchNoModel, { query })}
        </p>
      ) : (
        <>
          <h2 className="mt-10 mb-4 text-2xl font-bold">
            {dictionary.searchModels}
          </h2>
          <ul data-list="models" className="reference-list">
            {models.map((model) => (
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
    </SiteFrame>
  );
}
