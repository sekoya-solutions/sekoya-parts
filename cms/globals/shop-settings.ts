import type { GlobalConfig } from "payload";
import {
  DEFAULT_DELIVERY_CENTS,
  DEFAULT_FREE_DELIVERY_FROM_CENTS,
} from "../../site/cart-pricing.ts";
import { DEFAULT_PICKUP_CENTS } from "../../site/checkout-rules.ts";
import { editorGlobalAccess } from "../access.ts";

// The shop's delivery cost and free-delivery threshold (issue #169), demo
// values shown on the cart page, and the pickup point's price at checkout
// (issue #187), free from the same threshold. The cart page reads them on each request,
// so a save applies at once and no cache tag is needed.
export const ShopSettings: GlobalConfig = {
  slug: "shop-settings",
  label: "Shop settings",
  // Editors only (issue #176).
  access: editorGlobalAccess,
  fields: [
    {
      name: "deliveryCents",
      label: "Delivery cost, in cents",
      type: "number",
      required: true,
      min: 0,
      defaultValue: DEFAULT_DELIVERY_CENTS,
    },
    {
      name: "freeDeliveryFromCents",
      label: "Free delivery from a subtotal of, in cents",
      type: "number",
      required: true,
      min: 0,
      defaultValue: DEFAULT_FREE_DELIVERY_FROM_CENTS,
    },
    {
      name: "pickupCents",
      label: "Pickup point delivery cost, in cents",
      type: "number",
      required: true,
      min: 0,
      defaultValue: DEFAULT_PICKUP_CENTS,
    },
  ],
};
