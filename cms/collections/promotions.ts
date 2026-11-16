import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
} from "payload";
import {
  PROMOTION_CATEGORIES,
  PROMOTION_KINDS,
  PROMOTION_LINKS,
} from "../../site/promotion-rules.ts";
import { PROMOTIONS_TAG } from "../../site/tags.ts";
import { editorCollectionAccess } from "../access.ts";
import { refresh } from "../hooks/refresh.ts";

// The home page's promotions (issue #155): slides for the slider and tiles
// below it, each with a headline and text in every language over one of the
// owner's images, a link, and optional dates between which it shows. The
// home page's promotions part expires at the next date, like the sale prices
// (ADR 0008), and any save refreshes it at once.
const refreshAfterChange: CollectionAfterChangeHook = ({ doc }) => {
  refresh([PROMOTIONS_TAG]);
  return doc;
};
const refreshAfterDelete: CollectionAfterDeleteHook = () => {
  refresh([PROMOTIONS_TAG]);
};

export const Promotions: CollectionConfig = {
  slug: "promotions",
  // Editors only (issue #176): no customer reads or changes it through the API.
  access: editorCollectionAccess,
  hooks: {
    afterChange: [refreshAfterChange],
    afterDelete: [refreshAfterDelete],
  },
  admin: {
    useAsTitle: "headline",
    defaultColumns: ["headline", "kind", "order", "startsAt", "endsAt"],
  },
  defaultSort: "order",
  fields: [
    {
      name: "kind",
      type: "select",
      required: true,
      options: PROMOTION_KINDS.map((value) => ({ label: value, value })),
    },
    {
      name: "image",
      label: "Image (1 to 3, of the kind's images)",
      type: "number",
      required: true,
      min: 1,
      max: 3,
    },
    { name: "headline", type: "text", required: true, localized: true },
    { name: "text", type: "textarea", localized: true },
    {
      name: "linkTo",
      type: "select",
      required: true,
      options: PROMOTION_LINKS.map((value) => ({ label: value, value })),
    },
    // The category by the generator's English slug, not a relationship: a
    // catalog reload empties the catalog tables, and with them any table
    // holding a foreign key to them, while promotions must survive it.
    {
      name: "category",
      type: "select",
      options: PROMOTION_CATEGORIES.map((value) => ({ label: value, value })),
      admin: { condition: (data) => data?.linkTo === "category" },
      validate: (
        value: unknown,
        { siblingData }: { siblingData: Record<string, unknown> },
      ) =>
        siblingData.linkTo === "category" && !value
          ? "Choose the category this promotion links to."
          : true,
    },
    {
      name: "startsAt",
      type: "date",
      admin: { date: { pickerAppearance: "dayAndTime" } },
    },
    {
      name: "endsAt",
      type: "date",
      admin: { date: { pickerAppearance: "dayAndTime" } },
      // Payload passes a Date or an ISO string, depending on where it is set.
      validate: (
        value: unknown,
        { siblingData }: { siblingData: Record<string, unknown> },
      ) => {
        const time = (date: unknown) =>
          date instanceof Date
            ? date.getTime()
            : typeof date === "string"
              ? Date.parse(date)
              : null;
        const ends = time(value);
        const starts = time(siblingData.startsAt);
        return ends !== null && starts !== null && ends <= starts
          ? "The promotion must end after it starts."
          : true;
      },
    },
    { name: "order", type: "number", defaultValue: 0, index: true },
  ],
};
