// POST /api/cart (issue #168, docs/adr/0013-visitor-state.md): every change
// to the visitor's cart, from a plain form that works without JavaScript.
// Fields: lang, intent (add, set or remove), product (its id) and quantity.
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
  parseCart,
  parseProductId,
  parseQuantity,
  removeFromCart,
  serializeCart,
  setQuantity,
} from "../../../../site/cart.ts";
import {
  CART_NOTICE_PARAM,
  type CartStatus,
} from "../../../../site/cart-status.ts";

const NO_STORE = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
};

/**
 * Whether the request comes from a page of this site. Browsers send Origin
 * with every POST; Sec-Fetch-Site covers one that would not.
 */
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin) {
    try {
      return host !== null && new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}

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
  const result = await change(cart, form);
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
    if (status !== "added" && status !== "updated")
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
  return response;
}
