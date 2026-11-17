// Four templates share the address shape /<lang>/<section>/<entry>
// (docs/adr/0011-languages-and-seo.md):
// - the product page, /<lang>/<category slug>/<words>-<reference>;
// - the model page, /<lang>/<model word>/<brand slug>-<model reference>;
// - a category page after the first, /<lang>/<category slug>/<n> (issue #81);
// - a brand listing's first page, /<lang>/<brand word>/<brand slug> (issue
//   #147).
// The section tells models and brands apart: Payload refuses a category slug
// equal to a model or brand word, in any language. An entry of digits only is a category page:
// Payload refuses a product reference without a letter. Each page is found by its stable key, and any
// other words, section or letter case redirect permanently to its address.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "../../../../../cms/locales.ts";
import {
  categoryPath,
  fitPath,
  isBrandWord,
  isModelWord,
  isPageSegment,
  languageAlternates,
  parsePageNumber,
  referencePagePath,
} from "../../../../../site/addresses.ts";
import { BrandPage, brandMetadata } from "../../../../../site/brands.tsx";
import { Breadcrumbs } from "../../../../../site/breadcrumbs.tsx";
import { getCategories } from "../../../../../site/categories.tsx";
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
import { FitCheck } from "../../../../../site/fit-check.tsx";
import { fitCheckLabels } from "../../../../../site/fit-labels.ts";
import { SiteFrame } from "../../../../../site/frame.tsx";
import { productGallery } from "../../../../../site/images.ts";
import {
  getReferenceRows,
  getReferenceTotal,
  ModelProducts,
  ReferenceList,
} from "../../../../../site/models.tsx";
import {
  ProductAvailability,
  ProductDescription,
  ProductPrice,
} from "../../../../../site/product.tsx";
import { ProductGallery } from "../../../../../site/product-gallery.tsx";
import { RecentlyViewed } from "../../../../../site/recently-viewed.tsx";
import { PRODUCT_PAGE_REFERENCES } from "../../../../../site/references.ts";
import { RelatedProducts } from "../../../../../site/related.tsx";
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
  if (isBrandWord(section))
    return brandMetadata(locale, entry, 1, requestedPath(lang, section, entry));
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
  if (isBrandWord(section))
    return (
      <BrandPage
        locale={locale}
        entry={entry}
        page={1}
        path={requestedPath(lang, section, entry)}
      />
    );
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
  const gallery = productGallery(route.categoryId, id);
  const hasGallery = gallery.length > 0;
  // The text's column from 48rem: beside the gallery, or the only one.
  const beside = hasGallery ? "md:col-start-2" : "";
  const [references, total, categories] = await Promise.all([
    getReferenceRows(id, 1, PRODUCT_PAGE_REFERENCES),
    getReferenceTotal(id),
    getCategories(),
  ]);
  const category = categories.find((c) => c.id === route.categoryId);

  return (
    <SiteFrame locale={locale} template="product" paths={route.paths}>
      <Breadcrumbs
        locale={locale}
        crumbs={[
          ...(category
            ? [
                {
                  name: category.names[locale],
                  path: categoryPath(locale, category.slugs[locale]),
                },
              ]
            : []),
          { name: route.names[locale], path: route.paths[locale] },
        ]}
      />
      {/* The picture leads on phones (issue #200): the name, then the
          gallery at the page's full width, its first picture the page's
          largest element, then the price, the availability and the
          description. From 48rem, the gallery takes its 28rem column beside
          all the text. A product without pictures keeps its text at the
          full width. */}
      <div
        className={
          hasGallery
            ? "grid grid-cols-1 gap-y-4 md:grid-cols-[28rem_1fr] md:grid-rows-[auto_auto_1fr] md:gap-x-8"
            : "grid grid-cols-1 gap-y-4"
        }
      >
        <h1
          data-computed-at={route.computedAt}
          className={`text-2xl font-bold sm:text-4xl ${beside} md:row-start-1`}
        >
          {route.names[locale]}
        </h1>
        {hasGallery && (
          <ProductGallery
            images={gallery}
            name={route.names[locale]}
            locale={locale}
            className="min-w-0 md:col-start-1 md:row-span-3 md:row-start-1"
          />
        )}
        <div className={`${beside} md:row-start-2`}>
          <ProductPrice id={id} locale={locale} />
          <ProductAvailability id={id} locale={locale} />
        </div>
        <div className={`${beside} md:row-start-3`}>
          <ProductDescription id={id} locale={locale} />
        </div>
      </div>
      {/* The same form for every visitor: the answer only appears once they
          type, in the browser, or on the result page without JavaScript
          (issue #161). */}
      <div className="mt-10">
        <FitCheck
          locale={locale}
          part={route.reference}
          action={fitPath(locale)}
          labels={fitCheckLabels(dictionary)}
        />
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
      <RelatedProducts id={id} locale={locale} />
      {/* The same empty space for every visitor, filled in the browser from
          its own history (issue #162). */}
      <RecentlyViewed
        locale={locale}
        reference={route.reference}
        name={route.names[locale]}
        path={route.paths[locale]}
        labels={{
          recentlyViewed: dictionary.recentlyViewed,
          recentlyViewedClear: dictionary.recentlyViewedClear,
          recentlyViewedCleared: dictionary.recentlyViewedCleared,
        }}
      />
    </SiteFrame>
  );
}

async function ModelPage(locale: Locale, section: string, entry: string) {
  const model = await resolveModel(locale, section, entry);
  const dictionary = getDictionary(locale);

  return (
    <SiteFrame locale={locale} template="model" paths={model.paths}>
      <Breadcrumbs
        locale={locale}
        crumbs={[
          {
            name: `${model.brand} ${model.reference}`,
            path: model.paths[locale],
          },
        ]}
      />
      <h1
        data-computed-at={model.computedAt}
        className="text-3xl font-bold sm:text-4xl"
      >
        {model.brand} {model.reference}
      </h1>
      <p className="mt-1 text-lg text-slate">
        {applianceTypeName(dictionary, model.applianceType)}
      </p>
      {/* The first screen's largest element, painted with the HTML rather
          than after the card images (issue #87); e2e/intro.spec.ts checks it. */}
      <p data-intro className="mt-4 max-w-prose text-lg">
        {fill(dictionary.modelIntro, {
          model: `${model.brand} ${model.reference}`,
          // As the dictionary writes it: German nouns keep their capital.
          appliance: applianceTypeName(dictionary, model.applianceType),
        })}
      </p>
      <h2 className="mt-10 mb-4 text-2xl font-bold">
        {dictionary.compatibleParts}
      </h2>
      <ModelProducts id={model.id} locale={locale} />
    </SiteFrame>
  );
}
