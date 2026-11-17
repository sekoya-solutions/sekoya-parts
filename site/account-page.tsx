// The account pages (issue #177, docs/adr/0014-customer-accounts.md), in
// every language at /<lang>/<word>:
// - the account address, where the header's link leads: the sign-in form for
//   a visitor who is not signed in, the username and a sign-out button for a
//   customer, then since issue #178 the account page itself: the saved
//   addresses, with one shown as a form to edit when ?address=<id> names
//   it, the password change and "Delete my account", and since issue #188
//   the customer's orders, each leading to its own page at ?order=<number>,
//   readable by its customer only;
// - the sign-up page;
// - the sign-out page, which confirms the sign-out and asks for it.
//
// Each reads the request outside any <Suspense> boundary, on each visit, as
// the cart page does (ADR 0013): its HTML comes complete, without
// JavaScript. Every form posts to the account route,
// app/(site)/api/account/route.ts, which leads back to one of these pages
// with a notice. Kept out of search engines' indexes and of the sitemap;
// robots.txt already disallows them (site/crawl.ts).

import config from "@payload-config";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import { CUSTOMER_COLLECTION } from "../cms/collections/customers.ts";
import type { Locale } from "../cms/locales.ts";
import {
  customerOrder,
  customerOrders,
  type StoredCheckout,
} from "../cms/orders/store.ts";
import {
  ACCOUNT_NOTICE_PARAM,
  ACCOUNT_ROUTE,
  type AccountNotice,
  ADDRESS_EDIT_PARAM,
  DONE_NOTICES,
  isAccountNotice,
  MAX_ACCOUNTS,
  ORDER_LIST_MAX,
  ORDER_PARAM,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USERNAME_MAX,
  USERNAME_MIN,
} from "./account-rules.ts";
import { type SignedInCustomer, signedInCustomer } from "./account-session.ts";
import { AddressFields } from "./address-fields.tsx";
import {
  type AccountPage,
  accountPageOf,
  accountPagePath,
  accountPath,
  orderPath,
  perLocale,
} from "./addresses.ts";
import { orderDate, parseOrderNumber } from "./checkout-rules.ts";
import { type Dictionary, fill, getDictionary } from "./dictionary.ts";
import { SiteFrame } from "./frame.tsx";
import { PlacedOrder } from "./order-summary.tsx";
import { formatPrice } from "./product.tsx";
import { addressLines, MAX_ADDRESSES } from "./saved-addresses.ts";
import { type StoredAddress, storedAddresses } from "./stored-addresses.ts";

const TITLES: Record<AccountPage, keyof Dictionary> = {
  account: "accountTitle",
  "sign-up": "signUpTitle",
  "sign-out": "signOutTitle",
};

export function accountMetadata(
  locale: Locale,
  section: string,
  query: Record<string, string | string[] | undefined>,
): Metadata {
  const page = accountPageOf(section) ?? "account";
  const dictionary = getDictionary(locale);
  const number =
    page === "account" ? parseOrderNumber(query[ORDER_PARAM]) : null;
  return {
    title: `${number ? fill(dictionary.orderTitle, { number }) : dictionary[TITLES[page]]} | Sekoya Parts`,
    robots: { index: false },
  };
}

/** The Postgres pool Payload's adapter holds, for the order reads. */
async function pool() {
  return ((await getPayload({ config })).db as unknown as PostgresAdapter).pool;
}

/**
 * The order number the account address names with ?order= (issue #188),
 * null without the parameter, and the not-found page for a value that is not
 * an order number.
 */
function orderNumberOf(
  query: Record<string, string | string[] | undefined>,
): string | null {
  const raw = query[ORDER_PARAM];
  if (raw === undefined) return null;
  const number = parseOrderNumber(raw);
  if (!number) notFound();
  return number;
}

