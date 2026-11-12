import type { CollectionConfig } from "payload";
import {
  revalidateProductAfterChange,
  revalidateProductAfterDelete,
} from "../hooks/revalidate-product.ts";

// Products as docs/adr/0007-catalog-data-model.md defines them. Names and
// descriptions are stored only for showcase products; the others are
// generated at render time.
export const Products: CollectionConfig = {
  slug: "products",
  hooks: {
    afterChange: [revalidateProductAfterChange],
    afterDelete: [revalidateProductAfterDelete],
  },
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
