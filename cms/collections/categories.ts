import type { CollectionConfig } from "payload";

// A part type, named in ten languages (docs/adr/0007-catalog-data-model.md).
export const Categories: CollectionConfig = {
  slug: "categories",
  admin: { useAsTitle: "name" },
  fields: [
    { name: "name", type: "text", required: true, localized: true },
    {
      name: "slug",
      type: "text",
      required: true,
      localized: true,
      index: true,
    },
  ],
};