/**
 * One of the customer's orders (issue #188): null for a visitor who is not
 * signed in, who gets the sign-in form, and the not-found page when no
 * placed order of this customer has the number, so another customer's order
 * reads as none.
 *
 * The page streams, so its status is already 200 when this is decided:
 * Next.js then renders the not-found page with a noindex tag, but cannot
 * send a 404 (node_modules/next/dist/docs/01-app/02-guides/streaming.md,
 * "The HTTP contract"). Nothing of the order reaches that page.
 */
async function orderView(number: string) {
  const customer = await signedInCustomer(new Headers(await headers()));
  if (!customer) return null;
  const order = await customerOrder(await pool(), customer.id, number);
  if (!order?.totals || !order.placedAt) notFound();
  return { ...order, totals: order.totals, placedAt: order.placedAt };
}

/** A refusal's message; the sign-out's confirmation is shown on its own. */
function noticeText(dictionary: Dictionary, notice: AccountNotice): string {
  switch (notice) {
    case "wrong":
      return dictionary.accountWrong;
    case "locked":
      return dictionary.accountLocked;
    case "taken":
      return dictionary.accountTaken;
    case "username":
      return dictionary.accountUsernameInvalid;
    case "password":
      return dictionary.accountPasswordInvalid;
    case "mismatch":
      return dictionary.accountMismatch;
    case "closed":
      return dictionary.signUpClosed;
    case "signed-out":
      return dictionary.signOutDone;
    case "current":
      return dictionary.accountCurrentWrong;
    case "password-changed":
      return dictionary.passwordChanged;
    case "address-saved":
      return dictionary.addressSaved;
    case "address-removed":
      return dictionary.addressRemoved;
    case "address-invalid":
      return dictionary.addressInvalid;
    case "address-full":
      return fill(dictionary.addressesFull, { max: MAX_ADDRESSES });
    case "address-missing":
      return dictionary.addressMissing;
    case "session":
      return dictionary.accountSession;
    case "deleted":
      return dictionary.accountDeleted;
    default:
      return dictionary.accountError;
  }
}

function Notice({
  notice,
  dictionary,
}: {
  notice: AccountNotice | null;
  dictionary: Dictionary;
}) {
  if (!notice) return null;
  return (
    <p
      role={DONE_NOTICES.includes(notice) ? "status" : "alert"}
      data-account-notice={notice}
      className="mt-4 font-bold"
    >
      {noticeText(dictionary, notice)}
    </p>
  );
}

function Hidden({ locale, intent }: { locale: Locale; intent: string }) {
  return (
    <>
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
}

function UsernameField({
  dictionary,
  hint,
}: {
  dictionary: Dictionary;
  hint?: boolean;
}) {
  return (
    <p>
      <label htmlFor="account-username">{dictionary.accountUsername}</label>
      <input
        id="account-username"
        name="username"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        minLength={USERNAME_MIN}
        maxLength={USERNAME_MAX}
        required
        aria-describedby={hint ? "account-username-hint" : undefined}
      />
      {hint && (
        <span id="account-username-hint" className="account-hint">
          {dictionary.signUpUsernameHint}
        </span>
      )}
    </p>
  );
}

function PasswordField({
  id,
  name,
  label,
  autoComplete,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  hint?: string;
}) {
  return (
    <p>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type="password"
        autoComplete={autoComplete}
        // Sign-in takes any length: an account's password has its own.
        minLength={autoComplete === "new-password" ? PASSWORD_MIN : undefined}
        maxLength={PASSWORD_MAX}
        required
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <span id={`${id}-hint`} className="account-hint">
          {hint}
        </span>
      )}
    </p>
  );
}

function SignOutForm({
  locale,
  dictionary,
}: {
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <form method="post" action={ACCOUNT_ROUTE} className="mt-4">
      <Hidden locale={locale} intent="sign-out" />
      <button type="submit" className="account-button">
        {dictionary.signOutButton}
      </button>
    </form>
  );
}

