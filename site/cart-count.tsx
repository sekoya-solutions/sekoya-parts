"use client";
// The header's cart count (issue #168, docs/adr/0013-visitor-state.md, option
// B): read in the browser from the cart cookie, so every catalog page stays
// the same static output for everyone. The server renders an empty space of
// a fixed width; without JavaScript, or with an empty cart, it stays empty.
//
// The count is read again when a form of site/cart-forms.tsx changed the
// cart, when the page comes back from the browser's back-forward cache, and
// when the tab becomes visible again, since another tab may have changed it.
import { useEffect, useState } from "react";
import { cartCookieValue, cartCount, parseCart } from "./cart.ts";
import { CART_CHANGE_EVENT } from "./cart-status.ts";

const readCount = (): number =>
  cartCount(parseCart(cartCookieValue(document.cookie)));

export function CartCount({ label }: { label: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => setCount(readCount());
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    update();
    window.addEventListener(CART_CHANGE_EVENT, update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(CART_CHANGE_EVENT, update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <span data-cart-count={count} className="cart-count">
      {count > 0 && (
        <>
          <span aria-hidden="true">{count}</span>
          <span className="sr-only">
            {label.replace("{count}", String(count))}
          </span>
        </>
      )}
    </span>
  );
}
