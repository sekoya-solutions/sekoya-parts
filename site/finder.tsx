// The part finder (issue #155, owner decision 2026-11-15): three steps on one
// page, /<lang>/<finder word>, chosen through its query, with no browser code:
// 1. the brand, from a form on the home page and on this page;
// 2. the appliance type, as links, each with its number of models;
// 3. the model: the pair's 24 most popular models, those with the most
//    compatible parts, as links, and a reference field that searches within
//    the pair. The field's form goes to app/(site)/api/finder/route.ts, which
//    answers an exact reference with a real redirect to its model page, as
//    the header search does; this page reads its query, so it streams and
//    could not.
// Like the search page, it is kept out of search engines' indexes.
import { sql } from "@payloadcms/db-postgres";
import { cacheLife, cacheTag } from "next/cache";
import type { ApplianceType } from "../catalog/generator.ts";
import type { Locale } from "../cms/locales.ts";
import {
  type FinderChoice,
  finderPath,
  homePath,
  isApplianceType,
  modelPath,
  POPULAR_MODELS,
  perLocale,
} from "./addresses.ts";
import { type Brand, getBrands } from "./brands.tsx";
import { Breadcrumbs } from "./breadcrumbs.tsx";
import { database } from "./categories.tsx";
import { applianceTypeName, fill, getDictionary } from "./dictionary.ts";
import { SiteFrame } from "./frame.tsx";
import { findModels } from "./model-search.ts";
import { MODEL_RESULTS, searchKey } from "./search-key.ts";
import { brandTag, CATALOG_TAG } from "./tags.ts";

/** Where the finder's reference field sends its form. */
export const FINDER_ROUTE = "/api/finder";

/**
 * A brand's appliance types with their numbers of models. One entry per
 * brand: models change only with a new generation, and the brand's tag
 * covers its name.
 */
export async function getBrandTypes(
  brandId: number,
): Promise<{ type: string; models: number }[]> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(brandTag(brandId), CATALOG_TAG);

  const drizzle = await database();
  const { rows } = await drizzle.execute<{ type: string; models: string }>(sql`
    SELECT appliance_type AS type, count(*) AS models
      FROM appliance_models
     WHERE brand_id = ${brandId}
     GROUP BY appliance_type
  `);
  return rows.map((row) => ({ type: row.type, models: Number(row.models) }));
}

/** One of a pair's popular models. */
export type PopularModel = { reference: string; parts: number };

/**
 * A pair's most popular models: those compatible with the most parts, then
 * by reference, read through the index on (brand, type) and, for each model,
 * the compatibility index on (model, product).
 */
export async function getPopularModels(
  brandId: number,
  type: string,
): Promise<PopularModel[]> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(brandTag(brandId), CATALOG_TAG);

  const drizzle = await database();
  const { rows } = await drizzle.execute<{ reference: string; parts: string }>(
    sql`
    SELECT m.reference, count(c.product_id) AS parts
      FROM appliance_models m
      LEFT JOIN compatibility c ON c.model_id = m.id
     WHERE m.brand_id = ${brandId} AND m.appliance_type = ${type}
     GROUP BY m.id, m.reference
     ORDER BY parts DESC, m.reference
     LIMIT ${POPULAR_MODELS}
  `,
  );
  return rows.map((row) => ({
    reference: row.reference,
    parts: Number(row.parts),
  }));
}

/** The brand and type a choice names, each null when unknown. */
export async function readChoice(choice: FinderChoice) {
  const brand =
    (choice.brand &&
      (await getBrands()).find(
        (b) => b.slug === choice.brand?.toLowerCase(),
      )) ||
    null;
  const type =
    brand && choice.type && isApplianceType(choice.type) ? choice.type : null;
  return { brand, type };
}

/** Step 1: the brand, as a GET form to the finder page. */
export function BrandStep({
  locale,
  brands,
  selected,
}: {
  locale: Locale;
  brands: Brand[];
  selected?: string;
}) {
  const dictionary = getDictionary(locale);
  return (
    <form
      method="get"
      action={finderPath(locale)}
      data-finder-step="brand"
      className="listing-controls"
    >
      <label>
        <span>{dictionary.finderBrand}</span>
        <select name="brand" defaultValue={selected ?? ""} required>
          <option value="" disabled>
            {dictionary.finderChooseBrand}
          </option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.slug}>
              {brand.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">{dictionary.finderNext}</button>
    </form>
  );
}