function SignedIn({
  customer,
  locale,
  dictionary,
}: {
  customer: SignedInCustomer;
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <div data-account="signed-in">
      <p className="mt-6 text-lg">
        {fill(dictionary.accountSignedInAs, { username: customer.username })}
      </p>
      <SignOutForm locale={locale} dictionary={dictionary} />
    </div>
  );
}

function AddressCard({
  address,
  locale,
  dictionary,
}: {
  address: StoredAddress;
  locale: Locale;
  dictionary: Dictionary;
}) {
  const named = address.label || address.name;
  return (
    <li data-address={address.id} className="address-card">
      {address.label && <p className="font-bold">{address.label}</p>}
      <p>
        {addressLines(address, locale).map(({ key, text }) => (
          <span key={key} className="block">
            {text}
          </span>
        ))}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <a
          href={`${accountPath(locale)}?${ADDRESS_EDIT_PARAM}=${address.id}`}
          className="address-action"
        >
          {dictionary.addressEdit}
          <span className="sr-only">: {named}</span>
        </a>
        <form method="post" action={ACCOUNT_ROUTE}>
          <Hidden locale={locale} intent="address-remove" />
          <input type="hidden" name="id" value={address.id} />
          <button type="submit" className="address-action">
            {dictionary.addressRemove}
            <span className="sr-only">: {named}</span>
          </button>
        </form>
      </div>
    </li>
  );
}

function AddressEditForm({
  address,
  locale,
  dictionary,
}: {
  address: StoredAddress;
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <li data-address={address.id} className="address-card">
      <form
        method="post"
        action={ACCOUNT_ROUTE}
        className="account-form"
        data-account-form="address-edit"
        aria-labelledby="address-edit-title"
      >
        <h3 id="address-edit-title" className="text-lg font-bold">
          {dictionary.addressEditTitle}
        </h3>
        <Hidden locale={locale} intent="address-edit" />
        <input type="hidden" name="id" value={address.id} />
        <AddressFields
          prefix="address-edit"
          address={address}
          locale={locale}
          dictionary={dictionary}
        />
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" className="account-button">
            {dictionary.addressSaveButton}
          </button>
          <a href={accountPath(locale)}>{dictionary.addressCancel}</a>
        </div>
      </form>
    </li>
  );
}

function Addresses({
  addresses,
  editing,
  locale,
  dictionary,
}: {
  addresses: StoredAddress[];
  editing: string | null;
  locale: Locale;
  dictionary: Dictionary;
}) {
  const full = addresses.length >= MAX_ADDRESSES;
  return (
    <section aria-labelledby="addresses-title" className="mt-10">
      <h2 id="addresses-title" className="text-2xl font-bold">
        {dictionary.addressesTitle}
      </h2>
      <p className="mt-2 text-slate">
        {fill(dictionary.addressesCount, {
          count: addresses.length,
          max: MAX_ADDRESSES,
        })}{" "}
        {dictionary.addressDemoHint}
      </p>
      {addresses.length === 0 ? (
        <p className="mt-4" data-addresses="none">
          {dictionary.addressesNone}
        </p>
      ) : (
        <ul className="address-list mt-4" data-list="addresses">
          {addresses.map((address) =>
            address.id === editing ? (
              <AddressEditForm
                key={address.id}
                address={address}
                locale={locale}
                dictionary={dictionary}
              />
            ) : (
              <AddressCard
                key={address.id}
                address={address}
                locale={locale}
                dictionary={dictionary}
              />
            ),
          )}
        </ul>
      )}
      {full ? (
        <p className="mt-4" data-addresses="full">
          {fill(dictionary.addressesFull, { max: MAX_ADDRESSES })}
        </p>
      ) : (
        <form
          method="post"
          action={ACCOUNT_ROUTE}
          className="account-form mt-6"
          data-account-form="address-add"
          aria-labelledby="address-add-title"
        >
          <h3 id="address-add-title" className="text-lg font-bold">
            {dictionary.addressAddTitle}
          </h3>
          <Hidden locale={locale} intent="address-add" />
          <AddressFields
            prefix="address-new"
            address={null}
            locale={locale}
            dictionary={dictionary}
          />
          <button type="submit" className="account-button">
            {dictionary.addressAddButton}
          </button>
        </form>
      )}
    </section>
  );
}

