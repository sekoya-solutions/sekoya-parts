// Cache tags of the product page's parts
// (docs/adr/0008-caching-and-partial-refresh.md) and of the product address
// lookup (docs/adr/0011-languages-and-seo.md). The cached reads and the save
// hooks that refresh them read the tags from here, so they cannot drift.

export const CATALOG_TAG = "catalog";

export const productTags = (id: number) => ({
  price: `product:${id}:price`,
  description: `product:${id}:description`,
  references: `product:${id}:references`,
});

/**
 * The address lookup of one reference. It also covers a reference with no
 * product yet, whose absence a visit may have cached.
 */
export const referenceTag = (reference: string) =>
  `product-reference:${reference}`;

/** Everything that shows a category's name or slug. */
export const categoryTag = (id: number) => `category:${id}`;

/**
 * The list of categories itself, which a new category joins and a deleted one
 * leaves: no category tag can cover a category that does not exist yet.
 */
export const CATEGORIES_TAG = "categories";

/**
 * Which products a category holds and in what order: its pages' rows and its
 * number of products (issue #81). A product that joins or leaves the
 * category, or changes its name or reference, refreshes it.
 */
export const categoryListingTag = (id: number) => `category:${id}:listing`;

/** The tags to refresh after a category is saved or deleted. */
export const tagsForCategoryChange = (id: number): string[] => [
  categoryTag(id),
  CATEGORIES_TAG,
];

/**
 * The most tags one cache entry keeps: Next.js drops the rest with only a
 * warning (NEXT_CACHE_TAG_MAX_ITEMS in next/dist/lib/constants.js), which
 * would leave the entry stale on the dropped tags' refreshes.
 */
export const MAX_CACHE_TAGS = 128;

/**
 * A category page's tags: its listing, its category's name and slug, which
 * every product's name and address use, the catalog, and the price of each
 * product and the brand of each it shows. A list over the limit is an error,
 * never an entry that misses refreshes.
 */
export function categoryPageTags(
  categoryId: number,
  productIds: Iterable<number>,
  brandIds: Iterable<number>,
): string[] {
  const sorted = (ids: Iterable<number>) =>
    [...new Set(ids)].sort((a, b) => a - b);
  const tags = [
    categoryListingTag(categoryId),
    categoryTag(categoryId),
    CATALOG_TAG,
    ...sorted(productIds).map((id) => productTags(id).price),
    ...sorted(brandIds).map(brandTag),
  ];
  if (tags.length > MAX_CACHE_TAGS)
    throw new Error(
      `Category ${categoryId}: ${tags.length} cache tags, over the limit of ${MAX_CACHE_TAGS}.`,
    );
  return tags;
}

/** Everything that shows a brand's name or slug. */
export const brandTag = (id: number) => `brand:${id}`;

/**
 * The list of brands itself (issue #147), which a new brand joins, a deleted
 * one leaves and a renamed one moves in, since the index is sorted by name.
 */
export const BRANDS_TAG = "brands";

/**
 * Which products a brand holds and in what order: its listing's rows and its
 * number of products (issue #147), like a category's listing.
 */
export const brandListingTag = (id: number) => `brand:${id}:listing`;

/**
 * A brand listing page's tags: its listing, its brand's name and slug, the
 * catalog, the price of each product it shows and the category of each, whose
 * name and slug every ordinary product's name and address use. A list over
 * the limit is an error, never an entry that misses refreshes.
 */
export function brandPageTags(
  brandId: number,
  productIds: Iterable<number>,
  categoryIds: Iterable<number>,
): string[] {
  const sorted = (ids: Iterable<number>) =>
    [...new Set(ids)].sort((a, b) => a - b);
  const tags = [
    brandListingTag(brandId),
    brandTag(brandId),
    CATALOG_TAG,
    ...sorted(productIds).map((id) => productTags(id).price),
    ...sorted(categoryIds).map(categoryTag),
  ];
  if (tags.length > MAX_CACHE_TAGS)
    throw new Error(
      `Brand ${brandId}: ${tags.length} cache tags, over the limit of ${MAX_CACHE_TAGS}.`,
    );
  return tags;
}

/**
 * Which products the home page's showcase section lists (issue #111): a
 * product that gains or loses the showcase flag refreshes it, and so does a
 * showcase product's new reference, which the section is ordered by.
 */
export const SHOWCASE_TAG = "showcase";

/**
 * The most showcase products the home page lists, the first by reference.
 * The owner chose twelve; the cap keeps the section's entry under Next.js's
 * tag limit whatever is flagged in Payload, rather than failing the page.
 */
export const SHOWCASE_LIMIT = 24;

/**
 * The showcase section's tags: the list itself, the catalog, and for each
 * product shown its price, its description's tag, which covers its name,
 * reference, brand and category, and the category and brand its name and
 * address are built from. A list over the limit is an error, never an entry
 * that misses refreshes.
 */
