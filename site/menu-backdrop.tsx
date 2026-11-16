"use client";
// The phone menu's backdrop and its keyboard and pointer behaviour (issue
// #181). The menu itself is a native <details> element (site/frame.tsx), so
// it opens and closes without any script; once this component's script runs,
// the menu also closes:
//
// - on Escape, giving focus back to its button;
// - on a tap on the backdrop, the dimmed page beside it;
// - when focus leaves it, so a keyboard user never tabs on behind it;
// - when the page comes back from the back-forward cache, which would
//   otherwise show it still open after a link of the menu was followed.
//
// The backdrop sits inside the <details> element, so the browser shows it
// only while the menu is open.
import { useEffect, useRef } from "react";

export function MenuBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const menu = ref.current?.closest("details");
    if (!menu) return;
    const close = (focusButton: boolean) => {
      if (!menu.open) return;
      menu.open = false;
      if (focusButton) menu.querySelector("summary")?.focus();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.open) {
        event.preventDefault();
        close(true);
      }
    };
    const onFocusOut = (event: FocusEvent) => {
      // relatedTarget is null when focus leaves the page or the window,
      // which is no reason to close the menu.
      const next = event.relatedTarget;
      if (next instanceof Node && !menu.contains(next)) close(false);
    };
    const onBackdrop = () => close(true);
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) close(false);
    };
    const backdrop = ref.current;
    document.addEventListener("keydown", onKey);
    menu.addEventListener("focusout", onFocusOut);
    backdrop?.addEventListener("click", onBackdrop);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("keydown", onKey);
      menu.removeEventListener("focusout", onFocusOut);
      backdrop?.removeEventListener("click", onBackdrop);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return <div ref={ref} aria-hidden="true" className="mobile-menu-backdrop" />;
}
