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

/** Everything that shows a brand's name. */
export const brandTag = (id: number) => `brand:${id}`;

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

const referenceOf = (doc: ProductFields): string[] =>
  typeof doc.reference === "string" ? [referenceTag(doc.reference)] : [];

/**
 * The tags to refresh after a product is saved: only the parts whose fields
 * changed. A new product gets all its tags and its reference's, since a visit
 * before it existed may have cached its absence. A changed reference
 * refreshes the old one's lookup, which then finds nothing, and the new one's.
 * The reference list does not depend on product fields, so a save never
 * refreshes it.
 */
export function tagsForProductChange(
  id: number,
  doc: ProductFields,
  previousDoc: ProductFields | undefined,
): string[] {
  const tags = productTags(id);
  if (!previousDoc)
    return [tags.price, tags.description, tags.references, ...referenceOf(doc)];
  const changed = (fields: readonly string[]) =>
    fields.some(
      (field) => comparable(doc[field]) !== comparable(previousDoc[field]),
    );
  const result: string[] = [];
  if (changed(PART_FIELDS.price)) result.push(tags.price);
  if (changed(PART_FIELDS.description)) result.push(tags.description);
  if (changed(["reference"]))
    result.push(...referenceOf(previousDoc), ...referenceOf(doc));
  return result;
}

/** The tags to refresh after a product is deleted. */
export function tagsForProductDelete(id: number, doc: ProductFields): string[] {
  return [...Object.values(productTags(id)), ...referenceOf(doc)];
}
