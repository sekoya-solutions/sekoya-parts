// What the cart route answers (issue #168), shared by the route, the cart
// page and the browser component that sends the forms. No imports, so the
// browser loads nothing else with it.

/**
 * - added: the product went into the cart;
 * - updated: a quantity changed or a line was removed;
 * - full: the cart already holds its 50 products, so a new one was refused;
 * - unavailable: the product is out of stock or no longer in the catalog;
 * - invalid: the form's fields were not ones a page of the site sends.
 */
export const CART_STATUSES = [
  "added",
  "updated",
  "full",
  "unavailable",
  "invalid",
] as const;

export type CartStatus = (typeof CART_STATUSES)[number];

/** The cart page's query parameter naming a refused change, without JavaScript. */
export const CART_NOTICE_PARAM = "notice";

/** The refusals the cart page explains. */
export type CartRefusalStatus = Exclude<CartStatus, "added" | "updated">;

export const isCartRefusal = (value: unknown): value is CartRefusalStatus =>
  value === "full" || value === "unavailable" || value === "invalid";

/**
 * The marker of the forms site/cart-forms.tsx sends. Here rather than in that
 * browser component, whose exports a server component reads as references.
 */
export const CART_FORM_ATTRIBUTE = "data-cart-form";

/** The event the forms dispatch once the cart changed, so the count reads it again. */
export const CART_CHANGE_EVENT = "sekoya-cart-change";
