// The product page's gallery (issue #200): a scroll-snap strip of the
// product's pictures, one per view, moved by swiping, by the arrows over it
// or by the thumbnails under it, never by itself. The server renders it at
// its final size; the arrows and thumbnails work once the small browser
// component in site/gallery-controls.tsx runs, so nothing moves when it does.
//
// The first picture is the page's largest element on a phone: it is fetched
// first and never lazily. The other pictures and every thumbnail are marked
// lazy; a browser may still fetch them while the page loads, as they sit
// beside the screen or on it (Chrome did on Lighthouse's phone, once the
// first picture had arrived, PR #201).
import type { Locale } from "../cms/locales.ts";
import { fill, getDictionary } from "./dictionary.ts";
import { GalleryControls } from "./gallery-controls.tsx";
import type { ImageKey } from "./images.ts";
import { MAIN_SIZES, Picture, THUMB_SIZES } from "./picture.tsx";

export function ProductGallery({
  images,
  name,
  locale,
  className,
}: {
  images: ImageKey[];
  /** The product's name, every picture's text alternative. */
  name: string;
  locale: Locale;
  className?: string;
}) {
  const dictionary = getDictionary(locale);
  const count = images.length;
  const label = (i: number) =>
    fill(dictionary.galleryPicture, { n: i + 1, count });
  return (
    <section
      data-gallery
      aria-label={dictionary.galleryLabel}
      className={className}
    >
      <div className="gallery-view">
        {/* Focusable, so a keyboard user can also scroll it with the arrow
            keys, as a scrollable region must be (WCAG 2.1.1). */}
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region with no focusable content of its own. */}
        <ul data-list="gallery" className="gallery-strip" tabIndex={0}>
          {images.map((image, i) => (
            <li key={`${image.folder}-${image.n}`} aria-label={label(i)}>
              <Picture
                image={image}
                alt={name}
                sizes={MAIN_SIZES}
                priority={i === 0}
              />
            </li>
          ))}
        </ul>
        {count > 1 && (
          <GalleryControls
            previous={dictionary.galleryPrevious}
            next={dictionary.galleryNext}
          />
        )}
      </div>
      {count > 1 && (
        <ul className="gallery-thumbs">
          {images.map((image, i) => (
            <li key={`${image.folder}-${image.n}`}>
              <button
                type="button"
                data-thumb={i}
                aria-label={label(i)}
                aria-current={i === 0 ? "true" : undefined}
              >
                <Picture image={image} alt="" sizes={THUMB_SIZES} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
