import type { CollectionConfig } from "payload";
import { isProductReference } from "../../site/addresses.ts";
import { AVAILABILITIES, saleError } from "../../site/merchandising.ts";
import { editorCollectionAccess } from "../access.ts";
import {
  revalidateProductAfterChange,
  revalidateProductAfterDelete,
} from "../hooks/revalidate-product.ts";
import {
  queueProductAfterChange,
  queueProductAfterDelete,
} from "../hooks/search-index.ts";

// Products as docs/adr/0007-catalog-data-model.md defines them. Names and
// descriptions are stored only for showcase products; the others are
// generated at render time.
export const Products: CollectionConfig = {
  slug: "products",
  // Editors only (issue #176): no customer reads or changes it through the API.
  access: editorCollectionAccess,
  hooks: {
    afterChange: [revalidateProductAfterChange, queueProductAfterChange],
    afterDelete: [revalidateProductAfterDelete, queueProductAfterDelete],
  },
  // Category pages read their products by category, in reference order
  // (issue #81).
  indexes: [{ fields: ["category", "reference"] }],
  admin: {
    useAsTitle: "reference",
    defaultColumns: [
      "reference",
      "brand",
      "category",
      "priceCents",
      "showcase",
    ],
  },
  fields: [
    {
      name: "reference",
      type: "text",
      required: true,
      unique: true,
      // The stable key at the end of the product's address
      // (docs/adr/0011-languages-and-seo.md). A custom validate replaces
      // Payload's own, so it checks both rules.
      validate: (value: string | null | undefined) => {
        if (!value) return "A reference is required.";
        return isProductReference(value)
          ? true
          : "Use uppercase letters and digits only, with at least one letter, such as SP000123.";
      },
    },
    {
      name: "brand",
      type: "relationship",
      relationTo: "brands",
      required: true,
    },
    {
      name: "category",
      type: "relationship",
      relationTo: "categories",
      required: true,
      index: true,
    },
    {
      name: "priceCents",
      label: "Price (euro cents)",
      type: "number",
      required: true,
      min: 0,
      // A custom validate replaces Payload's own, so it checks all three rules.
      validate: (value: number | null | undefined) => {
        if (value === null || value === undefined)
          return "A price is required.";
        if (!Number.isInteger(value) || value < 0) {
          return "The price must be a whole, non-negative number of cents.";
        }
        return true;
      },
    },
    // Merchandising data (issue #151): the availability, from which the
    // delivery estimate follows, and a sale between two dates.
    {
      name: "availability",
      type: "select",
      required: true,
      defaultValue: "in-stock",
      options: AVAILABILITIES.map((value) => ({ label: value, value })),
    },
    {
      name: "salePriceCents",
      label: "Sale price (euro cents)",
      type: "number",
      min: 0,
      // One rule for the three sale fields, checked on the price.
      validate: (
        value: number | null | undefined,
        { siblingData }: { siblingData: Record<string, unknown> },
      ) =>
        saleError(
          {
            salePriceCents: value,
            saleStartsAt: siblingData.saleStartsAt as string | undefined,
            saleEndsAt: siblingData.saleEndsAt as string | undefined,
          },
          Number(siblingData.priceCents),
        ) ?? true,
    },
    {
      name: "saleStartsAt",
      type: "date",
      admin: { date: { pickerAppearance: "dayAndTime" } },
    },
    {
      name: "saleEndsAt",
      type: "date",
      admin: { date: { pickerAppearance: "dayAndTime" } },
    },
    {
      name: "showcase",
      type: "checkbox",
      defaultValue: false,
      index: true,
    },
    { name: "name", type: "text", localized: true },
    { name: "description", type: "textarea", localized: true },
  ],
};
