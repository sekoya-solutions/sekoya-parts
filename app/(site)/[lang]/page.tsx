// The home page in each language (issue #81): the tagline and the categories,
// each with its number of products and a link to its first page. The
// showcase products join it in phase 3, step 6. Built from the shared
// category entries of site/categories.tsx; the page itself is not cached.
import type { Metadata } from "next";
import { categoryPath, homePath, perLocale } from "../../../site/addresses.ts";
import { getCategories, getCategoryCounts } from "../../../site/categories.tsx";
import { fill, getDictionary } from "../../../site/dictionary.ts";
import { SiteFrame } from "../../../site/frame.tsx";
import { homeAlternates } from "../../../site/home.ts";
import { categoryImage } from "../../../site/images.ts";
import { CARD_SIZES, EAGER_IMAGES, Picture } from "../../../site/picture.tsx";
import { localeOf } from "../../../site/resolve.ts";

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
  const [categories, counts] = await Promise.all([
    getCategories(),
    getCategoryCounts(),
  ]);
  const format = new Intl.NumberFormat(locale);
  const collator = new Intl.Collator(locale);
  const sorted = [...categories].sort((a, b) =>
    collator.compare(a.names[locale], b.names[locale]),
  );

  return (
    <SiteFrame locale={locale} paths={perLocale(homePath)}>
      <h1 className="text-3xl font-bold sm:text-4xl">Sekoya Parts</h1>
      <p className="mt-2 text-lg text-slate">{dictionary.homeTagline}</p>
      <h2 className="mt-10 text-2xl font-bold">{dictionary.categories}</h2>
      <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
        {sorted.map((category, index) => {
          const image = categoryImage(category.id);
          return (
            <li
              key={category.id}
              className="rounded-md border border-line bg-white p-4"
            >
              {image && (
                <Picture
                  image={image}
                  alt={category.names[locale]}
                  sizes={CARD_SIZES}
                  eager={index < EAGER_IMAGES}
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
    </SiteFrame>
  );
}
