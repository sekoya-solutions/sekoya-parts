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
      eager={index < EAGER_IMAGES}
    />
  ) : null;
}

/**
 * The width of an image in a product card or a category tile: the grids of
 * site/site.css and the home page fit cards of at least 14rem in a page of at
 * most 72rem, so about 17rem on a desktop, half the screen on a tablet and
 * the whole width on a phone.
 */
export const CARD_SIZES =
  "(min-width: 72rem) 17rem, (min-width: 30rem) 50vw, 100vw";

/** The width of the product page's main image: 28rem beside the text from 48rem up. */
export const MAIN_SIZES = "(min-width: 48rem) 28rem, 100vw";

/**
 * How many card images at the top of a list load at once rather than lazily:
 * they can be in the first screen, where a lazy image would delay the
 * largest content Lighthouse measures. The rest wait until scrolled near.
 */
export const EAGER_IMAGES = 4;

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
