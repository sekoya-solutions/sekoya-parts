// The cart page (issue #168), at /<lang>/<cart word>: the lines of the
// visitor's cart cookie, read with each product's name, price and
// availability from the catalog, never from the cookie
// (docs/adr/0013-visitor-state.md). The page reads the request outside any
// <Suspense> boundary, on each visit, so its HTML comes complete: content
// behind a boundary is streamed in by a script, which a visitor without
// JavaScript never runs (issue #168). The route allows it, as for the search
// page. Kept out of search engines' indexes and of the sitemap; robots.txt
// already disallows it (site/crawl.ts).
//
// Every change is a plain form posting to the cart route, which sends the
// visitor back here, so the page needs no browser code of its own. Below the
// lines (issue #169): the subtotal, a promotion code's discount, delivery
// with what is left for free delivery, and the total, all computed here from
// the catalog and Payload's values (site/cart-pricing.ts), then "Complete
// your repair" suggestions from the lines' related products.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { Locale } from "../cms/locales.ts";
import { CART_ROUTE } from "./add-to-cart.tsx";
import { cartPath, categoryPath, perLocale } from "./addresses.ts";
import { CART_COOKIE, MAX_QUANTITY, PROMO_COOKIE, parseCart } from "./cart.ts";
import {
  counted,
  readCode,
  readDelivery,
  readLines,
  readSuggestions,
  type ShownLine,
  type Suggestion,
  subtotalCents,
} from "./cart-lines.ts";
import {
  type CartTotals,
  CODE_LENGTH,
  type CodeRefusal,
  cartTotals,
  codeRefusal,
  normalizeCode,
  type PromotionCode,
} from "./cart-pricing.ts";
import {
  CART_NOTICE_PARAM,
  type CartRefusalStatus,
  isCartRefusal,
} from "./cart-status.ts";
import { getCategories } from "./categories.tsx";
import { type Dictionary, fill, getDictionary } from "./dictionary.ts";
import { SiteFrame } from "./frame.tsx";
import { availabilityKey } from "./merchandising.ts";
import { ProductCardImage } from "./picture.tsx";
import { formatPrice } from "./product.tsx";
import { Price, ProductCard } from "./product-card.tsx";

export const cartMetadata = (locale: Locale): Metadata => ({
  title: `${getDictionary(locale).cartTitle} | Sekoya Parts`,
  robots: { index: false },
});

const codeRefusalText = (dictionary: Dictionary, refusal: CodeRefusal) =>
  refusal === "expired"
    ? dictionary.cartCodeExpired
    : refusal === "minimum"
      ? dictionary.cartCodeMinimum
      : dictionary.cartCodeUnknown;

function refusalText(dictionary: Dictionary, notice: CartRefusalStatus) {
  switch (notice) {
    case "full":
      return dictionary.cartFull;
    case "unavailable":
      return dictionary.cartUnavailable;
    case "code-unknown":
      return codeRefusalText(dictionary, "unknown");
    case "code-expired":
      return codeRefusalText(dictionary, "expired");
    case "code-minimum":
      return codeRefusalText(dictionary, "minimum");
    default:
      return dictionary.cartError;
  }
}

/** The code the demo invites visitors to try, shown only while it applies. */
const DEMO_CODE = "DEMO10";

function LineForms({
  line,
  locale,
  dictionary,
}: {
  line: ShownLine;
  locale: Locale;
  dictionary: Dictionary;
}) {
  const name = line.route.names[locale];
  const inputId = `quantity-${line.route.id}`;
  return (
    <div>
      <form method="post" action={CART_ROUTE}>
        <input type="hidden" name="lang" value={locale} />
        <input type="hidden" name="intent" value="set" />
        <input type="hidden" name="product" value={line.route.id} />
        <label htmlFor={inputId} className="sr-only">
          {dictionary.cartQuantity}: {name}
        </label>
        <input
          id={inputId}
          name="quantity"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_QUANTITY}
          defaultValue={line.quantity}
          required
        />
        <button type="submit">
          {dictionary.cartUpdate}
          <span className="sr-only">: {name}</span>
        </button>
      </form>
      <form method="post" action={CART_ROUTE}>
        <input type="hidden" name="lang" value={locale} />
        <input type="hidden" name="intent" value="remove" />
        <input type="hidden" name="product" value={line.route.id} />
        <button type="submit">
          {dictionary.cartRemove}
          <span className="sr-only">: {name}</span>
        </button>
      </form>
    </div>
  );
}