export function showcaseTags(
  products: Iterable<{ id: number; categoryId: number; brandId: number }>,
): string[] {
  const list = [...products];
  const sorted = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b);
  const ids = sorted(list.map((p) => p.id));
  const tags = [
    SHOWCASE_TAG,
    CATALOG_TAG,
    ...ids.map((id) => productTags(id).price),
    ...ids.map((id) => productTags(id).description),
    ...sorted(list.map((p) => p.categoryId)).map(categoryTag),
    ...sorted(list.map((p) => p.brandId)).map(brandTag),
  ];
  if (tags.length > MAX_CACHE_TAGS)
    throw new Error(
      `Showcase: ${tags.length} cache tags, over the limit of ${MAX_CACHE_TAGS}.`,
    );
  return tags;
}

/**
 * The model lookups of one brand slug. It also covers a slug no brand has yet,
 * whose absence a visit to a model address may have cached.
 */
export const brandSlugTag = (slug: string) => `brand-slug:${slug}`;

/** A model's page: its heading and its compatible products. */
export const modelTag = (id: number) => `model:${id}`;

/**
 * The tags to refresh after a brand is saved or deleted: its own, the list of
 * brands, and the model lookups of its slug, before and after the save.
 */
export function tagsForBrandChange(
  id: number,
  doc: { slug?: unknown },
  previousDoc?: { slug?: unknown },
): string[] {
  const slugs = new Set(
    [previousDoc?.slug, doc.slug].filter(
      (slug): slug is string => typeof slug === "string",
    ),
  );
  return [brandTag(id), BRANDS_TAG, ...[...slugs].map(brandSlugTag)];
}

/**
 * A reference list's tags: the product's references, the catalog, and the
 * brands it shows, since each row shows its brand's name and slug.
 */
export const referenceListTags = (
  productId: number,
  brandIds: Iterable<number>,
): string[] => [
  productTags(productId).references,
  CATALOG_TAG,
  ...[...new Set(brandIds)].sort((a, b) => a - b).map(brandTag),
];

/**
 * The product fields each part renders. The heading and the address lookup
 * share the description's tag: a showcase product's name is stored, and the
 * others' is built from the category, the brand and the reference.
 */
const PART_FIELDS = {
  price: ["priceCents"],
  description: [
    "name",
    "description",
    "showcase",
    "reference",
    "brand",
    "category",
  ],
} as const;

type ProductFields = Record<string, unknown>;

// A relationship reads as an id or as a populated document, depending on depth.
const comparable = (value: unknown): unknown =>
  value !== null && typeof value === "object" && "id" in value
    ? (value as { id: unknown }).id
    : value;

/**
 * The product fields a category or brand page's row shows or is sorted by,
 * apart from the price, which has its own tag: its name, which an ordinary
 * product builds from its category, brand and reference, its reference,
 * which sets its place, and its category and brand, which set its listings
 * (issues #81 and #147).
 */
const LISTING_FIELDS = [
  "name",
  "showcase",
  "reference",
  "brand",
  "category",
] as const;

const referenceOf = (doc: ProductFields): string[] =>
  typeof doc.reference === "string" ? [referenceTag(doc.reference)] : [];

const isShowcase = (doc: ProductFields | undefined) => doc?.showcase === true;

/** The listings a product appears in: its category's and its brand's. */
const listingOf = (doc: ProductFields): string[] => {
  const category = comparable(doc.category);
  const brand = comparable(doc.brand);
  return [
    ...(typeof category === "number" ? [categoryListingTag(category)] : []),
    ...(typeof brand === "number" ? [brandListingTag(brand)] : []),
  ];
};

/**
 * The tags to refresh after a product is saved: only the parts whose fields
 * changed. A new product gets all its tags and its reference's, since a visit
 * before it existed may have cached its absence, and the listings of its
 * category and brand, which it joins. A changed reference refreshes the old
 * one's lookup, which then finds nothing, and the new one's. A change to
 * what a category or brand page shows of it refreshes the listings of its
 * category and brand before and after the save. The reference list does not
 * depend on product fields, so a save never refreshes it.
 */
export function tagsForProductChange(
  id: number,
  doc: ProductFields,
  previousDoc: ProductFields | undefined,
): string[] {
  const tags = productTags(id);
  if (!previousDoc)
    return [
      tags.price,
      tags.description,
      tags.references,
      ...referenceOf(doc),
      ...listingOf(doc),
      ...(isShowcase(doc) ? [SHOWCASE_TAG] : []),
    ];
  const changed = (fields: readonly string[]) =>
    fields.some(
      (field) => comparable(doc[field]) !== comparable(previousDoc[field]),
    );
  const result: string[] = [];
  if (changed(PART_FIELDS.price)) result.push(tags.price);
  if (changed(PART_FIELDS.description)) result.push(tags.description);
  if (changed(["reference"]))
    result.push(...referenceOf(previousDoc), ...referenceOf(doc));
  if (changed(LISTING_FIELDS))
    result.push(...new Set([...listingOf(previousDoc), ...listingOf(doc)]));
  if (changed(["showcase"]) || (isShowcase(doc) && changed(["reference"])))
    result.push(SHOWCASE_TAG);
  return result;
}

/** The tags to refresh after a product is deleted, its category's and brand's listings included. */
export function tagsForProductDelete(id: number, doc: ProductFields): string[] {
  return [
    ...Object.values(productTags(id)),
    ...referenceOf(doc),
    ...listingOf(doc),
  ];
}
