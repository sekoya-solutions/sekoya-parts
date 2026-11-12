// A temporary product page address, /product/<id>, in French only. Language
// routing under app/[lang] replaces it in phase 3
// (docs/adr/0011-languages-and-seo.md).
import { notFound } from "next/navigation";
import { MILLION_PRODUCT_ID } from "../../../../catalog/generator.ts";
import { parseProductId } from "../../../../catalog/text.ts";
import type { Locale } from "../../../../cms/locales.ts";
import {
  getProductHeading,
  ProductDescription,
  ProductPrice,
  ProductReferences,
} from "../../../../site/product.tsx";

// Built in advance: the product with a million compatible models. The others
// render on their first visit (docs/adr/0008-caching-and-partial-refresh.md).
export function generateStaticParams() {
  return [{ id: String(MILLION_PRODUCT_ID) }];
}

const locale: Locale = "fr";

export default async function ProductPage({
  params,
}: PageProps<"/product/[id]">) {
  // params is read outside any Suspense boundary: with partialPrefetching off,
  // a first visit then waits for the full render and gets complete HTML.
  const { id: raw } = await params;
  const id = parseProductId(raw);
  if (id === null) notFound();
  const heading = await getProductHeading(id, locale);
  if (!heading) notFound();

  return (
    <main>
      <h1>{heading.name}</h1>
      <ProductPrice id={id} locale={locale} />
      <ProductDescription id={id} locale={locale} />
      <h2>Modèles compatibles</h2>
      <ProductReferences id={id} />
    </main>
  );
}
