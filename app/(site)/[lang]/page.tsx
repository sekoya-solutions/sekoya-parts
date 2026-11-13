// The home page in each language (issue #81): the tagline and the categories,
// each with its number of products and a link to its first page. The
// showcase products join it in phase 3, step 6. Built from the shared
// category entries of site/categories.tsx; the page itself is not cached.
import type { Metadata } from "next";
import { categoryPath, homePath } from "../../../site/addresses.ts";
import { getCategories, getCategoryCounts } from "../../../site/categories.tsx";
import { fill, getDictionary } from "../../../site/dictionary.ts";
import { homeAlternates } from "../../../site/home.ts";
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
    <main>
      <h1>Sekoya Parts</h1>
      <p>{dictionary.homeTagline}</p>
      <h2>{dictionary.categories}</h2>
      <ul>
        {sorted.map((category) => (
          <li key={category.id}>
            <a href={categoryPath(locale, category.slugs[locale])}>
              {category.names[locale]}
            </a>{" "}
            <span>
              {fill(dictionary.productCount, {
                count: format.format(counts[category.id] ?? 0),
              })}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
