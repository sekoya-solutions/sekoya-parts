// POST /api/checkout (issue #187): the mock checkout's two forms, from plain
// forms that work without JavaScript. Nothing is ever charged or delivered.
//
// - intent delivery, the first step: the address (a signed-in customer's
//   saved one, by `saved`, or the form's fields), the delivery method and,
//   for a pickup point, `point`. The answers are stored as a draft order,
//   named by the checkout cookie's random token (owner decision,
//   2026-11-17), and the visitor goes on to the payment step. A refused
//   point keeps the rest of the answers, so the first step shows them again.
// - intent place, the payment step, a demo with no card field: the draft
//   becomes an order. Its lines, the promotion code and delivery are read
//   again from the catalog and "Shop settings" now, never from the form;
//   `total` is only the amount the payment page showed, and a different one
//   now sends the visitor back to it with the new total. The cart and its
//   code are emptied once the order is stored.
//
// Every answer is a 303 to a checkout page or the cart page in the form's
// language, with a notice when the form was refused, so the browser shows
// that page whether or not it runs JavaScript. A route rather than a Server
// Action, as for the cart and the accounts (ADR 0013), and a request from
// another site is refused.
import config from "@payload-config";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import type { Locale } from "../../../../cms/locales.ts";
import {
  type PlacedLine,
  type Placement,
  placeOrder,
  type StoredCheckout,
  saveDraft,
} from "../../../../cms/orders/store.ts";
import { signedInCustomer } from "../../../../site/account-session.ts";
import {
  type CheckoutPage,
  cartPath,
  checkoutPagePath,
  isLocale,
} from "../../../../site/addresses.ts";
import { CART_COOKIE, PROMO_COOKIE, parseCart } from "../../../../site/cart.ts";
import { counted, readLines } from "../../../../site/cart-lines.ts";
import {
  CHECKOUT_COOKIE,
  CHECKOUT_NOTICE_PARAM,
  CHECKOUT_SECONDS,
  type CheckoutNotice,
  type DeliveryChoice,
  isDeliveryMethod,
  NEW_ADDRESS,
  newCheckoutToken,
  parseDelivery,
  tokenHash,
} from "../../../../site/checkout-rules.ts";
import { checkoutTotals } from "../../../../site/checkout-totals.ts";
import { sameOrigin } from "../../../../site/same-origin.ts";
import { storedAddresses } from "../../../../site/stored-addresses.ts";

const NO_STORE = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
};

type Outcome = {
  /** Where the visitor goes: a checkout page, or the cart when it is empty. */
  page: CheckoutPage | "cart";
  notice?: CheckoutNotice;
  /** A checkout token to set (again) for CHECKOUT_SECONDS. */
  token?: string;
  /** Whether the cart and its promotion code are emptied: the order is placed. */
  emptyCart?: boolean;
};

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

/** Whether the cart holds a line that can be ordered. */
async function hasOrderableLines(request: NextRequest): Promise<boolean> {
  const cart = parseCart(request.cookies.get(CART_COOKIE)?.value);
  return (await readLines(cart)).some(counted);
}

async function delivery(
  request: NextRequest,
  form: FormData,
  locale: Locale,
): Promise<Outcome> {
  if (!(await hasOrderableLines(request))) return { page: "cart" };
  const customer = await signedInCustomer(request.headers);
  // A signed-in customer's saved address, named by its id among theirs.
  const savedId = field(form, "saved");
  let saved = null;
  if (customer && savedId && savedId !== NEW_ADDRESS) {
    saved =
      (await storedAddresses(customer.id)).find(
        (address) => address.id === savedId,
      ) ?? null;
    if (!saved) return { page: "checkout", notice: "address" };
  }
  const parsed = parseDelivery((name) => form.get(name), saved);
  // A refused point keeps the address, stored with the method and no point.
  let choice: DeliveryChoice;
  let notice: CheckoutNotice | undefined;
  if ("choice" in parsed) choice = parsed.choice;
  else if (parsed.problem === "point" && parsed.address) {
    choice = { address: parsed.address, method: "pickup", point: null };
    notice = "point";
  } else return { page: "checkout", notice: parsed.problem };

  const adapter = (await getPayload({ config }))
    .db as unknown as PostgresAdapter;
  const current = request.cookies.get(CHECKOUT_COOKIE)?.value;
  let token = tokenHash(current) ? (current as string) : newCheckoutToken();
  const draft = { locale, customerId: customer?.id ?? null, choice };
  let outcome = await saveDraft(
    adapter.pool,
    tokenHash(token) as string,
    draft,
  );
  // The cookie names an order placed before: a new draft, under a new token.
  if (outcome === "placed") {
    token = newCheckoutToken();
    outcome = await saveDraft(adapter.pool, tokenHash(token) as string, draft);
  }
  if (outcome === "closed") return { page: "checkout", notice: "closed" };
  if (outcome !== "saved") return { page: "checkout", notice: "error" };
  return notice
    ? { page: "checkout", notice, token }
    : { page: "payment", token };
}