function PasswordChange({
  locale,
  dictionary,
}: {
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <section aria-labelledby="password-title" className="mt-10">
      <h2 id="password-title" className="text-2xl font-bold">
        {dictionary.passwordTitle}
      </h2>
      <form
        method="post"
        action={ACCOUNT_ROUTE}
        className="account-form mt-4"
        data-account-form="password"
      >
        <Hidden locale={locale} intent="password" />
        <PasswordField
          id="password-current"
          name="current"
          label={dictionary.passwordCurrent}
          autoComplete="current-password"
        />
        <PasswordField
          id="password-new"
          name="password"
          label={dictionary.passwordNew}
          autoComplete="new-password"
          hint={dictionary.signUpPasswordHint}
        />
        <PasswordField
          id="password-confirm"
          name="confirm"
          label={dictionary.passwordNewConfirm}
          autoComplete="new-password"
        />
        <p className="text-slate">{dictionary.passwordOtherSessions}</p>
        <button type="submit" className="account-button">
          {dictionary.passwordButton}
        </button>
      </form>
    </section>
  );
}

function DeleteAccount({
  locale,
  dictionary,
}: {
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <section aria-labelledby="delete-title" className="mt-10">
      <h2 id="delete-title" className="text-2xl font-bold">
        {dictionary.deleteTitle}
      </h2>
      <p className="mt-2">{dictionary.deleteText}</p>
      <form
        method="post"
        action={ACCOUNT_ROUTE}
        className="account-form mt-4"
        data-account-form="delete"
      >
        <Hidden locale={locale} intent="delete" />
        <PasswordField
          id="delete-password"
          name="password"
          label={dictionary.deletePassword}
          autoComplete="current-password"
        />
        <button type="submit" className="account-button account-button-danger">
          {dictionary.deleteButton}
        </button>
      </form>
    </section>
  );
}

/**
 * The customer's placed orders, newest first (issue #188): the
 * ORDER_LIST_MAX most recent, each leading to its own page.
 */
