// A catalog image as <picture> (issue #85, docs/adr/0012-front-end-assets.md):
// AVIF, then WebP, then JPEG, each at every width, with explicit width and
// height so the page keeps its layout while the image loads. The browser
// picks the format and width; no code runs in it.
import type { Locale } from "../cms/locales.ts";
import {
  IMAGE_FORMATS,
  IMAGE_SIZE,
  type ImageKey,
  imagePath,
  productImage,
  srcSet,
} from "./images.ts";
import type { ProductRoute } from "./product.tsx";

/**
 * A product card's image, described by the product's name in the page's
 * language; nothing for a category without images.
 */
export function ProductCardImage({
  route,
  locale,
  index,
}: {
  route: ProductRoute;
  locale: Locale;
  /** The card's place in its list, from 0. */
  index: number;
}) {
  const image = productImage(route.categoryId, route.id);
  return image ? (
    <Picture
      image={image}
      alt={route.names[locale]}
      sizes={CARD_SIZES}
      {...cardLoading(index)}
    />
  ) : null;
}

/**
 * The width of an image in a product card or a category tile. Phones show
 * two cards per row (site/site.css and the home page): half of the screen
 * less the page's 1rem margins, the 0.75rem gap, and each card's 0.75rem
 * padding and border, so 50vw - 3rem. From 40rem, cards of at least 14rem
 * fill a page of at most 72rem, so at most half the screen, and about 17rem
 * on a desktop. On a phone 412 pixels wide at 1.75x, as Lighthouse emulates,
 * the image is 158 pixels wide and this picks the 320 width (issue #87);
 * e2e/intro.spec.ts checks the width fetched.
 */
export const CARD_SIZES =
  "(min-width: 72rem) 17rem, (min-width: 40rem) 50vw, calc(50vw - 3rem)";

/**
 * The width of the product page's main image: 28rem beside the text from
 * 48rem up, and a 7rem thumbnail beside the name and price on a phone, which
 * picks the 320 width at Lighthouse's 1.75x (text first, issue #85).
 */
export const MAIN_SIZES = "(min-width: 48rem) 28rem, 7rem";

/**
 * How many card images at the top of a list load at once rather than lazily:
 * the first row on a phone. The first of them is usually the largest element
 * of the first screen, so it also gets high priority. Every byte loaded early
 * shares a slow phone's bandwidth with the page's font and scripts, so the
 * rest wait until scrolled near (issue #85, Lighthouse run on PR #86).
 */
export const EAGER_IMAGES = 2;

/** How a card's image loads, by its place in its list. */
export const cardLoading = (index: number) => ({
  priority: index === 0,
  eager: index < EAGER_IMAGES,
});

export function Picture({
  image,
  alt,
  sizes,
  priority = false,
  eager = false,
  className,
}: {
  image: ImageKey;
  alt: string;
  sizes: string;
  /** The page's main image: fetched first, never lazily. */
  priority?: boolean;
  /** Loaded at once, at the browser's usual priority. */
  eager?: boolean;
  className?: string;
}) {
  const fallback = IMAGE_FORMATS[IMAGE_FORMATS.length - 1];
  if (!fallback) throw new Error("No image format.");
  return (
    <picture>
      {IMAGE_FORMATS.slice(0, -1).map((format) => (
        <source
          key={format.ext}
          type={format.type}
          srcSet={srcSet(image, format.ext)}
          sizes={sizes}
        />
      ))}
      <img
        src={imagePath(image, 640, fallback.ext)}
        srcSet={srcSet(image, fallback.ext)}
        sizes={sizes}
        width={IMAGE_SIZE}
        height={IMAGE_SIZE}
        alt={alt}
        loading={priority || eager ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        className={className}
      />
    </picture>
  );
}
