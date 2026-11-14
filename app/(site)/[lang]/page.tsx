// The home page in each language (issue #81): the tagline and the categories,
// each with its number of products and a link to its first page, then the
// showcase products (issue #111), whose images all load lazily so the first
// screen is unchanged. Built from the shared entries of site/categories.tsx
// and site/showcase.tsx; the page itself is not cached.
import type { Metadata } from "next";
import { categoryPath, homePath, perLocale } from "../../../site/addresses.ts";
import { getCategories, getCategoryCounts } from "../../../site/categories.tsx";
import { fill, getDictionary } from "../../../site/dictionary.ts";
import { SiteFrame } from "../../../site/frame.tsx";
import { homeAlternates } from "../../../site/home.ts";
import { categoryImage } from "../../../site/images.ts";
import {
  CARD_SIZES,
  cardLoading,
  Picture,
  ProductCardImage,
} from "../../../site/picture.tsx";
import { formatPrice } from "../../../site/product.tsx";
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
  const [categories, counts, showcase] = await Promise.all([
    getCategories(),
    getCategoryCounts(),
    getShowcaseRows(),
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
    <SiteFrame locale={locale} paths={perLocale(homePath)}>
      <h1 className="text-3xl font-bold sm:text-4xl">Sekoya Parts</h1>
      <p className="mt-2 text-lg text-slate">{dictionary.homeTagline}</p>
      {/* The first screen's largest element, painted with the HTML rather
          than after the card images (issue #87); e2e/intro.spec.ts checks it. */}
      <p data-intro className="mt-4 max-w-prose text-lg">
        {fill(dictionary.homeIntro, {
          products: format.format(
            Object.values(counts).reduce((sum, count) => sum + count, 0),
          ),
          categories: format.format(categories.length),
        })}
      </p>
      <h2 className="mt-10 text-2xl font-bold">{dictionary.categories}</h2>
      <ul
        data-list="categories"
        className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] sm:gap-4"
      >
        {sorted.map((category, index) => {
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
                  {...cardLoading(index)}
                  className="mb-3 aspect-square h-auto w-full rounded-md"
                />
              )}
              <a
                href={categoryPath(locale, category.slugs[locale])}
                className="text-lg font-bold"
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
            {products.map(({ route, priceCents }, index) => (
              <li key={route.id}>
                <ProductCardImage
                  route={route}
                  locale={locale}
                  index={index}
                  lazy
                />
                <a href={route.paths[locale]}>{route.names[locale]}</a>{" "}
                <span>{formatPrice(priceCents, locale)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </SiteFrame>
  );
}
