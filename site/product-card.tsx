// A product's price as visitors see it (issue #151): the current price, and
// during a sale the former price struck through and the discount badge. The
// current price stays the only <span> directly in a card, which the tests and
// the card styles read; the former price is an <s> and the badge a <mark>.
import type { Locale } from "../cms/locales.ts";
import { getDictionary } from "./dictionary.ts";
import { discountLabel } from "./merchandising.ts";
import { ProductCardImage } from "./picture.tsx";
import { formatPrice, type ProductRoute } from "./product.tsx";

/** The price shown at a moment: current, and former during a sale. */
export type ShownPrice = { cents: number; formerCents: number | null };

/** The current price, then during a sale the former price and the badge. */
export function Price({
  price,
  locale,
}: {
  price: ShownPrice;
  locale: Locale;
}) {
  const { cents, formerCents } = price;
  return (
    <>
      <span>{formatPrice(cents, locale)}</span>
      {formerCents !== null && (
        <>
          {" "}
          <s>
            <span className="sr-only">
              {getDictionary(locale).formerPrice}{" "}
            </span>
            {formatPrice(formerCents, locale)}
          </s>{" "}
          <mark>{discountLabel(locale, cents, formerCents)}</mark>
        </>
      )}
    </>
  );
}

/** A product card: image, name and price, as in every product list. */
export function ProductCard({
  route,
  price,
  locale,
  index,
  lazy,
}: {
  route: ProductRoute;
  price: ShownPrice;
  locale: Locale;
  index: number;
  lazy?: boolean;
}) {
  return (
    <li>
      <ProductCardImage
        route={route}
        locale={locale}
        index={index}
        lazy={lazy}
      />
      <a href={route.paths[locale]}>{route.names[locale]}</a>{" "}
      <Price price={price} locale={locale} />
    </li>
  );
}