async function Orders({
  customer,
  locale,
  dictionary,
}: {
  customer: SignedInCustomer;
  locale: Locale;
  dictionary: Dictionary;
}) {
  // One more than shown, to tell whether there are more.
  const orders = await customerOrders(
    await pool(),
    customer.id,
    ORDER_LIST_MAX + 1,
  );
  const shown = orders.slice(0, ORDER_LIST_MAX);
  return (
    <section aria-labelledby="orders-title" className="mt-10">
      <h2 id="orders-title" className="text-2xl font-bold">
        {dictionary.ordersTitle}
      </h2>
      {shown.length === 0 ? (
        <p className="mt-2" data-orders="none">
          {dictionary.ordersNone}
        </p>
      ) : (
        <>
          <table className="orders-table mt-4" data-list="orders">
            <thead>
              <tr>
                <th scope="col">{dictionary.ordersNumber}</th>
                <th scope="col">{dictionary.ordersDate}</th>
                <th scope="col">{dictionary.ordersTotal}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((order) => (
                <tr key={order.number} data-order={order.number}>
                  <th scope="row" className="orders-number">
                    <a
                      href={orderPath(locale, order.number)}
                      className="orders-link"
                    >
                      {order.number}
                    </a>
                  </th>
                  <td>{orderDate(order.placedAt, locale)}</td>
                  <td
                    className="orders-total"
                    data-order-total={order.totalCents}
                  >
                    {formatPrice(order.totalCents, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length > ORDER_LIST_MAX && (
            <p className="mt-2 text-slate" data-orders="more">
              {fill(dictionary.ordersMore, { count: ORDER_LIST_MAX })}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** The account page of a signed-in customer (issue #178). */
async function AccountHome({
  customer,
  editing,
  locale,
  dictionary,
}: {
  customer: SignedInCustomer;
  editing: string | null;
  locale: Locale;
  dictionary: Dictionary;
}) {
  const addresses = await storedAddresses(customer.id);
  return (
    <div data-account="signed-in">
      <section aria-labelledby="profile-title" className="mt-6">
        <h2 id="profile-title" className="text-2xl font-bold">
          {dictionary.accountProfileTitle}
        </h2>
        <p className="mt-2 text-lg" data-account-username>
          {fill(dictionary.accountSignedInAs, { username: customer.username })}
        </p>
        <SignOutForm locale={locale} dictionary={dictionary} />
      </section>
      <Orders customer={customer} locale={locale} dictionary={dictionary} />
      <Addresses
        addresses={addresses}
        editing={editing}
        locale={locale}
        dictionary={dictionary}
      />
      <PasswordChange locale={locale} dictionary={dictionary} />
      <DeleteAccount locale={locale} dictionary={dictionary} />
    </div>
  );
}

function SignInForm({
  locale,
  dictionary,
}: {
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <div data-account="signed-out">
      <h2 className="mt-6 text-2xl font-bold">{dictionary.signInTitle}</h2>
      <form
        method="post"
        action={ACCOUNT_ROUTE}
        className="account-form mt-4"
        data-account-form="sign-in"
      >
        <Hidden locale={locale} intent="sign-in" />
        <UsernameField dictionary={dictionary} />
        <PasswordField
          id="account-password"
          name="password"
          label={dictionary.accountPassword}
          autoComplete="current-password"
        />
        <button type="submit" className="account-button">
          {dictionary.signInButton}
        </button>
      </form>
      <p data-no-reset className="mt-4 text-slate">
        {dictionary.signInNoReset}
      </p>
      <p className="mt-4">
        {dictionary.signUpPrompt}{" "}
        <a href={accountPagePath(locale, "sign-up")}>{dictionary.signUpLink}</a>
      </p>
    </div>
  );
}

function SignUpForm({
  locale,
  dictionary,
}: {
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <>
      <form
        method="post"
        action={ACCOUNT_ROUTE}
        className="account-form mt-6"
        data-account-form="sign-up"
      >
        <Hidden locale={locale} intent="sign-up" />
        <UsernameField dictionary={dictionary} hint />
        <PasswordField
          id="account-password"
          name="password"
          label={dictionary.accountPassword}
          autoComplete="new-password"
          hint={dictionary.signUpPasswordHint}
        />
        <PasswordField
          id="account-confirm"
          name="confirm"
          label={dictionary.accountPasswordConfirm}
          autoComplete="new-password"
        />
        <button type="submit" className="account-button">
          {dictionary.signUpButton}
        </button>
      </form>
      <p className="mt-4 text-slate">{dictionary.signUpRetention}</p>
      <p data-no-reset className="mt-2 text-slate">
        {dictionary.signInNoReset}
      </p>
    </>
  );
}

async function accountCount(): Promise<number> {
  const payload = await getPayload({ config });
  const { totalDocs } = await payload.count({
    collection: CUSTOMER_COLLECTION,
    overrideAccess: true,
  });
  return totalDocs;
}

async function AccountContents({
  locale,
  page,
  searchParams,
}: {
  locale: Locale;
  page: AccountPage;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const dictionary = getDictionary(locale);
  const [requestHeaders, query] = await Promise.all([headers(), searchParams]);
  const raw = query[ACCOUNT_NOTICE_PARAM];
  const notice = isAccountNotice(raw) ? raw : null;
  const edit = query[ADDRESS_EDIT_PARAM];
  const customer = await signedInCustomer(new Headers(requestHeaders));

  if (page === "account")
    return (
      <>
        <Notice notice={notice} dictionary={dictionary} />
        {customer ? (
          <AccountHome
            customer={customer}
            editing={typeof edit === "string" ? edit : null}
            locale={locale}
            dictionary={dictionary}
          />
        ) : (
          <SignInForm locale={locale} dictionary={dictionary} />
        )}
      </>
    );

  if (page === "sign-up") {
    if (customer)
      return (
        <SignedIn customer={customer} locale={locale} dictionary={dictionary} />
      );
    const closed = (await accountCount()) >= MAX_ACCOUNTS;
    return (
      <div data-account={closed ? "closed" : "signed-out"}>
        {closed ? (
          <p role="alert" data-account-notice="closed" className="mt-4">
            {dictionary.signUpClosed}
          </p>
        ) : (
          <>
            <Notice notice={notice} dictionary={dictionary} />
            <SignUpForm locale={locale} dictionary={dictionary} />
          </>
        )}
        <p className="mt-4">
          {dictionary.signInPrompt}{" "}
          <a href={accountPagePath(locale, "account")}>
            {dictionary.signInLink}
          </a>
        </p>
      </div>
    );
  }

  // The sign-out page.
  return (
    <div data-account={customer ? "signed-in" : "signed-out"}>
      <Notice notice={notice} dictionary={dictionary} />
      {customer ? (
        <>
          <p className="mt-6">
            {fill(dictionary.accountSignedInAs, {
              username: customer.username,
            })}{" "}
            {dictionary.signOutConfirm}
          </p>
          <SignOutForm locale={locale} dictionary={dictionary} />
        </>
      ) : (
        <>
          {notice !== "signed-out" && (
            <p className="mt-6">{dictionary.signOutNotSignedIn}</p>
          )}
          <p className="mt-4">
            <a href={accountPagePath(locale, "account")}>
              {dictionary.signInLink}
            </a>
          </p>
        </>
      )}
    </div>
  );
}

/**
 * One of the customer's placed orders (issue #188), as it was placed.
 */
function OrderDetails({
  order,
  locale,
  dictionary,
}: {
  order: StoredCheckout & {
    totals: NonNullable<StoredCheckout["totals"]>;
    placedAt: string;
  };
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <div data-account="order">
      <p className="mt-6" data-order-date>
        {fill(dictionary.orderPlacedOn, {
          date: orderDate(order.placedAt, locale),
        })}
      </p>
      <PlacedOrder
        order={{ ...order, totals: order.totals }}
        locale={locale}
        dictionary={dictionary}
      />
      <p className="mt-8">
        <a href={accountPath(locale)}>{dictionary.orderBack}</a>
      </p>
    </div>
  );
}

export async function AccountPageView({
  locale,
  section,
  searchParams,
}: {
  locale: Locale;
  section: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const page = accountPageOf(section) ?? "account";
  const dictionary = getDictionary(locale);
  // Read outside any <Suspense> boundary, like the rest of the page. One of
  // the customer's orders at ?order=<number> (issue #188).
  const number = page === "account" ? orderNumberOf(await searchParams) : null;
  if (number) {
    const order = await orderView(number);
    return (
      <SiteFrame
        locale={locale}
        template="order"
        paths={perLocale((other) => orderPath(other, number))}
      >
        <h1 className="text-3xl font-bold sm:text-4xl">
          {fill(dictionary.orderTitle, { number })}
        </h1>
        <p data-demo-notice className="mt-2 text-slate">
          {dictionary.accountDemo}
        </p>
        {order ? (
          <OrderDetails order={order} locale={locale} dictionary={dictionary} />
        ) : (
          <SignInForm locale={locale} dictionary={dictionary} />
        )}
      </SiteFrame>
    );
  }
  return (
    <SiteFrame
      locale={locale}
      template={page}
      paths={perLocale((other) => accountPagePath(other, page))}
    >
      <h1 className="text-3xl font-bold sm:text-4xl">
        {dictionary[TITLES[page]]}
      </h1>
      <p data-demo-notice className="mt-2 text-slate">
        {dictionary.accountDemo}
      </p>
      <AccountContents
        locale={locale}
        page={page}
        searchParams={searchParams}
      />
    </SiteFrame>
  );
}
