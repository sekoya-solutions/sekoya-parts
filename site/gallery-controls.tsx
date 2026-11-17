"use client";
// The product gallery's arrows, and its thumbnails' behaviour (issue #200).
// The strip is a CSS scroll-snap list (site/product-gallery.tsx), so swiping
// works without any script. Once this component's script runs:
//
// - the arrows show the previous or next picture, going round from the last
//   to the first, so neither is ever disabled under the visitor's focus;
// - a thumbnail shows its picture;
// - the current thumbnail is marked whatever moved the strip, read from the
//   strip's scroll position;
// - an arrow pressed again while the strip is still sliding counts from the
//   picture it is heading to, not from where the slide has got to, so two
//   quick presses move two pictures. That target is forgotten once the strip
//   reaches it, or as soon as the visitor scrolls the strip themselves.
//
// The strip scrolls smoothly only for visitors who have not asked for
// reduced motion (site/site.css).
import { useEffect, useRef } from "react";

/** The picture the strip shows: the one its scroll position is nearest to. */
const shownIndex = (strip: HTMLElement): number => {
  const count = strip.children.length;
  if (count === 0 || strip.clientWidth === 0) return 0;
  const i = Math.round(strip.scrollLeft / strip.clientWidth);
  return Math.min(count - 1, Math.max(0, i));
};

/** The strip's own element, from any element of its gallery. */
const stripOf = (element: Element | null) =>
  element
    ?.closest("[data-gallery]")
    ?.querySelector<HTMLElement>(".gallery-strip") ?? null;

/** Sends the strip to a picture, going round, and remembers it as the target. */
function show(
  list: HTMLElement,
  target: { current: number | null },
  index: number,
) {
  const count = list.children.length;
  if (count === 0) return;
  const i = ((index % count) + count) % count;
  target.current = i;
  list.scrollTo({ left: i * list.clientWidth });
}

export function GalleryControls({
  previous,
  next,
}: {
  previous: string;
  next: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  /** The picture an arrow or a thumbnail last sent the strip to, until it gets there. */
  const target = useRef<number | null>(null);

  const move = (step: number) => {
    const list = stripOf(ref.current);
    if (list) show(list, target, (target.current ?? shownIndex(list)) + step);
  };

  useEffect(() => {
    const gallery = ref.current?.closest<HTMLElement>("[data-gallery]");
    const list = stripOf(ref.current);
    if (!gallery || !list) return;
    const thumbs = [
      ...gallery.querySelectorAll<HTMLButtonElement>("[data-thumb]"),
    ];
    const onScroll = () => {
      const shown = shownIndex(list);
      if (
        target.current === shown &&
        Math.abs(list.scrollLeft - shown * list.clientWidth) < 1
      )
        target.current = null;
      thumbs.forEach((thumb, i) => {
        if (i === shown) thumb.setAttribute("aria-current", "true");
        else thumb.removeAttribute("aria-current");
      });
    };
    // The visitor takes the strip over: by touch, mouse, wheel or keyboard.
    const forget = () => {
      target.current = null;
    };
    const onClick = (event: MouseEvent) => {
      const thumb = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-thumb]",
      );
      if (thumb && gallery.contains(thumb))
        show(list, target, Number(thumb.dataset.thumb));
    };
    const taken = ["pointerdown", "wheel", "keydown"] as const;
    list.addEventListener("scroll", onScroll, { passive: true });
    for (const type of taken)
      list.addEventListener(type, forget, { passive: true });
    gallery.addEventListener("click", onClick);
    // The page may come back from the back-forward cache, or the browser
    // may restore a scroll position: mark what is shown now.
    onScroll();
    return () => {
      list.removeEventListener("scroll", onScroll);
      for (const type of taken) list.removeEventListener(type, forget);
      gallery.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={previous}
        data-direction="previous"
        className="gallery-arrow"
        onClick={() => move(-1)}
      >
        <Chevron d="M15 5l-7 7 7 7" />
      </button>
      <button
        type="button"
        aria-label={next}
        data-direction="next"
        className="gallery-arrow"
        onClick={() => move(1)}
      >
        <Chevron d="M9 5l7 7-7 7" />
      </button>
    </>
  );
}

/** An arrow's chevron, in the text's own colour; decorative. */
function Chevron({ d }: { d: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
