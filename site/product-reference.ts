// The product reference rule, in a module of its own so the recently viewed
// products' browser component (site/recently-viewed.tsx) checks references
// without loading the rest of site/addresses.ts.

/**
 * The rule for product references: uppercase letters and digits only, so the
 * reference is always the last hyphen-separated word of the address and reads
 * back unchanged, with at least one letter, so a number after a category slug
 * is always a category page (issue #81). Payload checks it when a product is
 * saved.
 */
export const PRODUCT_REFERENCE = /^(?=[0-9]*[A-Z])[A-Z0-9]+$/;
