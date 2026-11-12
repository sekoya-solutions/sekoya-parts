// The product page at /<lang>/<category slug>/<words>-<reference>
// (docs/adr/0011-languages-and-seo.md). The page is found by its reference;
// any other words, category slug or letter case redirect permanently to the
// product's address in that language.
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  MILLION_PRODUCT_ID,
  productReference,
} from "../../../../../catalog/generator.ts";
import {
  isLocale,
  languageAlternates,
  parseProductSegment,
} from "../../../../../site/addresses.ts";
import { getDictionary } from "../../../../../site/dictionary.ts";
import {
  getProductRoute,
  ProductDescription,
  ProductPrice,
  ProductReferences,
  readProductRoute,
} from "../../../../../site/product.tsx";

// Built in advance in each language: the product with a million compatible
// models. The others render on their first visit
// (docs/adr/0008-caching-and-partial-refresh.md).
export async function generateStaticParams({
  params,
}: {
  params: { lang: string };
}) {
  const reference = productReference(MILLION_PRODUCT_ID);
  const found = await readProductRoute(reference);
  if (!found || !isLocale(params.lang))
    throw new Error(
      `Product ${reference} is missing in ${params.lang}: load the catalog before building.`,
    );
  const [, , category, product] = found.route.paths[params.lang].split("/");
  return [{ category, product }];
}

type Props = PageProps<"/[lang]/[category]/[product]">;

/** The product this address names; otherwise a 404 or a permanent redirect. */
async function resolve(params: Props["params"]) {
  const { lang, category, product } = await params;
  if (!isLocale(lang)) notFound();
  const reference = parseProductSegment(product);
  if (reference === null) notFound();
  const route = await getProductRoute(reference);
  if (!route) notFound();
  const path = route.paths[lang];
  if (path !== `/${lang}/${category}/${product}`) permanentRedirect(path);
  return { lang, route };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, route } = await resolve(params);
  return {
    title: `${route.names[lang]} | Sekoya Parts`,
    alternates: {
      canonical: route.paths[lang],
      languages: languageAlternates(route.paths, route.paths.fr),
    },
  };
}

export default async function ProductPage({ params }: Props) {
  // params is read outside any Suspense boundary: with partialPrefetching off,
  // a first visit then waits for the full render and gets complete HTML, and
  // a redirect or a 404 gets its own status code.
  const { lang, route } = await resolve(params);
  const { id } = route;

  return (
    <main>
      <h1 data-computed-at={route.computedAt}>{route.names[lang]}</h1>
      <ProductPrice id={id} locale={lang} />
      <ProductDescription id={id} locale={lang} />
      <h2>{getDictionary(lang).compatibleModels}</h2>
      <ProductReferences id={id} />
    </main>
  );
}
