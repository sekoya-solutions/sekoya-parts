// The visitor's cart (issue #168, docs/adr/0013-visitor-state.md): its lines
// only, product id and quantity, in a cookie the server writes and the
// header's count reads in the browser. Prices and availability always come
// from the catalog, never from the cookie. Pure functions with no Next.js or
// Payload imports, so the unit tests and the browser component read them too.
//
// The cookie can be edited by hand, so every read checks each line: a
// malformed one is dropped, quantities are capped, a product listed twice
// becomes one line, and lines beyond CART_LINES are dropped.

/** The cookie's name, versioned so a later shape can drop older values. */
export const CART_COOKIE = "cart_v1";

/** The most lines a cart holds (ADR 0013). */
export const CART_LINES = 50;

/** The most of one product a line holds (ADR 0013). */
export const MAX_QUANTITY = 99;

/** How long the cookie lasts after its last change: 30 days, in seconds. */
export const CART_MAX_AGE = 30 * 24 * 60 * 60;

/** One line: a product's id and how many of it. */
export type CartLine = { id: number; quantity: number };

/** Product ids are Payload's serial ids: positive integers, well below this. */
const MAX_ID = 2_147_483_647;

/**
 * "<id>_<quantity>", digits only, with no leading zero. Lines are joined by
 * dots: neither character is encoded in a cookie value, so the browser reads
 * the value exactly as the server wrote it (Next.js encodes a colon).
 */
const LINE = /^([1-9][0-9]{0,9})_([1-9][0-9]{0,9})$/;

/** A whole number from 1 to MAX_QUANTITY, or null for anything else. */
export function parseQuantity(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^[0-9]{1,3}$/.test(text.trim()))
    return null;
  const quantity = Number(text.trim());
  return quantity >= 1 && quantity <= MAX_QUANTITY ? quantity : null;
}

/** A product id as a form sends it, or null when it cannot be one. */
export function parseProductId(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,9}$/.test(value))
    return null;
  const id = Number(value);
  return id <= MAX_ID ? id : null;
}

/**
 * The cart a cookie value holds, in the order its lines were added. Anything
 * malformed gives fewer lines, never an error.
 */
export function parseCart(raw: string | null | undefined): CartLine[] {
  if (!raw || raw.length > 4096) return [];
  const byId = new Map<number, number>();
  for (const part of raw.split(".")) {
    const match = LINE.exec(part);
    if (!match) continue;
    const id = Number(match[1]);
    if (id > MAX_ID) continue;
    const quantity = Math.min(Number(match[2]), MAX_QUANTITY);
    const before = byId.get(id);
    if (before === undefined && byId.size === CART_LINES) continue;
    byId.set(id, Math.min((before ?? 0) + quantity, MAX_QUANTITY));
  }
  return [...byId].map(([id, quantity]) => ({ id, quantity }));
}

/** The cookie value for a cart: "<id>_<quantity>" lines joined by dots. */
export const serializeCart = (cart: readonly CartLine[]): string =>
  cart.map((line) => `${line.id}_${line.quantity}`).join(".");

/** How many items a cart holds, all lines together. */
export const cartCount = (cart: readonly CartLine[]): number =>
  cart.reduce((sum, line) => sum + line.quantity, 0);

/** Why a change was not made, when it was not. */
export type CartRefusal = "full";

/**
 * The cart once some of a product is added: its line grows, up to
 * MAX_QUANTITY, or a new line comes last. A new product in a full cart is
 * refused, and the cart stays as it was.
 */
export function addToCart(
  cart: readonly CartLine[],
  id: number,
  quantity: number,
): { cart: CartLine[]; refused: CartRefusal | null } {
  const index = cart.findIndex((line) => line.id === id);
  if (index === -1) {
    if (cart.length >= CART_LINES) return { cart: [...cart], refused: "full" };
    return { cart: [...cart, { id, quantity }], refused: null };
  }
  return {
    cart: cart.map((line, i) =>
      i === index
        ? { id, quantity: Math.min(line.quantity + quantity, MAX_QUANTITY) }
        : line,
    ),
    refused: null,
  };
}

/** The cart with a product's quantity set, in place; absent products stay absent. */
export const setQuantity = (
  cart: readonly CartLine[],
  id: number,
  quantity: number,
): CartLine[] => cart.map((line) => (line.id === id ? { id, quantity } : line));

/** The cart without a product. */
export const removeFromCart = (
  cart: readonly CartLine[],
  id: number,
): CartLine[] => cart.filter((line) => line.id !== id);

/**
 * The cart's value in a `document.cookie` string, for the browser's count: the
 * named cookie's value, or null.
 */
export function cartCookieValue(cookieHeader: string): string | null {
  for (const pair of cookieHeader.split(";")) {
    const at = pair.indexOf("=");
    if (at === -1) continue;
    if (pair.slice(0, at).trim() === CART_COOKIE)
      return pair.slice(at + 1).trim();
  }
  return null;
}
