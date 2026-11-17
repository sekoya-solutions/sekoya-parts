// The mock checkout's pages (issue #187), in every language at
// /<lang>/<word>:
// - the delivery step, where the cart page leads: the address (a signed-in
//   customer can pick a saved one), home delivery or a fictitious pickup
//   point, each with its price for this cart;
// - the payment step: the draft order read back, its lines and totals read
//   again from the catalog, and a demo payment with no card field;
// - the confirmation, with the order's number.
// Nothing is ever charged or delivered (AGENTS.md, section 1), and each page
// says so.
//
// Each reads the request outside any <Suspense> boundary, on each visit, as
// the cart and account pages do (ADR 0013): its HTML comes complete, without
// JavaScript. Both forms post to the checkout route,
// app/(site)/api/checkout/route.ts, which leads back to one of these pages
// with a notice. The draft and the order are named by the checkout cookie
// only, so the pages show nothing to another browser. Kept out of search
// engines' indexes and of the sitemap; robots.txt disallows them, as every
// address that is not a showcase page (site/crawl.ts).
import config from "@payload-config";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { getPayload } from "payload";
import type { Locale } from "../cms/locales.ts";
import { readCheckout, type StoredCheckout } from "../cms/orders/store.ts";
import { signedInCustomer } from "./account-session.ts";
import { AddressFields } from "./address-fields.tsx";
import {
  type CheckoutPage,
  cartPath,
  checkoutPageOf,
  checkoutPagePath,
  homePath,
  orderPath,
  perLocale,
} from "./addresses.ts";
import { CART_COOKIE, PROMO_COOKIE, parseCart } from "./cart.ts";
import { cartTotals } from "./cart-pricing.ts";
import {
  CHECKOUT_COOKIE,
  CHECKOUT_NOTICE_PARAM,
  CHECKOUT_ROUTE,
  type CheckoutNotice,
  type DeliveryMethod,
  deliveryFor,
  isCheckoutNotice,
  NEW_ADDRESS,
  ORDER_RETENTION_DAYS,
  tokenHash,
} from "./checkout-rules.ts";
import {
  type CheckoutTotals,
  checkoutTotals,
  readShopDelivery,
} from "./checkout-totals.ts";
import { type Dictionary, fill, getDictionary } from "./dictionary.ts";
import { SiteFrame } from "./frame.tsx";
import {
  AddressLines,
  MethodText,
  PlacedOrder,
  pointText,
  Summary,
} from "./order-summary.tsx";
import { pickupPointsIn } from "./pickup-points.ts";
import { formatPrice } from "./product.tsx";
import { addressLines, COUNTRIES, countryOptions } from "./saved-addresses.ts";
import { type StoredAddress, storedAddresses } from "./stored-addresses.ts";

const TITLES: Record<CheckoutPage, keyof Dictionary> = {
  checkout: "checkoutTitle",
  payment: "paymentTitle",
  confirmation: "confirmationTitle",
};

export function checkoutMetadata(locale: Locale, section: string): Metadata {
  const page = checkoutPageOf(section) ?? "checkout";
  return {
    title: `${getDictionary(locale)[TITLES[page]]} | Sekoya Parts`,
    robots: { index: false },
  };
}

const NOTICES: Record<CheckoutNotice, keyof Dictionary> = {
  address: "checkoutNoticeAddress",
  method: "checkoutNoticeMethod",
  point: "checkoutNoticePoint",
  empty: "checkoutEmpty",
  expired: "checkoutNoticeExpired",
  changed: "checkoutNoticeChanged",
  closed: "checkoutNoticeClosed",
  error: "checkoutNoticeError",
};

