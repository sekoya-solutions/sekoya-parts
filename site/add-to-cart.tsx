// The "Add to cart" forms (issue #168): plain HTML posting to the cart route
// (app/(site)/api/cart/route.ts), the same for every visitor, so the pages
// that show them stay static output. Without JavaScript they lead to the cart
// page; once the page's scripts run, site/cart-forms.tsx sends them and the
// visitor stays on the page.
import type { Locale } from "../cms/locales.ts";
import { MAX_QUANTITY } from "./cart.ts";
import { CART_FORM_ATTRIBUTE } from "./cart-status.ts";
import { getDictionary } from "./dictionary.ts";

/** Where every cart form posts. */
export const CART_ROUTE = "/api/cart";

const marker = { [CART_FORM_ATTRIBUTE]: "" };

/** The product page's form: a quantity, then the button. */
export function AddToCartForm({ id, locale }: { id: number; locale: Locale }) {
  const dictionary = getDictionary(locale);
  return (
    <form
      method="post"
      action={CART_ROUTE}
      className="add-to-cart mt-4"
      {...marker}
    >
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="intent" value="add" />
      <input type="hidden" name="product" value={id} />
      <label>
        <span>{dictionary.cartQuantity}</span>
        <input
          name="quantity"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_QUANTITY}
          defaultValue={1}
          required
          className="min-h-11 w-20 rounded-md border border-slate px-3"
        />
      </label>
      <button type="submit" className="cart-button">
        {dictionary.addToCart}
      </button>
    </form>
  );
}

/** A product card's form: one item, with the product's name for screen readers. */
export function CardAddToCart({
  id,
  name,
  locale,
}: {
  id: number;
  name: string;
  locale: Locale;
}) {
  return (
    <form method="post" action={CART_ROUTE} className="card-cart" {...marker}>
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="intent" value="add" />
      <input type="hidden" name="product" value={id} />
      <input type="hidden" name="quantity" value="1" />
      <button type="submit" className="cart-button">
        {getDictionary(locale).addToCart}
        <span className="sr-only">: {name}</span>
      </button>
    </form>
  );
}