/** The order's lines as placed, in its language. */
const placedLines = (
  lines: Awaited<ReturnType<typeof checkoutTotals>>["lines"],
  locale: Locale,
): PlacedLine[] =>
  lines.map((line) => ({
    product: line.route.id,
    reference: line.route.reference,
    name: line.route.names[locale],
    unitCents: line.cents,
    quantity: line.quantity,
  }));

async function place(request: NextRequest, form: FormData): Promise<Outcome> {
  const token = request.cookies.get(CHECKOUT_COOKIE)?.value;
  const hash = tokenHash(token);
  if (!hash || !token) return { page: "checkout", notice: "expired" };
  const shown = Number(field(form, "total"));
  const cart = parseCart(request.cookies.get(CART_COOKIE)?.value);
  const code = request.cookies.get(PROMO_COOKIE)?.value;
  const customer = await signedInCustomer(request.headers);
  const adapter = (await getPayload({ config }))
    .db as unknown as PostgresAdapter;

  const compute = async (draft: StoredCheckout): Promise<Placement> => {
    const { choice } = draft;
    if (
      !isDeliveryMethod(choice.method) ||
      (choice.method === "pickup" &&
        (!choice.point || choice.point.country !== choice.address.country))
    )
      return { refused: "choice" };
    const {
      lines,
      code: applied,
      totals,
    } = await checkoutTotals(cart, code, choice.method);
    if (lines.length === 0) return { refused: "empty" };
    if (!Number.isSafeInteger(shown) || shown !== totals.totalCents)
      return { refused: "changed" };
    return {
      lines: placedLines(lines, draft.locale),
      totals: {
        promotionCode: applied?.code ?? null,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        deliveryCents: totals.deliveryCents,
        totalCents: totals.totalCents,
      },
      customerId: customer?.id ?? null,
    };
  };

  const result = await placeOrder(adapter.pool, hash, compute);
  switch (result.outcome) {
    case "placed":
      return { page: "confirmation", token, emptyCart: true };
    case "already":
      return { page: "confirmation" };
    case "expired":
      return { page: "checkout", notice: "expired" };
    case "empty":
      return { page: "cart" };
    case "changed":
      return { page: "payment", notice: "changed" };
    default:
      return { page: "checkout", notice: "point" };
  }
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
  const lang = field(form, "lang");
  const locale = isLocale(lang) ? lang : "fr";
  let result: Outcome;
  try {
    const intent = field(form, "intent");
    result =
      intent === "delivery"
        ? await delivery(request, form, locale)
        : intent === "place"
          ? await place(request, form)
          : { page: "checkout", notice: "error" };
  } catch (error) {
    console.error("Checkout route:", error);
    result = { page: "checkout", notice: "error" };
  }

  const path =
    result.page === "cart"
      ? cartPath(locale)
      : checkoutPagePath(locale, result.page);
  const query = result.notice
    ? `?${CHECKOUT_NOTICE_PARAM}=${result.notice}`
    : "";
  // A relative Location, so the redirect stays on the address the visitor
  // used, whatever host the function sees.
  const response = new NextResponse(null, {
    status: 303,
    headers: { ...NO_STORE, Location: `${path}${query}` },
  });
  const secure = request.nextUrl.protocol === "https:";
  if (result.token)
    response.cookies.set(CHECKOUT_COOKIE, result.token, {
      path: "/",
      sameSite: "lax",
      // Only the server reads it: it names the visitor's draft and order.
      httpOnly: true,
      secure,
      maxAge: CHECKOUT_SECONDS,
    });
  if (result.emptyCart) {
    response.cookies.delete(CART_COOKIE);
    response.cookies.delete(PROMO_COOKIE);
  }
  return response;
}
