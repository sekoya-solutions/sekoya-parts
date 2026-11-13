// Two templates share the address shape /<lang>/<section>/<entry>
// (docs/adr/0011-languages-and-seo.md):
// - the product page, /<lang>/<category slug>/<words>-<reference>;
// - the model page, /<lang>/<model word>/<brand slug>-<model reference>.
// The section tells them apart: Payload refuses a category slug equal to a
// model word, in any language. Each page is found by its stable key, and any
// other words, section or letter case redirect permanently to its address.
import type { Metadata } from "next";
import type { Locale } from "../../../../../cms/locales.ts";
import {
  isModelWord,
  languageAlternates,
  referencePagePath,
} from "../../../../../site/addresses.ts";
import {
  applianceTypeName,
  fill,
  getDictionary,
} from "../../../../../site/dictionary.ts";
import {
  getReferenceRows,
  getReferenceTotal,
  ModelProducts,
  ReferenceList,
} from "../../../../../site/models.tsx";
import {
  ProductDescription,
  ProductPrice,
} from "../../../../../site/product.tsx";
import { PRODUCT_PAGE_REFERENCES } from "../../../../../site/references.ts";
import {
  localeOf,
  millionProductParams,
  resolveModel,
  resolveProduct,
} from "../../../../../site/resolve.ts";

// Built in advance in each language: the product with a million compatible
// models. The other products and the models render on their first visit
// (docs/adr/0008-caching-and-partial-refresh.md).
export async function generateStaticParams({
  params,
}: {
  params: { lang: string };
}) {
  return [await millionProductParams(params.lang)];
}

type Props = PageProps<"/[lang]/[section]/[entry]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, section, entry } = await params;
  const locale = localeOf(lang);
  if (isModelWord(section)) {
    const model = await resolveModel(locale, section, entry);
    const type = applianceTypeName(getDictionary(locale), model.applianceType);
    return {
      title: `${type} ${model.brand} ${model.reference} | Sekoya Parts`,
      alternates: {
        canonical: model.paths[locale],
        languages: languageAlternates(model.paths, model.paths.fr),
      },
    };
  }
  const route = await resolveProduct(locale, section, entry);
  return {
    title: `${route.names[locale]} | Sekoya Parts`,
    alternates: {
      canonical: route.paths[locale],
      languages: languageAlternates(route.paths, route.paths.fr),
    },
  };
}

// params is read outside any Suspense boundary: with partialPrefetching off,
// a first visit then waits for the full render and gets complete HTML, and a
// redirect or a 404 gets its own status code.
export default async function EntryPage({ params }: Props) {
  const { lang, section, entry } = await params;
  const locale = localeOf(lang);
  return isModelWord(section)
    ? ModelPage(locale, section, entry)
    : ProductPage(locale, section, entry);
}

async function ProductPage(locale: Locale, section: string, entry: string) {
  const route = await resolveProduct(locale, section, entry);
  const { id } = route;
  const dictionary = getDictionary(locale);
  const [references, total] = await Promise.all([
    getReferenceRows(id, 1, PRODUCT_PAGE_REFERENCES),
    getReferenceTotal(id),
  ]);

  return (
    <main>
      <h1 data-computed-at={route.computedAt}>{route.names[locale]}</h1>
      <ProductPrice id={id} locale={locale} />
      <ProductDescription id={id} locale={locale} />
      <h2>{dictionary.compatibleModels}</h2>
      <ReferenceList references={references} locale={locale} />
      {total > PRODUCT_PAGE_REFERENCES && (
        <p>
          <a href={referencePagePath(route.paths[locale], 1)}>
            {fill(dictionary.allCompatibleModels, {
              count: new Intl.NumberFormat(locale).format(total),
            })}
          </a>
        </p>
      )}
    </main>
  );
}

async function ModelPage(locale: Locale, section: string, entry: string) {
  const model = await resolveModel(locale, section, entry);
  const dictionary = getDictionary(locale);

  return (
    <main>
      <h1 data-computed-at={model.computedAt}>
        {model.brand} {model.reference}
      </h1>
      <p>{applianceTypeName(dictionary, model.applianceType)}</p>
      <h2>{dictionary.compatibleParts}</h2>
      <ModelProducts id={model.id} locale={locale} />
    </main>
  );
}