export async function FinderPage({
  locale,
  choice,
}: {
  locale: Locale;
  choice: FinderChoice;
}) {
  const dictionary = getDictionary(locale);
  const [brands, { brand, type }] = await Promise.all([
    getBrands(),
    readChoice(choice),
  ]);
  const format = new Intl.NumberFormat(locale);
  const step = brand ? (type ? 3 : 2) : 1;
  const query = (choice.q ?? "").trim();
  const key = query ? searchKey(query) : null;
  const [types, popular, matches] = await Promise.all([
    brand && !type ? getBrandTypes(brand.id) : null,
    brand && type ? getPopularModels(brand.id, type) : null,
    brand && type && key
      ? database().then((db) =>
          findModels(db, key, MODEL_RESULTS, { brandId: brand.id, type }),
        )
      : null,
  ]);

  return (
    <SiteFrame
      locale={locale}
      paths={perLocale((l) =>
        finderPath(l, {
          brand: brand?.slug,
          type: type ?? undefined,
          q: query || undefined,
        }),
      )}
    >
      <Breadcrumbs
        locale={locale}
        crumbs={[{ name: dictionary.finderTitle, path: finderPath(locale) }]}
      />
      <h1 className="text-3xl font-bold">{dictionary.finderTitle}</h1>
      <p className="mt-1 text-slate" data-finder-progress={step}>
        {fill(dictionary.finderStep, { step })}
      </p>
      <p data-intro className="mt-4 max-w-prose text-lg">
        {dictionary.finderIntro}
      </p>

      <div className="mt-6">
        <BrandStep locale={locale} brands={brands} selected={brand?.slug} />
      </div>

      {brand && (
        <section className="mt-8" data-finder-step="type">
          <h2 className="text-xl font-bold">
            {fill(dictionary.finderTypes, { brand: brand.name })}
          </h2>
          {types ? (
            <ul className="brand-list mt-3">
              {[...types]
                .sort((a, b) =>
                  applianceTypeName(
                    dictionary,
                    a.type as ApplianceType,
                  ).localeCompare(
                    applianceTypeName(dictionary, b.type as ApplianceType),
                    locale,
                  ),
                )
                .map(({ type: t, models }) => (
                  <li key={t}>
                    <a
                      href={finderPath(locale, { brand: brand.slug, type: t })}
                    >
                      {applianceTypeName(dictionary, t as ApplianceType)}
                    </a>{" "}
                    <span>
                      {fill(dictionary.finderModelCount, {
                        count: format.format(models),
                      })}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-3">
              <strong>
                {applianceTypeName(dictionary, type as ApplianceType)}
              </strong>{" "}
              <a href={finderPath(locale, { brand: brand.slug })}>
                {dictionary.finderChange}
              </a>
            </p>
          )}
        </section>
      )}

      {brand && type && popular && (
        <section className="mt-8" data-finder-step="model">
          <h2 className="text-xl font-bold">{dictionary.finderModel}</h2>
          <form
            method="get"
            action={FINDER_ROUTE}
            className="listing-controls mt-3"
          >
            <input type="hidden" name="lang" value={locale} />
            <input type="hidden" name="brand" value={brand.slug} />
            <input type="hidden" name="type" value={type} />
            <label>
              <span>{dictionary.finderReference}</span>
              <input
                name="q"
                type="search"
                defaultValue={query}
                required
                maxLength={64}
                autoComplete="off"
                className="search-input min-h-11 rounded-md border border-slate px-3"
              />
            </label>
            <button type="submit">{dictionary.searchButton}</button>
          </form>
          {matches && (
            <div className="mt-4" data-finder-matches>
              {matches.length === 0 ? (
                <p>{fill(dictionary.finderNoMatch, { query })}</p>
              ) : (
                <ul className="reference-list">
                  {matches.map((model) => (
                    <li key={model.reference}>
                      <a href={modelPath(locale, model)}>{model.reference}</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <h3 className="mt-6 font-bold">{dictionary.finderPopular}</h3>
          <ul className="reference-list mt-2" data-list="popular-models">
            {popular.map((model) => (
              <li key={model.reference}>
                <a
                  href={modelPath(locale, {
                    brandSlug: brand.slug,
                    reference: model.reference,
                  })}
                >
                  {model.reference}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-8">
        <a href={homePath(locale)}>{dictionary.notFoundHome}</a>
      </p>
    </SiteFrame>
  );
}
