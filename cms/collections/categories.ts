import type { CollectionConfig } from "payload";
import { CATEGORY_SLUG, isModelWord } from "../../site/addresses.ts";
import {
  revalidateCategoryAfterChange,
  revalidateCategoryAfterDelete,
} from "../hooks/revalidate-taxonomy.ts";

// A part type, named in ten languages (docs/adr/0007-catalog-data-model.md).
// Its slug starts each of its products' addresses
// (docs/adr/0011-languages-and-seo.md).
export const Categories: CollectionConfig = {
  slug: "categories",
  hooks: {
    afterChange: [revalidateCategoryAfterChange],
    afterDelete: [revalidateCategoryAfterDelete],
  },
  admin: { useAsTitle: "name" },
  fields: [
    { name: "name", type: "text", required: true, localized: true },
    {
      name: "slug",
      type: "text",
      required: true,
      localized: true,
      index: true,
      // A custom validate replaces Payload's own, so it checks both rules.
      validate: (value: string | null | undefined) => {
        if (!value) return "A slug is required.";
        // The model section takes the category slug's place in addresses, in
        // every language.
        if (isModelWord(value))
          return "This word starts model addresses; choose another slug.";
        return CATEGORY_SLUG.test(value)
          ? true
          : "Use lowercase letters, digits and single hyphens, such as joint-de-porte.";
      },
    },
  ],
};
