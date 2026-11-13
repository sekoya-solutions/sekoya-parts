// The catalog's images (issue #85, docs/adr/0012-front-end-assets.md,
// docs/specs/design-system.md): four originals per category in
// assets/images/<category>/<n>.jpg, resized at build time by
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
export const IMAGE_WIDTHS = [320, 640, 960] as const;

/** Every image is square. */
export const IMAGE_SIZE = 1600;

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
  IMAGE_WIDTHS.map((w) => `${imagePath(key, w, format)} ${w}w`).join(", ");

/** Every original, in manifest order. */
export const allImages = (): ImageKey[] =>
  Object.entries(originals).flatMap(([folder, hashes]) =>
    hashes.map((_, i) => ({ folder, n: i + 1 })),
  );
