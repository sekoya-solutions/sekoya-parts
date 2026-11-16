"use client";
// "Add to cart" without leaving the page (issue #168, owner decision of
// 2026-11-16). Every add form of the site is plain HTML posting to
// /api/cart, which leads to the cart page when the page's JavaScript has not
// run. Once it runs, this one component, in the layout, catches the submit
// of any form marked data-cart-form, sends it with fetch and shows the
// answer in a notice, so the cards and the product page need no browser code
// of their own.
//
// Submits are sent one after another, never together: each request reads the
// cookie the previous one wrote, so no addition is lost. When a request
// fails, the notice says so and nothing is sent again: the route may have
// made the change already, and sending it twice would add the part twice.
import { useEffect, useRef, useState } from "react";
import {
  CART_CHANGE_EVENT,
  CART_FORM_ATTRIBUTE,
  type CartStatus,
} from "./cart-status.ts";

export type CartFormLabels = {
  cartAdded: string;
  cartViewCart: string;
  cartFull: string;
  cartUnavailable: string;
  cartClose: string;
  cartError: string;
};

type Notice = { status: CartStatus | "error"; key: number } | null;

export function CartForms({
  cartPath,
  labels,
}: {
  cartPath: string;
  labels: CartFormLabels;
}) {
  const [notice, setNotice] = useState<Notice>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let key = 0;
    const show = (status: CartStatus | "error") => {
      key += 1;
      setNotice({ status, key });
    };
    async function send(form: HTMLFormElement, submitter: HTMLElement | null) {
      const body = new FormData(form, submitter);
      const response = await fetch(form.action, {
        method: "POST",
        body,
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!response.ok && response.status !== 400)
        throw new Error(`Cart route: ${response.status}`);
      const answer = (await response.json()) as { status: CartStatus };
      window.dispatchEvent(new Event(CART_CHANGE_EVENT));
      show(answer.status);
    }

    function onSubmit(event: SubmitEvent) {
      const form = event.target;
      if (
        !(form instanceof HTMLFormElement) ||
        !form.hasAttribute(CART_FORM_ATTRIBUTE)
      )
        return;
      event.preventDefault();
      const submitter = event.submitter;
      queue.current = queue.current.then(() =>
        send(form, submitter).catch(() => {
          // The count is read again: the change may have been made.
          window.dispatchEvent(new Event(CART_CHANGE_EVENT));
          show("error");
        }),
      );
    }

    document.addEventListener("submit", onSubmit);
    return () => document.removeEventListener("submit", onSubmit);
  }, []);

  const message =
    notice?.status === "added"
      ? labels.cartAdded
      : notice?.status === "full"
        ? labels.cartFull
        : notice?.status === "unavailable"
          ? labels.cartUnavailable
          : notice?.status === "invalid" || notice?.status === "error"
            ? labels.cartError
            : null;

  return (
    // Always in the page, so a screen reader announces what appears in it.
    <div
      role="status"
      data-cart-notice={notice?.status ?? ""}
      className="cart-notice"
    >
      {message && notice && (
        <p key={notice.key}>
          {message}{" "}
          {(notice.status === "added" || notice.status === "full") && (
            <a href={cartPath}>{labels.cartViewCart}</a>
          )}{" "}
          <button type="button" onClick={() => setNotice(null)}>
            {labels.cartClose}
          </button>
        </p>
      )}
    </div>
  );
}