async function CartContents({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const dictionary = getDictionary(locale);
  const [store, query] = await Promise.all([cookies(), searchParams]);
  const notice = query[CART_NOTICE_PARAM];
  const cart = parseCart(store.get(CART_COOKIE)?.value);
  const applied = normalizeCode(store.get(PROMO_COOKIE)?.value);
  const [lines, delivery, code, demo, suggestions] = await Promise.all([
    readLines(cart),
    readDelivery(),
    applied ? readCode(applied) : null,
    readCode(DEMO_CODE),
    readSuggestions(cart),
  ]);
  const now = Date.now();
  const subtotal = subtotalCents(lines);
  // The applied code is checked again on each visit: it may have ended, or
  // the subtotal dropped below its minimum, since it was applied.
  const refusal = applied ? codeRefusal(code, subtotal, now) : null;
  const totals = cartTotals(subtotal, refusal ? null : code, delivery);
  const demoCode =
    demo && !applied && codeRefusal(demo, subtotal, now) === null
      ? demo.code
      : null;

  return (
    <div data-cart={lines.length > 0 ? "lines" : "empty"}>
      {isCartRefusal(notice) && (
        <p role="alert" data-cart-refusal={notice} className="mt-4 font-bold">
          {refusalText(dictionary, notice)}
        </p>
      )}
      {lines.length === 0 ? (
        <EmptyCart locale={locale} dictionary={dictionary} />
      ) : (
        <>
          <ul data-list="cart" className="cart-lines mt-6">
            {lines.map((line, index) => (
              <li key={line.route.id} data-cart-line={line.route.id}>
                <ProductCardImage
                  route={line.route}
                  locale={locale}
                  index={index}
                />
                <div>
                  <a href={line.route.paths[locale]} className="font-bold">
                    {line.route.names[locale]}
                  </a>
                  <p className="mt-1">
                    {dictionary.cartUnitPrice}:{" "}
                    <Price
                      price={{
                        cents: line.cents,
                        formerCents: line.formerCents,
                      }}
                      locale={locale}
                    />
                  </p>
                  <p data-availability={line.availability} className="mt-1">
                    {counted(line)
                      ? dictionary[availabilityKey(line.availability)]
                      : dictionary.cartNotCounted}
                  </p>
                  <p className="mt-1">
                    {dictionary.cartLineTotal}:{" "}
                    <strong data-line-total>
                      {formatPrice(line.cents * line.quantity, locale)}
                    </strong>
                  </p>
                  <div className="mt-2">
                    <LineForms
                      line={line}
                      locale={locale}
                      dictionary={dictionary}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Totals
            totals={totals}
            code={refusal ? null : code}
            locale={locale}
            dictionary={dictionary}
          />
          <CodeForm
            applied={applied}
            refusal={refusal}
            demoCode={demoCode}
            locale={locale}
            dictionary={dictionary}
          />
          <Suggestions
            suggestions={suggestions}
            locale={locale}
            dictionary={dictionary}
          />
        </>
      )}
    </div>
  );
}

function Totals({
  totals,
  code,
  locale,
  dictionary,
}: {
  totals: CartTotals;
  code: PromotionCode | null;
  locale: Locale;
  dictionary: Dictionary;
}) {
  const price = (cents: number) => formatPrice(cents, locale);
  return (
    <section aria-labelledby="cart-totals-title" className="cart-totals mt-6">
      <h2 id="cart-totals-title" className="sr-only">
        {dictionary.cartSummary}
      </h2>
      <dl>
        <dt>{dictionary.cartSubtotal}</dt>
        <dd data-cart-subtotal>{price(totals.subtotalCents)}</dd>
        {code && totals.discountCents > 0 && (
          <>
            <dt>{fill(dictionary.cartDiscount, { code: code.code })}</dt>
            <dd data-cart-discount>−{price(totals.discountCents)}</dd>
          </>
        )}
        <dt>{dictionary.cartDelivery}</dt>
        <dd data-cart-delivery={totals.deliveryCents}>
          {totals.deliveryCents === 0
            ? dictionary.cartDeliveryFree
            : price(totals.deliveryCents)}
        </dd>
        <dt className="cart-total">{dictionary.cartTotal}</dt>
        <dd className="cart-total" data-cart-total>
          {price(totals.totalCents)}
        </dd>
      </dl>
      {totals.subtotalCents > 0 && (
        <p
          data-free-delivery-left={totals.leftForFreeDeliveryCents}
          className="mt-2"
        >
          {totals.leftForFreeDeliveryCents > 0
            ? fill(dictionary.cartFreeDeliveryLeft, {
                amount: price(totals.leftForFreeDeliveryCents),
              })
            : dictionary.cartFreeDeliveryReached}
        </p>
      )}
    </section>
  );
}

function CodeForm({
  applied,
  refusal,
  demoCode,
  locale,
  dictionary,
}: {
  applied: string | null;
  refusal: CodeRefusal | null;
  demoCode: string | null;
  locale: Locale;
  dictionary: Dictionary;
}) {
  if (applied)
    return (
      <div data-cart-code={applied} className="cart-code mt-4">
        <p data-code-refusal={refusal ?? ""}>
          {refusal
            ? `${fill(dictionary.cartCodeNotApplied, { code: applied })} ${codeRefusalText(dictionary, refusal)}`
            : fill(dictionary.cartCodeApplied, { code: applied })}
        </p>
        <form method="post" action={CART_ROUTE}>
          <input type="hidden" name="lang" value={locale} />
          <input type="hidden" name="intent" value="code-remove" />
          <button type="submit">{dictionary.cartCodeRemove}</button>
        </form>
      </div>
    );
  return (
    <form method="post" action={CART_ROUTE} className="cart-code mt-4">
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="intent" value="code" />
      <label htmlFor="cart-code">{dictionary.cartCodeLabel}</label>
      <input
        id="cart-code"
        name="code"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={CODE_LENGTH}
        required
      />
      <button type="submit">{dictionary.cartCodeApply}</button>
      {demoCode && (
        <p data-demo-code className="w-full text-slate">
          {fill(dictionary.cartCodeHint, { code: demoCode })}
        </p>
      )}
    </form>
  );
}

function Suggestions({
  suggestions,
  locale,
  dictionary,
}: {
  suggestions: readonly Suggestion[];
  locale: Locale;
  dictionary: Dictionary;
}) {
  if (suggestions.length === 0) return null;
  return (
    <section aria-labelledby="suggestions-title" className="mt-10">
      <h2 id="suggestions-title" className="mb-4 text-2xl font-bold">
        {dictionary.cartSuggestions}
      </h2>
      <ul data-list="suggestions" className="product-list">
        {suggestions.map(({ route, price }, index) => (
          <ProductCard
            key={route.id}
            route={route}
            price={price}
            locale={locale}
            index={index}
            lazy
            plainPost
          />
        ))}
      </ul>
    </section>
  );
}

async function EmptyCart({
  locale,
  dictionary,
}: {
  locale: Locale;
  dictionary: Dictionary;
}) {
  const categories = [...(await getCategories())].sort((a, b) =>
    a.names[locale].localeCompare(b.names[locale], locale),
  );
  return (
    <>
      <p className="mt-6 text-lg">{dictionary.cartEmpty}</p>
      <h2 className="mt-6 text-xl font-bold">{dictionary.cartBrowse}</h2>
      <ul data-list="categories" className="brand-list mt-2">
        {categories.map((category) => (
          <li key={category.id}>
            <a href={categoryPath(locale, category.slugs[locale])}>
              {category.names[locale]}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

export function CartPage({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const dictionary = getDictionary(locale);
  return (
    <SiteFrame
      locale={locale}
      template="cart"
      paths={perLocale((other) => cartPath(other))}
    >
      <h1 className="text-3xl font-bold sm:text-4xl">{dictionary.cartTitle}</h1>
      <p data-demo-notice className="mt-2 text-slate">
        {dictionary.cartDemo}
      </p>
      <CartContents locale={locale} searchParams={searchParams} />
    </SiteFrame>
  );
}
