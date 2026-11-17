// The catalog's images (issue #85, docs/adr/0012-front-end-assets.md,
// docs/specs/design-system.md): four originals per category in
// assets/images/<category>/<n>.jpg, and the home page's promotion images
// (issue #155) in their own folders, each set with its own size (IMAGE_SETS), resized at build time by
// scripts/images.ts into public/images, and the addresses the pages use.
//
// Each output's file name carries a hash of its original and of the encoding
// settings, so a changed image or setting gets a new address, and every
// address can be cached for a year without going stale. The hashes of the
// originals live in assets/images/manifest.json, which tests/images.test.ts
// checks against the files.
import { createHash } from "node:crypto";
import manifest from "../assets/images/manifest.json" with { type: "json" };
import { categories, slugify } from "../catalog/generator.ts";

/** Images per category: a product shows one of them. */
export const IMAGES_PER_CATEGORY = 4;

/** The widths written for each image, in pixels; the originals are 1,600. */
export const IMAGE_WIDTHS = [320, 480, 640, 960] as const;

/** Every catalog image is square. */
export const IMAGE_SIZE = 1600;

/** A folder of originals: their size, how many, and the widths written. */
export type ImageSet = {
  width: number;
  height: number;
  count: number;
  widths: readonly number[];
};

/** A category's four square images. */
export const CATEGORY_IMAGES: ImageSet = {
  width: IMAGE_SIZE,
  height: IMAGE_SIZE,
  count: IMAGES_PER_CATEGORY,
  widths: IMAGE_WIDTHS,
};

/**
 * The home page's promotion images (issue #155), made by the owner: three
 * wide slides and three tiles, with no text, so the headline in each language
 * is set over them. Slides fill the page's width, so they get wider files.
 */
export const IMAGE_SETS: Readonly<Record<string, ImageSet>> = {
  "promotion-slides": {
    width: 2400,
    height: 900,
    count: 3,
    widths: [640, 960, 1280, 1920],
  },
  "promotion-tiles": {
    width: 1200,
    height: 900,
    count: 3,
    widths: [320, 480, 640, 960],
  },
};

/** The set a folder's originals belong to: a promotion set, or a category's. */
export const imageSet = (folder: string): ImageSet =>
  IMAGE_SETS[folder] ?? CATEGORY_IMAGES;

/** The output formats, best first, as <picture> lists them. */
export const IMAGE_FORMATS = [
  { ext: "avif", type: "image/avif", options: { quality: 50, effort: 4 } },
  { ext: "webp", type: "image/webp", options: { quality: 75, effort: 4 } },
  { ext: "jpg", type: "image/jpeg", options: { quality: 78, mozjpeg: true } },
] as const;

export type ImageFormat = (typeof IMAGE_FORMATS)[number]["ext"];

/** Where the build writes the outputs, served at /images/. */
export const OUTPUT_DIR = "public/images";

/** Where the originals and their manifest live. */
export const ORIGINALS_DIR = "assets/images";

/** One original: its category folder and its number, from 1 to 4. */
export type ImageKey = { folder: string; n: number };

const originals = manifest as Record<string, string[]>;

/** The category folders: each generated category's English name, slugified. */
const FOLDERS: ReadonlyMap<number, string> = new Map(
  categories().map((category) => [category.id, slugify(category.names.en)]),
);

/** The folder of a category's images, or null for a category without any. */
export function categoryFolder(categoryId: number): string | null {
  const folder = FOLDERS.get(categoryId);
  return folder && originals[folder] ? folder : null;
}

/**
 * The image a product shows: one of its category's four, always the same for
 * a product, spread evenly by its id. Null for a category without images,
 * such as one created in Payload after the catalog was generated.
 */
export function productImage(
  categoryId: number,
  productId: number,
): ImageKey | null {
  const folder = categoryFolder(categoryId);
  if (!folder) return null;
  return { folder, n: ((productId - 1) % IMAGES_PER_CATEGORY) + 1 };
}

/** How many pictures the product page's gallery shows (issue #200). */
export const GALLERY_IMAGES = 2;

/**
 * The product page's gallery (issue #200): the product's own image, then the
 * next ones of its category, in turn. Always the same for a product, so its
 * cached page never changes between visits. Empty for a category without
 * images.
 */
export function productGallery(
  categoryId: number,
  productId: number,
): ImageKey[] {
  const first = productImage(categoryId, productId);
  if (!first) return [];
  return Array.from({ length: GALLERY_IMAGES }, (_, i) => ({
    folder: first.folder,
    n: ((first.n - 1 + i) % IMAGES_PER_CATEGORY) + 1,
  }));
}

/** The image a category shows on the home page: its first. */
export function categoryImage(categoryId: number): ImageKey | null {
  const folder = categoryFolder(categoryId);
  return folder ? { folder, n: 1 } : null;
}

/** The original's hash, from the manifest. */
export function originalHash({ folder, n }: ImageKey): string {
  const hash = originals[folder]?.[n - 1];
  if (!hash) throw new Error(`No image ${folder}/${n} in the manifest.`);
  return hash;
}

/** A short hash of the original and the settings an output is made with. */
function outputHash(key: ImageKey, format: ImageFormat): string {
  const settings = IMAGE_FORMATS.find((f) => f.ext === format)?.options;
  return createHash("sha256")
    .update(`${originalHash(key)}|${format}|${JSON.stringify(settings)}`)
    .digest("hex")
    .slice(0, 8);
}

/** An output's file name, such as belt-2-640-1a2b3c4d.avif. */
export const outputName = (
  key: ImageKey,
  width: number,
  format: ImageFormat,
): string =>
  `${key.folder}-${key.n}-${width}-${outputHash(key, format)}.${format}`;

/** An output's address on the site. */
export const imagePath = (
  key: ImageKey,
  width: number,
  format: ImageFormat,
): string => `/images/${outputName(key, width, format)}`;

/** A srcset listing every width of one format. */
export const srcSet = (key: ImageKey, format: ImageFormat): string =>
  imageSet(key.folder)
    .widths.map((w) => `${imagePath(key, w, format)} ${w}w`)
    .join(", ");

/** Every original, in manifest order. */
export const allImages = (): ImageKey[] =>
  Object.entries(originals).flatMap(([folder, hashes]) =>
    hashes.map((_, i) => ({ folder, n: i + 1 })),
  );
