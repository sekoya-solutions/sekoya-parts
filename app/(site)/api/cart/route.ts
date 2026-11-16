// POST /api/cart (issue #168, docs/adr/0013-visitor-state.md): every change
// to the visitor's cart, from a plain form that works without JavaScript.
// Fields: lang, intent (add, set or remove), product (its id) and quantity;
// or intent code with the code typed, or code-remove (issue #169).
//
// - Without JavaScript the browser follows a 303 to the cart page, in the
//   form's language, with a notice when the change was refused.
// - With JavaScript, site/cart-forms.tsx sends the same form with
//   Accept: application/json and gets { status, count } back, so the page
//   stays as it is.
//
// A route rather than a Server Action (owner decision, 2026-11-16): a Server
// Action that sets a cookie makes Next.js re-render the current page on the
// server, so each addition would send the product page again.
//
// Prices are never read from the request: the cookie holds ids and
// quantities only, and the cart page reads the rest from the catalog. A
// request from another site is refused, so no other page can fill a
// visitor's cart.
import config from "@payload-config";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { cartPath, isLocale } from "../../../../site/addresses.ts";
import {
  addToCart,
  CART_COOKIE,
  CART_MAX_AGE,
  type CartLine,
  cartCount,
  PROMO_COOKIE,
  parseCart,
  parseProductId,
  parseQuantity,
  removeFromCart,
  serializeCart,
  setQuantity,
} from "../../../../site/cart.ts";
import {
  readCode,
  readLines,
  subtotalCents,
} from "../../../../site/cart-lines.ts";
import { codeRefusal, normalizeCode } from "../../../../site/cart-pricing.ts";
import {
  CART_NOTICE_PARAM,
  type CartStatus,
  isCartSuccess,
} from "../../../../site/cart-status.ts";
import { sameOrigin } from "../../../../site/same-origin.ts";

const NO_STORE = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
};

/** Whether the product exists and can be ordered: in stock or on order. */
async function orderable(id: number): Promise<boolean> {
  const payload = await getPayload({ config });
  const product = await payload.findByID({
    collection: "products",
    id,
    depth: 0,
    select: { availability: true },
    disableErrors: true,
  });
  return product !== null && product.availability !== "out-of-stock";
}

type Change = { cart: CartLine[]; status: CartStatus };

/**
 * A promotion code typed on the cart page (issue #169): checked against
 * Payload's codes and the subtotal the catalog gives now. Null when the form
 * does not apply a code. An applied code is kept in its own cookie, and the
 * cart page checks it again on each visit.
 */
async function codeChange(
  cart: CartLine[],
  form: FormData,
): Promise<{ status: CartStatus; code: string | null } | null> {
  const intent = form.get("intent");
  if (intent === "code-remove") return { status: "code-removed", code: null };
  if (intent !== "code") return null;
  const typed = normalizeCode(form.get("code"));
  const code = typed === null ? null : await readCode(typed);
  const refusal = codeRefusal(
    code,
    code ? subtotalCents(await readLines(cart)) : 0,
    Date.now(),
  );
  return refusal === null && code
    ? { status: "code-applied", code: code.code }
    : { status: `code-${refusal ?? "unknown"}`, code: null };
}

async function change(
  cart: CartLine[],
  form: FormData,
): Promise<Change | "invalid"> {
  const intent = form.get("intent");
  const id = parseProductId(form.get("product"));
  if (id === null) return "invalid";
  if (intent === "remove")
    return { cart: removeFromCart(cart, id), status: "updated" };
  const quantity = parseQuantity(form.get("quantity"));
  if (quantity === null) return "invalid";
  if (intent === "set")
    return { cart: setQuantity(cart, id, quantity), status: "updated" };
  if (intent !== "add") return "invalid";
  if (!(await orderable(id))) return { cart, status: "unavailable" };
  const added = addToCart(cart, id, quantity);
  return {
    cart: added.cart,
    status: added.refused === "full" ? "full" : "added",
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!sameOrigin(request))
    return new Response("Forbidden", { status: 403, headers: NO_STORE });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response("Bad request", { status: 400, headers: NO_STORE });
  }
  const lang = form.get("lang");
  const locale = typeof lang === "string" && isLocale(lang) ? lang : "fr";
  const cart = parseCart(request.cookies.get(CART_COOKIE)?.value);
  const codeResult = await codeChange(cart, form);
  const result = codeResult
    ? { cart, status: codeResult.status }
    : await change(cart, form);
  const next = result === "invalid" ? cart : result.cart;
  const status: CartStatus = result === "invalid" ? "invalid" : result.status;
  const wantsJson = (request.headers.get("accept") ?? "").includes(
    "application/json",
  );

  let response: NextResponse;
  if (wantsJson) {
    response = NextResponse.json(
      { status, count: cartCount(next) },
      { status: status === "invalid" ? 400 : 200, headers: NO_STORE },
    );
  } else {
    const target = new URL(cartPath(locale), request.url);
    if (!isCartSuccess(status))
      target.searchParams.set(CART_NOTICE_PARAM, status);
    // A relative Location, so the redirect stays on the address the
    // visitor used, whatever host the function sees.
    response = new NextResponse(null, {
      status: 303,
      headers: { ...NO_STORE, Location: `${target.pathname}${target.search}` },
    });
  }

  if (next.length === 0) response.cookies.delete(CART_COOKIE);
  else
    response.cookies.set(CART_COOKIE, serializeCart(next), {
      path: "/",
      sameSite: "lax",
      // Readable by the header's count (ADR 0013): ids and quantities only.
      httpOnly: false,
      secure: request.nextUrl.protocol === "https:",
      maxAge: CART_MAX_AGE,
    });
  if (codeResult?.status === "code-removed")
    response.cookies.delete(PROMO_COOKIE);
  else if (codeResult?.code)
    response.cookies.set(PROMO_COOKIE, codeResult.code, {
      path: "/",
      sameSite: "lax",
      // Only the server reads it.
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      maxAge: CART_MAX_AGE,
    });
  return response;
}
