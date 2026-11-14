import type { CollectionConfig } from "payload";
import { BRAND_SLUG } from "../../site/addresses.ts";
import {
  revalidateBrandAfterChange,
  revalidateBrandAfterDelete,
} from "../hooks/revalidate-taxonomy.ts";
import { queueBrandAfterChange } from "../hooks/search-index.ts";

// Brand names need no translation (docs/adr/0007-catalog-data-model.md).
// An ordinary product's name and address include its brand's name, and a
// model's address starts with its brand's slug
// (docs/adr/0011-languages-and-seo.md).
export const Brands: CollectionConfig = {
  slug: "brands",
  hooks: {
    afterChange: [revalidateBrandAfterChange, queueBrandAfterChange],
    afterDelete: [revalidateBrandAfterDelete],
  },
  admin: { useAsTitle: "name" },
  fields: [
    { name: "name", type: "text", required: true, unique: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      // A custom validate replaces Payload's own, so it checks both rules.
      validate: (value: string | null | undefined) => {
        if (!value) return "A slug is required.";
        return BRAND_SLUG.test(value)
          ? true
          : "Use lowercase letters and digits only, with no hyphen, such as norium.";
      },
    },
  ],
};
