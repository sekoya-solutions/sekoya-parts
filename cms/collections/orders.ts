import type { CollectionConfig } from "payload";
import { DELIVERY_METHODS } from "../../site/checkout-rules.ts";
import {
  ADDRESS_FIELDS,
  COUNTRIES,
  FIELD_RULES,
  isCountry,
} from "../../site/saved-addresses.ts";
import { editorCollectionAccess } from "../access.ts";
import { locales } from "../locales.ts";
import { CUSTOMER_COLLECTION } from "./customers.ts";

export const ORDER_COLLECTION = "orders";

// The demo shop's orders (issue #187, docs/adr/0014-customer-accounts.md):
// nothing is ever charged or delivered. The checkout's first step stores a
// draft, named by the visitor's checkout cookie through the SHA-256 of its
// token, and "Place order" turns it into an order with a number, its lines
// and its totals, all read again from the catalog and "Shop settings".
//
// Editors read them in the admin; visitors never reach this collection
// through Payload's API. The site writes them through cms/orders/store.ts,
// which places a draft under its row's lock, so a double click places it
// once. A database trigger caps the table at MAX_ORDERS rows, drafts
// included, and the daily purge deletes a draft never placed after 24 hours
// and a guest's order 30 days after it was placed (cms/orders/purge.ts).
// An account's orders, drafts included, are deleted with the account by a
// trigger (migrations/20261117_120000_customer_orders.ts, issue #188).
export const Orders: CollectionConfig = {
  slug: ORDER_COLLECTION,
  access: editorCollectionAccess,
  admin: {
    useAsTitle: "number",
    defaultColumns: ["number", "status", "totalCents", "placedAt", "customer"],
  },
  fields: [
    {
      // Given when the order is placed, from its own sequence.
      name: "number",
      type: "text",
      unique: true,
      admin: { readOnly: true },
    },
    {
      name: "status",
      type: "select",
      options: ["draft", "placed"],
      defaultValue: "draft",
      required: true,
      index: true,
    },
    {
      // The SHA-256 of the checkout cookie's token, never the token itself.
      name: "tokenHash",
      type: "text",
      required: true,
      unique: true,
      admin: { hidden: true },
    },
    {
      // The language the order was placed in.
      name: "locale",
      type: "select",
      options: [...locales],
      required: true,
    },
    {
      // The signed-in customer who placed it, or none for a guest.
      name: "customer",
      type: "relationship",
      relationTo: CUSTOMER_COLLECTION,
      index: true,
    },
    {
      name: "address",
      type: "group",
      fields: [
        ...ADDRESS_FIELDS.filter((name) => name !== "label").map((name) => ({
          name,
          type: "text" as const,
          required: FIELD_RULES[name].required,
          maxLength: FIELD_RULES[name].max,
        })),
        {
          name: "country",
          type: "text",
          required: true,
          validate: (value: unknown) =>
            isCountry(value) || `One of ${COUNTRIES.join(", ")}.`,
        },
      ],
    },
    {
      name: "deliveryMethod",
      type: "select",
      options: [...DELIVERY_METHODS],
      required: true,
    },
    {
      // The fictitious pickup point (site/pickup-points.ts), copied so the
      // order still reads the same if the list changes.
      name: "pickup",
      type: "group",
      fields: [
        { name: "point", type: "text" },
        { name: "city", type: "text" },
        { name: "postalCode", type: "text" },
      ],
    },
    {
      // The lines as placed: the catalog's name in the order's language and
      // price at that moment, so the order reads the same after a change.
      name: "lines",
      type: "array",
      fields: [
        { name: "product", type: "number", required: true },
        { name: "reference", type: "text", required: true },
        { name: "name", type: "text", required: true },
        { name: "unitCents", type: "number", required: true },
        { name: "quantity", type: "number", required: true },
      ],
    },
    { name: "promotionCode", type: "text" },
    { name: "subtotalCents", type: "number" },
    { name: "discountCents", type: "number" },
    { name: "deliveryCents", type: "number" },
    { name: "totalCents", type: "number" },
    { name: "placedAt", type: "date", index: true },
  ],
};
