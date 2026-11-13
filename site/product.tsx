// The product page's parts (docs/adr/0008-caching-and-partial-refresh.md).
// Each part is its own remote cache entry, tagged per part and with the
// catalog tag, and takes only the product id and the language. Nothing that
// caches wraps them: the page that renders them is not cached itself.
import config from "@payload-config";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";
import { placeholderDescription } from "../catalog/text.ts";
import type { Locale } from "../cms/locales.ts";
import type { Product } from "../cms/payload-types.ts";
import { productAddresses } from "./addresses.ts";
import {
  brandTag,
  CATALOG_TAG,
  categoryTag,
  productTags,
  referenceTag,
} from "./tags.ts";

/**
 * When a part was computed, rendered as a data-computed-at attribute. It shows
 * which parts a refresh re-ran (experiment 1, docs/experiments/) and stays for
 * the end-to-end test that checks a price edit changes nothing else.
 */
export const computedAt = () => new Date().toISOString();

/** A product found by its reference: its id, and its name and address in each language. */
export type ProductRoute = {
  id: number;
  names: Record<Locale, string>;
  paths: Record<Locale, string>;
  computedAt: string;
};

// With locale "all", Payload returns each localized field as an object keyed
// by language.
type AllLocales = Record<string, string | null | undefined>;
const allLocales = (value: unknown): AllLocales =>
  value !== null && typeof value === "object" ? (value as AllLocales) : {};

/**
 * Reads a product by its reference, with no cache: the cached lookup below
 * and the build's list of pages built in advance both use it. Null when no
 * product has that reference.
 */
export async function readProductRoute(
  reference: string,
): Promise<ProductRead | null> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "products",
    where: { reference: { equals: reference } },
    locale: "all",
    depth: 1,
    limit: 1,
    pagination: false,
  });
  const product = docs[0];
  return product ? readProduct(product) : null;
}

/** A product's route, read with locale "all" and depth 1, with what it is built from. */
export type ProductRead = {
  route: ProductRoute;
  brandId: number;
  categoryId: number;
};

/**
 * Builds a product's route from a document read with locale "all" and
 * depth 1, so its brand and category are populated.
 */
export function readProduct(product: Product): ProductRead {
  if (typeof product.brand !== "object" || typeof product.category !== "object")
    throw new Error(
      `Product ${product.reference}: brand or category not populated.`,
    );
  const { names, paths } = productAddresses({
    reference: product.reference,
    showcaseNames: product.showcase ? allLocales(product.name) : null,
    categoryNames: allLocales(product.category.name),
    categorySlugs: allLocales(product.category.slug),
    brand: product.brand.name,
  });
  return {
    route: { id: product.id, names, paths, computedAt: computedAt() },
    brandId: product.brand.id,
    categoryId: product.category.id,
  };
}

/** A price in euros, in a language's format. */
export const formatPrice = (priceCents: number, locale: Locale): string =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(
    priceCents / 100,
  );

/**
 * The product with this reference, or null, which the page answers with a
 * 404. One entry per reference, shared by the ten languages. It is refreshed
 * by the reference's tag (a new or renamed product), the description's tag,
 * which covers the product's name, reference, brand and category, and the
 * category's and brand's tags, since an ordinary product's name and address
 * are built from them. The page's heading reads its names.
 */
export async function getProductRoute(
  reference: string,
): Promise<ProductRoute | null> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(referenceTag(reference), CATALOG_TAG);

  const found = await readProductRoute(reference);
  if (!found) return null;
  cacheTag(
    productTags(found.route.id).description,
    categoryTag(found.categoryId),
    brandTag(found.brandId),
  );
  return found.route;
}

export async function ProductPrice({
  id,
  locale,
}: {
  id: number;
  locale: Locale;
}) {
  "use cache: remote";
  cacheLife("max");
  cacheTag(productTags(id).price, CATALOG_TAG);

  const payload = await getPayload({ config });
  const product = await payload.findByID({
    collection: "products",
    id,
    depth: 0,
    select: { priceCents: true },
    disableErrors: true,
  });
  if (!product) return null;
  return (
    <p data-computed-at={computedAt()} className="text-3xl font-bold">
      {formatPrice(product.priceCents, locale)}
    </p>
  );
}

export async function ProductDescription({
  id,
  locale,
}: {
  id: number;
  locale: Locale;
}) {
  "use cache: remote";
  cacheLife("max");
  cacheTag(productTags(id).description, CATALOG_TAG);

  const payload = await getPayload({ config });
  const product = await payload.findByID({
    collection: "products",
    id,
    locale,
    depth: 0,
    select: { showcase: true, description: true },
    disableErrors: true,
  });
  if (!product) return null;
  // Only showcase products store a description; the others get placeholder
  // text generated from the product and the language (ADR 0007).
  const text =
    product.showcase && product.description
      ? product.description
      : placeholderDescription(id, locale);
  return (
    <p data-computed-at={computedAt()} className="max-w-prose text-slate">
      {text}
    </p>
  );
}
