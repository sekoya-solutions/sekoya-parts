import type { CollectionConfig } from "payload";
import {
  revalidateBrandAfterChange,
  revalidateBrandAfterDelete,
} from "../hooks/revalidate-taxonomy.ts";

// Brand names need no translation (docs/adr/0007-catalog-data-model.md).
// An ordinary product's name and address include its brand's name.
export const Brands: CollectionConfig = {
  slug: "brands",
  hooks: {
    afterChange: [revalidateBrandAfterChange],
    afterDelete: [revalidateBrandAfterDelete],
  },
  admin: { useAsTitle: "name" },
  fields: [
    { name: "name", type: "text", required: true, unique: true },
    { name: "slug", type: "text", required: true, unique: true },
  ],
};
