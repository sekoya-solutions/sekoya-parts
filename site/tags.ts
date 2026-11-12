// Cache tags of the product page's parts
// (docs/adr/0008-caching-and-partial-refresh.md). The cached parts and the
// save hook that refreshes them read the tags from here, so they cannot drift.

export const CATALOG_TAG = "catalog";

export const productTags = (id: number) => ({
  price: `product:${id}:price`,
  description: `product:${id}:description`,
  references: `product:${id}:references`,
});

/**
 * The product fields each part renders. The heading shares the description's
 * tag: a showcase product's name is stored, and the others' is built from the
 * category, the brand and the reference.
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
 * The tags to refresh after a product is saved: only the parts whose fields
 * changed. A new product gets all its tags, since a visit before it existed
 * may have cached its absence. The reference list does not depend on product
 * fields, so a save never refreshes it.
 */
export function tagsForProductChange(
  id: number,
  doc: ProductFields,
  previousDoc: ProductFields | undefined,
): string[] {
  const tags = productTags(id);
  if (!previousDoc) return [tags.price, tags.description, tags.references];
  const changed = (fields: readonly string[]) =>
    fields.some(
      (field) => comparable(doc[field]) !== comparable(previousDoc[field]),
    );
  const result: string[] = [];
  if (changed(PART_FIELDS.price)) result.push(tags.price);
  if (changed(PART_FIELDS.description)) result.push(tags.description);
  return result;
}
