// A category's first page, at /<lang>/<category slug> (issue #81,
// docs/adr/0011-languages-and-seo.md). Its other pages are at
// /<lang>/<category slug>/<n>, which the entry route hands to the same
// template.
import type { Metadata } from "next";
import { getCategories } from "../../../../site/categories.tsx";
import {
  CategoryPage,
  categoryMetadata,
  requestedPath,
} from "../../../../site/category-page.tsx";
import { localeOf } from "../../../../site/resolve.ts";

// Built in advance: each category's first page in each language. The other
// pages render on their first visit (docs/adr/0008-caching-and-partial-refresh.md).
export async function generateStaticParams({
  params,
}: {
  params: { lang: string };
}) {
  const locale = localeOf(params.lang);
  const categories = await getCategories();
  if (categories.length === 0)
    throw new Error("No category: load the catalog before building.");
  return categories.map((category) => ({ section: category.slugs[locale] }));
}

type Props = PageProps<"/[lang]/[section]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, section } = await params;
  return categoryMetadata(
    localeOf(lang),
    section,
    1,
    requestedPath(lang, section),
  );
}

// params is read outside any Suspense boundary, as on the product page.
export default async function CategoryFirstPage({ params }: Props) {
  const { lang, section } = await params;
  return (
    <CategoryPage
      locale={localeOf(lang)}
      section={section}
      page={1}
      path={requestedPath(lang, section)}
    />
  );
}
