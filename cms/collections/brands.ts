import type { CollectionConfig } from "payload";

// Brand names need no translation (docs/adr/0007-catalog-data-model.md).
export const Brands: CollectionConfig = {
  slug: "brands",
  admin: { useAsTitle: "name" },
  fields: [
    { name: "name", type: "text", required: true, unique: true },
    { name: "slug", type: "text", required: true, unique: true },
  ],
};
