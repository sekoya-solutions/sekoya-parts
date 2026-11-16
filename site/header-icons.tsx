// The header's account and cart icons (issue #177, owner decision of
// 2026-11-16): on a phone, the two links show these instead of their names,
// to save room in the header's row. Drawn here as
// inline SVG, in the text's own colour (currentColor) with round line ends
// like the wordmark's rounded letters, so no image is requested. Decorative:
// each link keeps its name for screen readers.

const ICON = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  focusable: false,
  className: "header-icon",
} as const;

/** A head and shoulders. */
export function AccountIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5" />
    </svg>
  );
}

/** A shopping bag, with its handle. */
export function CartIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <path d="M5.5 8h13l-1.2 12.5H6.7L5.5 8z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </svg>
  );
}

/** Three lines, for the phone menu's button (issue #181). */
export function MenuIcon() {
  return (
    <svg {...ICON} width={24} height={24} aria-hidden="true">
      <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />
    </svg>
  );
}

/** A cross, for the phone menu's button once the menu is open. */
export function CloseIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
