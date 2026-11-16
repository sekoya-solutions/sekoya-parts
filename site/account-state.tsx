"use client";
// Whether the visitor is signed in, beside the header's account link (issue
// #177, docs/adr/0013-visitor-state.md, option B): read in the browser from
// the account_v1 cookie, which the account route sets and clears with
// Payload's session cookie, so every catalog page stays the same static
// output for everyone. The server renders an empty space of a fixed width;
// without JavaScript, or signed out, it stays empty.
//
// It is read again when the page comes back from the browser's back-forward
// cache and when the tab becomes visible again, since another tab may have
// signed in or out. The cookie only says a session was opened: the account
// pages ask Payload, which knows whether it is still valid.
import { useEffect, useState } from "react";
import { signedInFromCookies } from "./account-rules.ts";

export function AccountState({ label }: { label: string }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const update = () => setSignedIn(signedInFromCookies(document.cookie));
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    update();
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <span
      data-account-state={signedIn ? "signed-in" : ""}
      className="account-state"
    >
      {signedIn && (
        <>
          <span aria-hidden="true" className="account-dot" />
          <span className="sr-only">{label}</span>
        </>
      )}
    </span>
  );
}
