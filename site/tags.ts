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
 * The model lookups of one brand slug. It also covers a slug no brand has yet,
 * whose absence a visit to a model address may have cached.
 */
export const brandSlugTag = (slug: string) => `brand-slug:${slug}`;

/** A model's page: its heading and its compatible products. */
export const modelTag = (id: number) => `model:${id}`;

/**
 * The tags to refresh after a brand is saved or deleted: its own, and the
 * model lookups of its slug, before and after the save.
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
  return [brandTag(id), ...[...slugs].map(brandSlugTag)];
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
 * The product fields a category page's row shows or is sorted by, apart from
 * the price, which has its own tag: its name, which an ordinary product
 * builds from its brand and reference, its reference, which sets its place,
 * and its category, which sets its listing (issue #81).
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

const listingOf = (doc: ProductFields): string[] => {
  const category = comparable(doc.category);
  return typeof category === "number" ? [categoryListingTag(category)] : [];
};

/**
 * The tags to refresh after a product is saved: only the parts whose fields
 * changed. A new product gets all its tags and its reference's, since a visit
 * before it existed may have cached its absence, and its category's listing,
 * which it joins. A changed reference refreshes the old one's lookup, which
 * then finds nothing, and the new one's. A change to what a category page
 * shows of it refreshes the listings of its category before and after the
 * save. The reference list does not depend on product fields, so a save never
 * refreshes it.
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
  return result;
}

/** The tags to refresh after a product is deleted, its category's listing included. */
export function tagsForProductDelete(id: number, doc: ProductFields): string[] {
  return [
    ...Object.values(productTags(id)),
    ...referenceOf(doc),
    ...listingOf(doc),
  ];
}