function Notice({
  notice,
  dictionary,
}: {
  notice: CheckoutNotice | null;
  dictionary: Dictionary;
}) {
  if (!notice) return null;
  return (
    <p role="alert" data-checkout-notice={notice} className="mt-4 font-bold">
      {dictionary[NOTICES[notice]]}
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

const shownLines = (current: CheckoutTotals, locale: Locale) =>
  current.lines.map((line) => ({
    key: line.route.id,
    name: line.route.names[locale],
    unitCents: line.cents,
    quantity: line.quantity,
  }));

function EmptyCart({
  locale,
  dictionary,
}: {
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <div data-checkout="empty">
      <p className="mt-6">{dictionary.checkoutEmpty}</p>
      <p className="mt-4">
        <a href={cartPath(locale)}>{dictionary.checkoutBackToCart}</a>
      </p>
    </div>
  );
}

/** The saved addresses a signed-in customer may pick, or a new one. */
function SavedChoice({
  addresses,
  preferNew,
  locale,
  dictionary,
}: {
  addresses: StoredAddress[];
  /** Whether a draft's address fills the fields, so they are chosen. */
  preferNew: boolean;
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <fieldset className="mt-4" data-list="saved-addresses">
      <legend className="font-bold">{dictionary.checkoutSavedLegend}</legend>
      {addresses.map((address, index) => (
        <p key={address.id} className="checkout-choice">
          <input
            type="radio"
            id={`saved-${address.id}`}
            name="saved"
            value={address.id}
            defaultChecked={!preferNew && index === 0}
          />{" "}
          <label htmlFor={`saved-${address.id}`}>
            {address.label && (
              <span className="font-bold">{address.label}: </span>
            )}
            {addressLines(address, locale)
              .map(({ text }) => text)
              .join(", ")}
          </label>
        </p>
      ))}
      <p className="checkout-choice">
        <input
          type="radio"
          id="saved-new"
          name="saved"
          value={NEW_ADDRESS}
          defaultChecked={preferNew}
        />{" "}
        <label htmlFor="saved-new">{dictionary.checkoutNewAddress}</label>
      </p>
    </fieldset>
  );
}

function MethodChoice({
  method,
  pointId,
  prices,
  locale,
  dictionary,
}: {
  method: DeliveryMethod;
  pointId: string | null;
  prices: Record<DeliveryMethod, number>;
  locale: Locale;
  dictionary: Dictionary;
}) {
  const price = (cents: number) =>
    cents === 0 ? dictionary.cartDeliveryFree : formatPrice(cents, locale);
  const names = new Map(
    countryOptions(locale).map(({ code, name }) => [code, name]),
  );
  return (
    <fieldset className="mt-8">
      <legend className="text-2xl font-bold">
        {dictionary.checkoutMethodTitle}
      </legend>
      <p className="checkout-choice mt-2">
        <input
          type="radio"
          id="method-home"
          name="method"
          value="home"
          required
          defaultChecked={method === "home"}
        />{" "}
        <label htmlFor="method-home" data-method-price="home">
          {fill(dictionary.checkoutLabelValue, {
            label: dictionary.checkoutHome,
            value: price(prices.home),
          })}
        </label>
      </p>
      <p className="checkout-choice">
        <input
          type="radio"
          id="method-pickup"
          name="method"
          value="pickup"
          defaultChecked={method === "pickup"}
        />{" "}
        <label htmlFor="method-pickup" data-method-price="pickup">
          {fill(dictionary.checkoutLabelValue, {
            label: dictionary.checkoutPickup,
            value: price(prices.pickup),
          })}
        </label>
      </p>
      <p className="mt-4">
        <label htmlFor="pickup-point">{dictionary.checkoutPickupPoint}</label>
        <select
          id="pickup-point"
          name="point"
          defaultValue={pointId ?? ""}
          aria-describedby="pickup-hint"
        >
          <option value="">{dictionary.checkoutPickupNone}</option>
          {[...COUNTRIES]
            .sort((a, b) =>
              (names.get(a) ?? a).localeCompare(names.get(b) ?? b, locale),
            )
            .map((country) => (
              <optgroup key={country} label={names.get(country) ?? country}>
                {pickupPointsIn(country).map((point) => (
                  <option key={point.id} value={point.id}>
                    {pointText(point, dictionary)}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
      </p>
      <p id="pickup-hint" className="mt-1 text-slate">
        {dictionary.checkoutPickupHint}
      </p>
    </fieldset>
  );
}

type Visit = {
  locale: Locale;
  dictionary: Dictionary;
  notice: CheckoutNotice | null;
  cart: ReturnType<typeof parseCart>;
  code: string | undefined;
  stored: StoredCheckout | null;
  customerId: number | null;
};

async function DeliveryStep({ visit }: { visit: Visit }) {
  const { locale, dictionary, stored } = visit;
  const shop = await readShopDelivery();
  const current = await checkoutTotals(visit.cart, visit.code, "home", shop);
  if (current.lines.length === 0)
    return <EmptyCart locale={locale} dictionary={dictionary} />;
  // Each method's price for this cart, free from the same threshold.
  const pickup = cartTotals(
    current.totals.subtotalCents,
    current.code,
    deliveryFor("pickup", shop),
  );
  const draft = stored?.status === "draft" ? stored.choice : null;
  const addresses = visit.customerId
    ? await storedAddresses(visit.customerId)
    : [];
  return (
    <form
      method="post"
      action={CHECKOUT_ROUTE}
      data-checkout="delivery"
      className="checkout-form mt-6"
    >
      <Hidden locale={locale} intent="delivery" />
      <p className="text-slate">{dictionary.addressDemoHint}</p>
      <h2 className="mt-6 text-2xl font-bold">
        {dictionary.checkoutAddressTitle}
      </h2>
      {addresses.length > 0 && (
        <SavedChoice
          addresses={addresses}
          preferNew={draft !== null}
          locale={locale}
          dictionary={dictionary}
        />
      )}
      <AddressFields
        prefix="checkout"
        address={draft?.address ?? null}
        locale={locale}
        dictionary={dictionary}
        withLabel={false}
        optional={addresses.length > 0}
      />
      <MethodChoice
        method={draft?.method ?? "home"}
        pointId={draft?.point?.id ?? null}
        prices={{
          home: current.totals.deliveryCents,
          pickup: pickup.deliveryCents,
        }}
        locale={locale}
        dictionary={dictionary}
      />
      <p className="mt-8">
        <button type="submit" className="account-button">
          {dictionary.checkoutContinue}
        </button>
      </p>
      <p className="mt-4">
        <a href={cartPath(locale)}>{dictionary.checkoutBackToCart}</a>
      </p>
    </form>
  );
}

async function PaymentStep({ visit }: { visit: Visit }) {
  const { locale, dictionary, stored } = visit;
  if (stored?.status !== "draft")
    return (
      <div data-checkout="expired">
        <p className="mt-6">{dictionary.checkoutNoticeExpired}</p>
        <p className="mt-4">
          <a href={checkoutPagePath(locale, "checkout")}>
            {dictionary.paymentChange}
          </a>
        </p>
      </div>
    );
  const current = await checkoutTotals(
    visit.cart,
    visit.code,
    stored.choice.method,
  );
  if (current.lines.length === 0)
    return <EmptyCart locale={locale} dictionary={dictionary} />;
  const { choice } = stored;
  return (
    <div data-checkout="payment">
      <section aria-labelledby="delivery-title" className="mt-6">
        <h2 id="delivery-title" className="text-2xl font-bold">
          {dictionary.checkoutAddressTitle}
        </h2>
        <p className="mt-2" data-order-address>
          <AddressLines address={choice.address} locale={locale} />
        </p>
        <p className="mt-2" data-order-method={choice.method}>
          <MethodText choice={choice} dictionary={dictionary} />
        </p>
        <p className="mt-2">
          <a href={checkoutPagePath(locale, "checkout")}>
            {dictionary.paymentChange}
          </a>
        </p>
      </section>
      <Summary
        lines={shownLines(current, locale)}
        totals={current.totals}
        code={current.code?.code ?? null}
        locale={locale}
        dictionary={dictionary}
      />
      <section aria-labelledby="payment-title" className="mt-8">
        <h2 id="payment-title" className="text-2xl font-bold">
          {dictionary.paymentDemoTitle}
        </h2>
        <p className="mt-2" data-demo-payment>
          {dictionary.paymentDemoText}
        </p>
        <form method="post" action={CHECKOUT_ROUTE} className="mt-4">
          <Hidden locale={locale} intent="place" />
          {/* What this page shows: the route places the order only at this
              total, computed again on the server. */}
          <input type="hidden" name="total" value={current.totals.totalCents} />
          <button type="submit" className="account-button">
            {dictionary.paymentPlace}
          </button>
        </form>
      </section>
    </div>
  );
}

function ConfirmationView({ visit }: { visit: Visit }) {
  const { locale, dictionary, stored } = visit;
  if (stored?.status !== "placed" || !stored.totals)
    return (
      <div data-checkout="no-order">
        <p className="mt-6">{dictionary.confirmationNone}</p>
        <p className="mt-4">
          <a href={homePath(locale)}>{dictionary.confirmationHome}</a>
        </p>
      </div>
    );
  return (
    <div data-checkout="confirmed">
      <p role="status" className="mt-6 text-lg">
        {dictionary.confirmationThanks}{" "}
        <strong data-order-number>{stored.number}</strong>
      </p>
      <p className="mt-2">{dictionary.confirmationDemo}</p>
      {stored.customerId === null ? (
        <p className="mt-2 text-slate">
          {fill(dictionary.confirmationKept, { days: ORDER_RETENTION_DAYS })}
        </p>
      ) : (
        // A signed-in customer finds it in the account (issue #188).
        <p className="mt-2 text-slate" data-order-account>
          {dictionary.confirmationInAccount}{" "}
          <a href={orderPath(locale, stored.number ?? "")}>
            {dictionary.confirmationAccountLink}
          </a>
        </p>
      )}
      <PlacedOrder
        order={{ ...stored, totals: stored.totals }}
        locale={locale}
        dictionary={dictionary}
      />
      <p className="mt-8">
        <a href={homePath(locale)}>{dictionary.confirmationHome}</a>
      </p>
    </div>
  );
}

async function CheckoutContents({
  locale,
  page,
  searchParams,
}: {
  locale: Locale;
  page: CheckoutPage;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [store, requestHeaders, query] = await Promise.all([
    cookies(),
    headers(),
    searchParams,
  ]);
  const raw = query[CHECKOUT_NOTICE_PARAM];
  const hash = tokenHash(store.get(CHECKOUT_COOKIE)?.value);
  const adapter = (await getPayload({ config }))
    .db as unknown as PostgresAdapter;
  const [stored, customer] = await Promise.all([
    hash ? readCheckout(adapter.pool, hash) : null,
    page === "checkout" ? signedInCustomer(new Headers(requestHeaders)) : null,
  ]);
  const visit: Visit = {
    locale,
    dictionary: getDictionary(locale),
    notice: isCheckoutNotice(raw) ? raw : null,
    cart: parseCart(store.get(CART_COOKIE)?.value),
    code: store.get(PROMO_COOKIE)?.value,
    stored,
    customerId: customer?.id ?? null,
  };
  return (
    <>
      <Notice notice={visit.notice} dictionary={visit.dictionary} />
      {page === "checkout" ? (
        <DeliveryStep visit={visit} />
      ) : page === "payment" ? (
        <PaymentStep visit={visit} />
      ) : (
        <ConfirmationView visit={visit} />
      )}
    </>
  );
}

export function CheckoutPageView({
  locale,
  section,
  searchParams,
}: {
  locale: Locale;
  section: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const page = checkoutPageOf(section) ?? "checkout";
  const dictionary = getDictionary(locale);
  return (
    <SiteFrame
      locale={locale}
      template={page}
      paths={perLocale((other) => checkoutPagePath(other, page))}
    >
      <h1 className="text-3xl font-bold sm:text-4xl">
        {dictionary[TITLES[page]]}
      </h1>
      <p data-demo-notice className="mt-2 text-slate">
        {dictionary.checkoutDemo}
      </p>
      <CheckoutContents
        locale={locale}
        page={page}
        searchParams={searchParams}
      />
    </SiteFrame>
  );
}
