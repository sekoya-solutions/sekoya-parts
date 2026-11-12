// Experiment 2's temporary page, /experiments/references/<count>: product 1's
// page with 250, 500, 1,000 or 2,000 references, on Vercel previews only
// (docs/adr/0009-compatible-references.md). Removed before the experiment's
// pull request is merged.
import { notFound } from "next/navigation";
import { MILLION_PRODUCT_ID } from "../../../../../catalog/generator.ts";
import type { Locale } from "../../../../../cms/locales.ts";
import {
  EXPERIMENT_REFERENCE_COUNTS,
  experimentReferenceCount,
} from "../../../../../site/experiment.ts";
import {
  getProductHeading,
  ProductView,
} from "../../../../../site/product.tsx";

// Built in advance, like product 1's own page. Outside a preview the guard
// gives each of them a 404 at build time.
export function generateStaticParams() {
  return EXPERIMENT_REFERENCE_COUNTS.map((count) => ({
    count: String(count),
  }));
}

const locale: Locale = "fr";

export default async function ExperimentReferencesPage({
  params,
}: PageProps<"/experiments/references/[count]">) {
  const { count: raw } = await params;
  const count = experimentReferenceCount(raw, process.env);
  if (count === null) notFound();
  const heading = await getProductHeading(MILLION_PRODUCT_ID, locale);
  if (!heading) notFound();

  return (
    <ProductView
      id={MILLION_PRODUCT_ID}
      heading={heading}
      locale={locale}
      references={count}
    />
  );
}
