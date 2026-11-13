// Three templates share the address shape /<lang>/<section>/<entry>
// (docs/adr/0011-languages-and-seo.md):
// - the product page, /<lang>/<category slug>/<words>-<reference>;
// - the model page, /<lang>/<model word>/<brand slug>-<model reference>;
// - a category page after the first, /<lang>/<category slug>/<n> (issue #81).
// The section tells models apart: Payload refuses a category slug equal to a
// model word, in any language. An entry of digits only is a category page:
// Payload refuses a product reference without a letter. Each page is found by its stable key, and any
// other words, section or letter case redirect permanently to its address.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "../../../../../cms/locales.ts";
import {
  isModelWord,
  isPageSegment,
  languageAlternates,
  parsePageNumber,
  referencePagePath,
} from "../../../../../site/addresses.ts";
import {
  CategoryPage,
  categoryMetadata,
  requestedPath,
} from "../../../../../site/category-page.tsx";
import {
  applianceTypeName,
  fill,
  getDictionary,
} from "../../../../../site/dictionary.ts";
import { SiteFrame } from "../../../../../site/frame.tsx";
import { productImage } from "../../../../../site/images.ts";
import {
  getReferenceRows,
  getReferenceTotal,
  ModelProducts,
  ReferenceList,
} from "../../../../../site/models.tsx";
import { MAIN_SIZES, Picture } from "../../../../../site/picture.tsx";
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
  if (isPageSegment(entry) && !isModelWord(section))
    return categoryMetadata(
      locale,
      section,
      categoryPageNumber(entry),
      requestedPath(lang, section, entry),
    );
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
  if (isPageSegment(entry) && !isModelWord(section))
    return (
      <CategoryPage
        locale={locale}
        section={section}
        page={categoryPageNumber(entry)}
        path={requestedPath(lang, section, entry)}
      />
    );
  return isModelWord(section)
    ? ModelPage(locale, section, entry)
    : ProductPage(locale, section, entry);
}

/** A category page's number, or a 404 for 0 or a form such as 01. */
function categoryPageNumber(entry: string): number {
  const page = parsePageNumber(entry);
  if (page === null) notFound();
  return page;
}

async function ProductPage(locale: Locale, section: string, entry: string) {
  const route = await resolveProduct(locale, section, entry);
  const { id } = route;
  const dictionary = getDictionary(locale);
  const image = productImage(route.categoryId, id);
  const [references, total] = await Promise.all([
    getReferenceRows(id, 1, PRODUCT_PAGE_REFERENCES),
    getReferenceTotal(id),
  ]);

  return (
    <SiteFrame locale={locale} paths={route.paths}>
      {/* Text first on phones (issue #85): the image sits small beside the
          name and price, so the text stays the page's largest element and
          appears with the first paint, where an image would wait for the
          font and scripts on a slow connection. From 48rem, the image takes
          its 28rem column beside all the text. */}
      <div className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-4 md:grid-cols-[28rem_1fr] md:grid-rows-[auto_1fr] md:gap-x-8">
        {image && (
          <div className="md:row-span-2">
            <Picture
              image={image}
              alt={route.names[locale]}
              sizes={MAIN_SIZES}
              priority
              className="aspect-square h-auto w-full rounded-md border border-line"
            />
          </div>
        )}
        <div className={image ? undefined : "col-span-2"}>
          <h1
            data-computed-at={route.computedAt}
            className="text-2xl font-bold sm:text-4xl"
          >
            {route.names[locale]}
          </h1>
          <div className="mt-2 md:mt-4">
            <ProductPrice id={id} locale={locale} />
          </div>
        </div>
        <div className="col-span-2 md:col-span-1 md:col-start-2">
          <ProductDescription id={id} locale={locale} />
        </div>
      </div>
      <h2 className="mt-10 mb-4 text-2xl font-bold">
        {dictionary.compatibleModels}
      </h2>
      <ReferenceList references={references} locale={locale} />
      {total > PRODUCT_PAGE_REFERENCES && (
        <p className="pager">
          <a href={referencePagePath(route.paths[locale], 1)}>
            {fill(dictionary.allCompatibleModels, {
              count: new Intl.NumberFormat(locale).format(total),
            })}
          </a>
        </p>
      )}
    </SiteFrame>
  );
}

async function ModelPage(locale: Locale, section: string, entry: string) {
  const model = await resolveModel(locale, section, entry);
  const dictionary = getDictionary(locale);

  return (
    <SiteFrame locale={locale} paths={model.paths}>
      <h1
        data-computed-at={model.computedAt}
        className="text-3xl font-bold sm:text-4xl"
      >
        {model.brand} {model.reference}
      </h1>
      <p className="mt-1 text-lg text-slate">
        {applianceTypeName(dictionary, model.applianceType)}
      </p>
      <h2 className="mt-10 mb-4 text-2xl font-bold">
        {dictionary.compatibleParts}
      </h2>
      <ModelProducts id={model.id} locale={locale} />
    </SiteFrame>
  );
}
