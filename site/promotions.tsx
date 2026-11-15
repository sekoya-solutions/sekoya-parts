// The home page's promotions (issue #155): a slider of the running slides and
// a row of tiles, over the owner's images, with no browser code. The slider is
// a CSS scroll-snap strip: it moves by swiping, by the scroll bar, or by its
// numbered links, which are plain anchors, and it never moves by itself.
//
// One cached entry holds every promotion, refreshed by any save (the
// promotions tag) and expiring at the next start or end date, like the sale
// prices (ADR 0008), so a promotion shows and hides on time without a save.
// The links are built per language from the categories' own entry, so a
// renamed category refreshes them through its own tag.
import config from "@payload-config";
import { cacheTag } from "next/cache";
import { getPayload } from "payload";
import type { Locale } from "../cms/locales.ts";
import { getCategories } from "./categories.tsx";
import { fill, getDictionary } from "./dictionary.ts";
import { Picture } from "./picture.tsx";
import { setLifetimeUntil } from "./price-cache.ts";
import { computedAt } from "./product.tsx";
import {
  isRunning,
  nextPromotionChange,
  type PromotionKind,
  type PromotionLink,
  promotionPath,
} from "./promotion-rules.ts";
import { CATALOG_TAG, PROMOTIONS_TAG } from "./tags.ts";

type PerLocale = Record<string, string | null | undefined>;

/** A running promotion, in every language. */
export type Promotion = {
  id: number;
  kind: PromotionKind;
  image: number;
  linkTo: PromotionLink;
  category: string | null;
  headline: PerLocale;
  text: PerLocale;
};

const perLocale = (value: unknown): PerLocale =>
  value !== null && typeof value === "object" ? (value as PerLocale) : {};

/** The running promotions, in order, with when they were read. */
export async function getPromotions(): Promise<{
  promotions: Promotion[];
  computedAt: string;
}> {
  "use cache: remote";
  cacheTag(PROMOTIONS_TAG, CATALOG_TAG);

  const now = Date.now();
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "promotions",
    locale: "all",
    depth: 0,
    sort: "order",
    pagination: false,
  });
  // Until the next start or end among all of them, shown or not yet.
  setLifetimeUntil(nextPromotionChange(docs, now), now);
  return {
    promotions: docs
      .filter((doc) => isRunning(doc, now))
      .map((doc) => ({
        id: doc.id,
        kind: doc.kind,
        image: doc.image,
        linkTo: doc.linkTo,
        category: doc.category ?? null,
        headline: perLocale(doc.headline),
        text: perLocale(doc.text),
      })),
    computedAt: computedAt(),
  };
}

/** A text in a language, or the French source, as Payload falls back. */
const inLocale = (values: PerLocale, locale: Locale): string =>
  values[locale] || values.fr || "";

const imageOf = (promotion: Promotion) => ({
  folder: promotion.kind === "slide" ? "promotion-slides" : "promotion-tiles",
  n: promotion.image,
});

/** The slides fill the page's width: 72rem at most, less its 1rem margins. */
const SLIDE_SIZES = "(min-width: 72rem) 70rem, calc(100vw - 2rem)";

/** Tiles: one per row on phones, three from 40rem. */
const TILE_SIZES =
  "(min-width: 72rem) 22rem, (min-width: 40rem) 30vw, calc(100vw - 2rem)";

export async function HomePromotions({ locale }: { locale: Locale }) {
  const dictionary = getDictionary(locale);
  const [{ promotions, computedAt: at }, categories] = await Promise.all([
    getPromotions(),
    getCategories(),
  ]);
  const slides = promotions.filter((p) => p.kind === "slide");
  const tiles = promotions.filter((p) => p.kind === "tile");
  if (promotions.length === 0) return null;
  return (
    <div data-promotions data-computed-at={at}>
      {slides.length > 0 && (
        <section
          aria-roledescription="carousel"
          aria-label={dictionary.promotions}
          className="mt-8"
        >
          <ul className="slider">
            {slides.map((slide, index) => (
              <li
                key={slide.id}
                id={`slide-${index + 1}`}
                aria-roledescription="slide"
                aria-label={fill(dictionary.slideOf, {
                  slide: index + 1,
                  slides: slides.length,
                })}
              >
                <a href={promotionPath(locale, slide, categories)}>
                  <Picture image={imageOf(slide)} alt="" sizes={SLIDE_SIZES} />
                  <span className="slide-text">
                    <strong>{inLocale(slide.headline, locale)}</strong>
                    <span>{inLocale(slide.text, locale)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {slides.length > 1 && (
            <nav aria-label={dictionary.promotions} className="slider-nav">
              {slides.map((slide, index) => (
                <a
                  key={slide.id}
                  href={`#slide-${index + 1}`}
                  aria-label={fill(dictionary.slideOf, {
                    slide: index + 1,
                    slides: slides.length,
                  })}
                >
                  {index + 1}
                </a>
              ))}
            </nav>
          )}
        </section>
      )}
      {tiles.length > 0 && (
        <ul data-list="tiles" className="promotion-tiles mt-8">
          {tiles.map((tile) => (
            <li key={tile.id}>
              <a href={promotionPath(locale, tile, categories)}>
                <Picture image={imageOf(tile)} alt="" sizes={TILE_SIZES} />
                <strong>{inLocale(tile.headline, locale)}</strong>
                <span>{inLocale(tile.text, locale)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
