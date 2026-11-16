// POST /api/account (issue #177, docs/adr/0014-customer-accounts.md): sign
// up, sign in and sign out, from plain forms that work without JavaScript.
// Fields: lang, intent (sign-up, sign-in or sign-out), and for the first two
// username and password, with confirm for sign-up.
//
// Every answer is a 303 to an account page in the form's language, with a
// notice when the form was refused, so the browser shows that page whether
// or not it runs JavaScript. A route rather than a Server Action, as for the
// cart (ADR 0013): an action that sets a cookie re-renders the page it was
// sent from.
//
// Payload signs in through its Local API, which brings the lockout and the
// sessions stored on the server. The route sets two cookies with the same
// lifetime: Payload's session cookie, readable by the server alone, and
// account_v1, which holds only "1" and tells the header's browser component
// that the visitor is signed in. The cart's cookies are never touched, so
// the cart is kept on sign-in and sign-out.
import config from "@payload-config";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  AuthenticationError,
  createLocalReq,
  getPayload,
  LockedAuth,
  logoutOperation,
  type Payload,
  ValidationError,
} from "payload";
import { CUSTOMER_COLLECTION } from "../../../../cms/collections/customers.ts";
import {
  ACCOUNT_NOTICE_PARAM,
  ACCOUNT_SESSION_SECONDS,
  type AccountNotice,
  MAX_ACCOUNTS,
  normalizeUsername,
  passwordProblem,
  SESSION_COOKIE,
  SIGNED_IN_COOKIE,
  usernameProblem,
} from "../../../../site/account-rules.ts";
import { signedInCustomer } from "../../../../site/account-session.ts";
import {
  type AccountPage,
  accountPagePath,
  isLocale,
} from "../../../../site/addresses.ts";
import { sameOrigin } from "../../../../site/same-origin.ts";

const NO_STORE = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
};

type Outcome = {
  page: AccountPage;
  notice?: AccountNotice;
  /** A session token to set, or null to clear the session cookies. */
  token?: string | null;
};

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

/** The number of demo accounts. */
async function accountCount(payload: Payload): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: CUSTOMER_COLLECTION,
    overrideAccess: true,
  });
  return totalDocs;
}

/** Signs in through Payload, which counts the failures and locks the account. */
async function signIn(
  payload: Payload,
  username: string,
  password: string,
  page: AccountPage,
): Promise<Outcome> {
  if (!username || !password) return { page, notice: "wrong" };
  try {
    const result = await payload.login({
      collection: CUSTOMER_COLLECTION,
      data: { username, password },
    });
    if (!result.token) return { page, notice: "error" };
    return { page: "account", token: result.token };
  } catch (error) {
    if (error instanceof LockedAuth) return { page, notice: "locked" };
    if (
      error instanceof AuthenticationError ||
      error instanceof ValidationError
    )
      return { page, notice: "wrong" };
    throw error;
  }
}

async function signUp(payload: Payload, form: FormData): Promise<Outcome> {
  const page = "sign-up";
  const username = normalizeUsername(field(form, "username"));
  const password = field(form, "password");
  if (usernameProblem(username)) return { page, notice: "username" };
  if (passwordProblem(password)) return { page, notice: "password" };
  if (password !== field(form, "confirm")) return { page, notice: "mismatch" };
  // The page says so before the form is sent; the database's trigger holds
  // the cap when two sign-ups race past this check.
  if ((await accountCount(payload)) >= MAX_ACCOUNTS)
    return { page, notice: "closed" };
  const existing = await payload.find({
    collection: CUSTOMER_COLLECTION,
    where: { username: { equals: username } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (existing.totalDocs > 0) return { page, notice: "taken" };
  try {
    await payload.create({
      collection: CUSTOMER_COLLECTION,
      data: { username, password },
      overrideAccess: true,
    });
  } catch (error) {
    // The trigger refused the row, or another sign-up took the username
    // between the check and the insert.
    if ((await accountCount(payload)) >= MAX_ACCOUNTS)
      return { page, notice: "closed" };
    const taken = await payload.count({
      collection: CUSTOMER_COLLECTION,
      where: { username: { equals: username } },
      overrideAccess: true,
    });
    if (taken.totalDocs > 0) return { page, notice: "taken" };
    throw error;
  }
  return signIn(payload, username, password, page);
}

async function signOut(
  payload: Payload,
  request: NextRequest,
): Promise<Outcome> {
  const customer = await signedInCustomer(request.headers);
  // Removes this browser's session from those Payload stores, so the token
  // is refused even if it was copied before the cookie was cleared.
  if (customer)
    await logoutOperation({
      collection: payload.collections[CUSTOMER_COLLECTION],
      req: await createLocalReq(
        {
          user: {
            ...customer,
            collection: CUSTOMER_COLLECTION,
            _sid: customer.sid,
          } as never,
        },
        payload,
      ),
    });
  return { page: "sign-out", notice: "signed-out", token: null };
}

async function outcome(request: NextRequest, form: FormData): Promise<Outcome> {
  const payload = await getPayload({ config });
  switch (field(form, "intent")) {
    case "sign-in":
      return signIn(
        payload,
        normalizeUsername(field(form, "username")),
        field(form, "password"),
        "account",
      );
    case "sign-up":
      return signUp(payload, form);
    case "sign-out":
      return signOut(payload, request);
    default:
      return { page: "account", notice: "error" };
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
    result = await outcome(request, form);
  } catch (error) {
    console.error("Account route:", error);
    result = { page: "account", notice: "error" };
  }

  const path = accountPagePath(locale, result.page);
  const query = result.notice
    ? `?${ACCOUNT_NOTICE_PARAM}=${result.notice}`
    : "";
  // A relative Location, so the redirect stays on the address the visitor
  // used, whatever host the function sees.
  const response = new NextResponse(null, {
    status: 303,
    headers: { ...NO_STORE, Location: `${path}${query}` },
  });
  const secure = request.nextUrl.protocol === "https:";
  if (typeof result.token === "string") {
    response.cookies.set(SESSION_COOKIE, result.token, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure,
      maxAge: ACCOUNT_SESSION_SECONDS,
    });
    response.cookies.set(SIGNED_IN_COOKIE, "1", {
      path: "/",
      sameSite: "lax",
      // Read by the header's browser component; it holds nothing else.
      httpOnly: false,
      secure,
      maxAge: ACCOUNT_SESSION_SECONDS,
    });
  } else if (result.token === null) {
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(SIGNED_IN_COOKIE);
  }
  return response;
}
