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
// visitor back here, so the page needs no browser code of its own.
import config from "@payload-config";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getPayload } from "payload";
import type { Locale } from "../cms/locales.ts";
import type { Product } from "../cms/payload-types.ts";
import { CART_ROUTE } from "./add-to-cart.tsx";
import { cartPath, categoryPath, perLocale } from "./addresses.ts";
import { CART_COOKIE, type CartLine, MAX_QUANTITY, parseCart } from "./cart.ts";
import {
  CART_NOTICE_PARAM,
  type CartRefusalStatus,
  isCartRefusal,
} from "./cart-status.ts";
import { getCategories } from "./categories.tsx";
import { type Dictionary, getDictionary } from "./dictionary.ts";
import { SiteFrame } from "./frame.tsx";
import {
  type Availability,
  availabilityKey,
  priceAt,
} from "./merchandising.ts";
import { ProductCardImage } from "./picture.tsx";
import { formatPrice, type ProductRoute, readProduct } from "./product.tsx";
import { Price } from "./product-card.tsx";

export const cartMetadata = (locale: Locale): Metadata => ({
  title: `${getDictionary(locale).cartTitle} | Sekoya Parts`,
  robots: { index: false },
});

/** A cart line as the page shows it, with what the catalog says now. */
export type ShownLine = {
  route: ProductRoute;
  quantity: number;
  cents: number;
  formerCents: number | null;
  availability: Availability;
};

/** Whether a line can be ordered, and so counts in the subtotal. */
export const counted = (line: Pick<ShownLine, "availability">): boolean =>
  line.availability !== "out-of-stock";

/** The subtotal of the lines that can be ordered, in cents. */
export const subtotalCents = (lines: readonly ShownLine[]): number =>
  lines
    .filter(counted)
    .reduce((sum, line) => sum + line.cents * line.quantity, 0);

/**
 * The cart's lines with the catalog's data, in the cart's order. A product
 * no longer in the catalog is left out.
 */
async function readLines(cart: readonly CartLine[]): Promise<ShownLine[]> {
  if (cart.length === 0) return [];
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "products",
    where: { id: { in: cart.map((line) => line.id) } },
    locale: "all",
    depth: 1,
    limit: cart.length,
    pagination: false,
  });
  const byId = new Map<number, Product>(docs.map((doc) => [doc.id, doc]));
  const now = Date.now();
  return cart.flatMap((line) => {
    const product = byId.get(line.id);
    if (!product) return [];
    const { cents, formerCents } = priceAt(product, now);
    return [
      {
        route: readProduct(product).route,
        quantity: line.quantity,
        cents,
        formerCents,
        availability: product.availability,
      },
    ];
  });
}

const refusalText = (dictionary: Dictionary, notice: CartRefusalStatus) =>
  notice === "full"
    ? dictionary.cartFull
    : notice === "unavailable"
      ? dictionary.cartUnavailable
      : dictionary.cartError;

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
  const lines = await readLines(parseCart(store.get(CART_COOKIE)?.value));

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
          <p className="mt-6 text-xl">
            {dictionary.cartSubtotal}:{" "}
            <strong data-cart-subtotal>
              {formatPrice(subtotalCents(lines), locale)}
            </strong>
          </p>
        </>
      )}
    </div>
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
