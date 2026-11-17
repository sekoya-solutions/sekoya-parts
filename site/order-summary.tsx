// An order's address, delivery method, lines and totals, as the checkout's
// payment step and confirmation show them (issue #187) and, since issue
// #188, the account's order page.
import type { Locale } from "../cms/locales.ts";
import type { StoredCheckout } from "../cms/orders/store.ts";
import type { CartTotals } from "./cart-pricing.ts";
import type { DeliveryChoice } from "./checkout-rules.ts";
import { type Dictionary, fill } from "./dictionary.ts";
import type { PickupPoint } from "./pickup-points.ts";
import { formatPrice } from "./product.tsx";
import { addressLines, type SavedAddress } from "./saved-addresses.ts";

export function AddressLines({
  address,
  locale,
}: {
  address: SavedAddress;
  locale: Locale;
}) {
  return (
    <>
      {addressLines(address, locale).map(({ key, text }) => (
        <span key={key} className="block">
          {text}
        </span>
      ))}
    </>
  );
}

/** A pickup point as the page names it: its name, postal code and city. */
export const pointText = (point: PickupPoint, dictionary: Dictionary): string =>
  `${fill(dictionary.checkoutPickupName, { city: point.city })}, ${point.postalCode} ${point.city}`;

/** A delivery method's name, with its pickup point when it has one. */
export function MethodText({
  choice,
  dictionary,
}: {
  choice: DeliveryChoice;
  dictionary: Dictionary;
}) {
  // The point's name already says it is a pickup point.
  if (choice.method === "pickup" && choice.point)
    return <>{pointText(choice.point, dictionary)}</>;
  return (
    <>
      {dictionary[choice.method === "home" ? "checkoutHome" : "checkoutPickup"]}
    </>
  );
}

/** An order's lines and totals, as the payment page and the confirmation show them. */
export function Summary({
  lines,
  totals,
  code,
  locale,
  dictionary,
}: {
  lines: readonly {
    key: number;
    name: string;
    unitCents: number;
    quantity: number;
  }[];
  totals: CartTotals;
  code: string | null;
  locale: Locale;
  dictionary: Dictionary;
}) {
  const price = (cents: number) => formatPrice(cents, locale);
  return (
    <section aria-labelledby="order-lines-title" className="mt-8">
      <h2 id="order-lines-title" className="text-2xl font-bold">
        {dictionary.paymentLines}
      </h2>
      <ul data-list="order-lines" className="mt-4">
        {lines.map((line) => (
          <li key={line.key} data-order-line={line.key} className="mt-2">
            {fill(dictionary.checkoutLabelValue, {
              label: `${line.name} × ${line.quantity}`,
              value: price(line.unitCents * line.quantity),
            })}
          </li>
        ))}
      </ul>
      <div className="cart-totals mt-4">
        <dl>
          <dt>{dictionary.cartSubtotal}</dt>
          <dd data-order-subtotal>{price(totals.subtotalCents)}</dd>
          {code && totals.discountCents > 0 && (
            <>
              <dt>{fill(dictionary.cartDiscount, { code })}</dt>
              <dd data-order-discount>−{price(totals.discountCents)}</dd>
            </>
          )}
          <dt>{dictionary.cartDelivery}</dt>
          <dd data-order-delivery={totals.deliveryCents}>
            {totals.deliveryCents === 0
              ? dictionary.cartDeliveryFree
              : price(totals.deliveryCents)}
          </dd>
          <dt className="cart-total">{dictionary.cartTotal}</dt>
          <dd className="cart-total" data-order-total={totals.totalCents}>
            {price(totals.totalCents)}
          </dd>
        </dl>
      </div>
    </section>
  );
}

/** A placed order's delivery and summary, from what was stored when it was placed. */
export function PlacedOrder({
  order,
  locale,
  dictionary,
}: {
  order: StoredCheckout & { totals: NonNullable<StoredCheckout["totals"]> };
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <>
      <section aria-labelledby="delivery-title" className="mt-6">
        <h2 id="delivery-title" className="text-2xl font-bold">
          {dictionary.checkoutAddressTitle}
        </h2>
        <p className="mt-2" data-order-address>
          <AddressLines address={order.choice.address} locale={locale} />
        </p>
        <p className="mt-2" data-order-method={order.choice.method}>
          <MethodText choice={order.choice} dictionary={dictionary} />
        </p>
      </section>
      <Summary
        lines={order.lines.map((line) => ({
          key: line.product,
          name: line.name,
          unitCents: line.unitCents,
          quantity: line.quantity,
        }))}
        totals={{ ...order.totals, leftForFreeDeliveryCents: 0 }}
        code={order.totals.promotionCode}
        locale={locale}
        dictionary={dictionary}
      />
    </>
  );
}
