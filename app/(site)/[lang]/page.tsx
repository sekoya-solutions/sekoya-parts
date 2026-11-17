// The home page in each language (issue #81): the part finder, whose title is
// the page's <h1> (issue #196), the promotions (issue #155), the categories,
// each with its number of products and a link to its first page, then the
// showcase products (issue #111), whose images all load lazily so the first
// screen is unchanged, and last, before the footer, the site's name, tagline
// and introduction, as a text for search engines (issue #196). Built from the
// shared entries of site/categories.tsx, site/showcase.tsx and
// site/finder-data.ts; the page itself is not cached.

import type { Metadata } from "next";
import {
  categoryPath,
  homePath,
  isApplianceType,
  perLocale,
} from "../../../site/addresses.ts";
import { getBrands } from "../../../site/brands.tsx";
import { getCategories, getCategoryCounts } from "../../../site/categories.tsx";
import {
  applianceTypeName,
  type Dictionary,
  fill,
  getDictionary,
} from "../../../site/dictionary.ts";
import { getTypesByBrand } from "../../../site/finder-data.ts";
import { SiteFrame } from "../../../site/frame.tsx";
import { homeAlternates } from "../../../site/home.ts";
import {
  type FinderBrand,
  type FinderLabels,
  HomeFinder,
} from "../../../site/home-finder.tsx";
import { categoryImage } from "../../../site/images.ts";
import { CARD_SIZES, Picture } from "../../../site/picture.tsx";
import { ProductCard } from "../../../site/product-card.tsx";
import { HomePromotions } from "../../../site/promotions.tsx";
import { localeOf } from "../../../site/resolve.ts";
import { getShowcaseRows } from "../../../site/showcase.tsx";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  return { alternates: homeAlternates(homePath(localeOf(lang))) };
}

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  const locale = localeOf(lang);
  const dictionary = getDictionary(locale);
  const [categories, counts, showcase, brands, typesByBrand] =
    await Promise.all([
      getCategories(),
      getCategoryCounts(),
      getShowcaseRows(),
      getBrands(),
      getTypesByBrand(),
    ]);
  const format = new Intl.NumberFormat(locale);
  const collator = new Intl.Collator(locale);
  const sorted = [...categories].sort((a, b) =>
    collator.compare(a.names[locale], b.names[locale]),
  );
  // By name in the page's language, then by id, so the order never depends
  // on how the entry was read.
  const products = [...showcase.rows].sort(
    (a, b) =>
      collator.compare(a.route.names[locale], b.route.names[locale]) ||
      a.route.id - b.route.id,
  );

  return (
    <SiteFrame locale={locale} template="home" paths={perLocale(homePath)}>
      {/* The part finder (issue #196): brand, appliance type and model in one
          form, rendered here at its final size and brought to life by its
          browser component. */}
      <section aria-labelledby="finder">
        <h1 id="finder" className="text-3xl font-bold sm:text-4xl">
          {dictionary.finderHomeTitle}
        </h1>
        <HomeFinder
          locale={locale}
          brands={finderBrands(brands, typesByBrand, dictionary, collator)}
          labels={finderLabels(dictionary)}
        />
      </section>
      {/* Promotions (issue #155): a slider and tiles, no script. */}
      <HomePromotions locale={locale} />
      <h2 className="mt-10 text-2xl font-bold">{dictionary.categories}</h2>
      <ul
        data-list="categories"
        className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] sm:gap-4"
      >
        {sorted.map((category) => {
          const image = categoryImage(category.id);
          return (
            <li
              key={category.id}
              className="rounded-md border border-line bg-white p-3 sm:p-4"
            >
              {image && (
                <Picture
                  image={image}
                  alt={category.names[locale]}
                  sizes={CARD_SIZES}
                  // Below the finder and the promotions, off the first
                  // screen: lazily, so the first slide's image comes first
                  // (issue #196).
                  className="mb-3 aspect-square h-auto w-full rounded-md"
                />
              )}
              {/* A name too long for a phone's card, such as the Dutch
                  Verwarmingselement, is hyphenated in the page's language, or
                  broken at the edge where the browser has no rules for it
                  (issue #177). */}
              <a
                href={categoryPath(locale, category.slugs[locale])}
                className="text-lg font-bold hyphens-auto wrap-break-word"
              >
                {category.names[locale]}
              </a>
              <span className="mt-1 block text-sm text-slate">
                {fill(dictionary.productCount, {
                  count: format.format(counts[category.id] ?? 0),
                })}
              </span>
            </li>
          );
        })}
      </ul>
      {products.length > 0 && (
        <>
          <h2 className="mt-10 text-2xl font-bold">
            {dictionary.showcaseProducts}
          </h2>
          <ul
            data-list="showcase"
            data-computed-at={showcase.computedAt}
            className="product-list mt-4"
          >
            {products.map(({ route, price }, index) => (
              <ProductCard
                key={route.id}
                route={route}
                price={price}
                locale={locale}
                index={index}
                lazy
              />
            ))}
          </ul>
        </>
      )}
      {/* The site's name and introduction, last, as a text for search
          engines (issue #196). */}
      <section className="mt-12" aria-labelledby="about" data-about>
        <h2 id="about" className="text-2xl font-bold">
          Sekoya Parts
        </h2>
        <p className="mt-2 text-lg text-slate">{dictionary.homeTagline}</p>
        <p data-intro className="mt-4 max-w-prose text-lg">
          {fill(dictionary.homeIntro, {
            products: format.format(
              Object.values(counts).reduce((sum, count) => sum + count, 0),
            ),
            categories: format.format(categories.length),
          })}
        </p>
      </section>
    </SiteFrame>
  );
}

/**
 * The finder's brands, each with the appliance types it has models of, named
 * and sorted in the page's language. A brand with no model yet is left out.
 */
function finderBrands(
  brands: { slug: string; name: string; id: number }[],
  typesByBrand: Record<number, string[]>,
  dictionary: Dictionary,
  collator: Intl.Collator,
): FinderBrand[] {
  return brands.flatMap((brand) => {
    const types = (typesByBrand[brand.id] ?? []).filter(isApplianceType);
    if (types.length === 0) return [];
    return [
      {
        slug: brand.slug,
        name: brand.name,
        types: types
          .map((value) => ({
            value,
            name: applianceTypeName(dictionary, value),
          }))
          .sort((a, b) => collator.compare(a.name, b.name)),
      },
    ];
  });
}

/** The finder's labels, so the browser loads no dictionary. */
const finderLabels = (dictionary: Dictionary): FinderLabels => ({
  brand: dictionary.finderBrand,
  chooseBrand: dictionary.finderChooseBrand,
  noBrand: dictionary.finderNoBrand,
  type: dictionary.finderType,
  chooseType: dictionary.finderChooseType,
  model: dictionary.finderModel,
  chooseModel: dictionary.finderChooseModel,
  popular: dictionary.finderPopular,
  noModel: dictionary.finderNoMatch,
  searching: dictionary.finderSearching,
  error: dictionary.finderError,
  submit: dictionary.finderNext,
});
