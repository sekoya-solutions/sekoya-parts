"use client";
// Closing a desktop menu group (issue #198). Each group is a native <details>
// element (site/frame.tsx), so it opens and closes without any script, and
// the groups share a name, so opening one closes the others. Once this
// component's script runs, an open group also closes:
//
// - on Escape, giving focus back to its button;
// - on a click or a tap outside it;
// - when focus leaves it, so a keyboard user never tabs on behind its panel;
// - when the page comes back from the back-forward cache, which would
//   otherwise show it still open after one of its links was followed.
import { useEffect, useRef } from "react";

export function MenuCloser() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const group = ref.current?.closest("details");
    if (!group) return;
    const close = (focusButton: boolean) => {
      if (!group.open) return;
      group.open = false;
      if (focusButton) group.querySelector("summary")?.focus();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && group.open) {
        event.preventDefault();
        close(true);
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !group.contains(event.target))
        close(false);
    };
    const onFocusOut = (event: FocusEvent) => {
      // relatedTarget is null when focus leaves the page or the window,
      // which is no reason to close the group.
      const next = event.relatedTarget;
      if (next instanceof Node && !group.contains(next)) close(false);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    group.addEventListener("focusout", onFocusOut);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      group.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return <span ref={ref} hidden />;
}
