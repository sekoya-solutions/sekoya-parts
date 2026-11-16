import type { CollectionConfig } from "payload";
import {
  CODE_LENGTH,
  normalizeCode,
  PROMOTION_CODE_KINDS,
} from "../../site/cart-pricing.ts";

// The cart's promotion codes (issue #169): a percentage or a fixed amount off
// the subtotal, with an optional minimum and optional dates. The cart page
// and the cart route read them on each request, so a save applies at once and
// no cache tag is needed. The seed migration loads DEMO10 and an expired
// ETE2026, which shows the refusal.

const time = (date: unknown) =>
  date instanceof Date
    ? date.getTime()
    : typeof date === "string"
      ? Date.parse(date)
      : null;

export const PromotionCodes: CollectionConfig = {
  slug: "promotion-codes",
  labels: { singular: "Promotion code", plural: "Promotion codes" },
  admin: {
    useAsTitle: "code",
    defaultColumns: ["code", "kind", "percent", "amountCents", "endsAt"],
  },
  hooks: {
    // Stored as the cart reads a typed code: trimmed and in capitals.
    beforeValidate: [
      ({ data }) => {
        if (data && typeof data.code === "string")
          data.code = data.code.trim().toUpperCase();
        return data;
      },
    ],
  },
  fields: [
    {
      name: "code",
      type: "text",
      required: true,
      unique: true,
      maxLength: CODE_LENGTH,
      validate: (value: unknown) =>
        normalizeCode(value) === value
          ? true
          : "Letters, digits and hyphens only, starting with a letter or digit.",
    },
    {
      name: "kind",
      type: "select",
      required: true,
      defaultValue: "percent",
      options: PROMOTION_CODE_KINDS.map((value) => ({ label: value, value })),
    },
    {
      name: "percent",
      label: "Percent off (1 to 100)",
      type: "number",
      min: 1,
      max: 100,
      admin: { condition: (data) => data?.kind === "percent" },
      validate: (
        value: unknown,
        { siblingData }: { siblingData: Record<string, unknown> },
      ) =>
        siblingData.kind === "percent" &&
        !(Number.isInteger(value) && (value as number) >= 1)
          ? "Enter a whole percentage from 1 to 100."
          : true,
    },
    {
      name: "amountCents",
      label: "Amount off, in cents",
      type: "number",
      min: 1,
      admin: { condition: (data) => data?.kind === "amount" },
      validate: (
        value: unknown,
        { siblingData }: { siblingData: Record<string, unknown> },
      ) =>
        siblingData.kind === "amount" &&
        !(Number.isInteger(value) && (value as number) >= 1)
          ? "Enter a whole number of cents, 1 or more."
          : true,
    },
    {
      name: "minimumCents",
      label: "Minimum subtotal, in cents (empty for none)",
      type: "number",
      min: 0,
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
        const ends = time(value);
        const starts = time(siblingData.startsAt);
        return ends !== null && starts !== null && ends <= starts
          ? "The code must end after it starts."
          : true;
      },
    },
  ],
};
