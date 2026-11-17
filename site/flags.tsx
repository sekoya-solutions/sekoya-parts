// The ten languages' flags, beside each language in the language switch and
// the phone menu (issue #191, docs/adr/0011-languages-and-seo.md). Drawn here
// as small inline SVG, simplified to read at 20 pixels: Spain and Portugal
// without their coats of arms, Portugal's armillary sphere as a ring, and
// the United Kingdom's flag, which stands for English, with centred red
// diagonals. Windows draws no flag emoji, so emoji would show two letters.
// Each flag is decorative: the language's name beside it carries the
// meaning, so it is hidden from screen readers. Inline, it costs no request,
// and its fixed size shifts nothing as the page loads.
import type { ReactNode } from "react";
import type { Locale } from "../cms/locales.ts";

/** Every flag is drawn on a 60 by 40 box, the 3:2 shape of most of them. */
const W = 60;
const H = 40;

const vertical = (colors: [string, string, string]) =>
  colors.map((fill, i) => (
    <rect key={fill} x={(i * W) / 3} width={W / 3} height={H} fill={fill} />
  ));

/** Horizontal bands, each `[colour, share of the height]`, top first. */
const horizontal = (bands: [string, number][]) => {
  const total = bands.reduce((sum, [, share]) => sum + share, 0);
  let top = 0;
  return bands.map(([fill, share]) => {
    const y = (top * H) / total;
    top += share;
    return (
      <rect key={y} y={y} width={W} height={(share * H) / total} fill={fill} />
    );
  });
};

/** A Nordic cross, its upright bar set towards the hoist. */
const nordic = (field: string, cross: string, x: number, bar: number) => (
  <>
    <rect width={W} height={H} fill={field} />
    <rect x={x} width={bar} height={H} fill={cross} />
    <rect y={(H - bar) / 2} width={W} height={bar} fill={cross} />
  </>
);

const FLAGS: Record<Locale, ReactNode> = {
  fr: vertical(["#002395", "#ffffff", "#ed2939"]),
  en: (
    <>
      <rect width={W} height={H} fill="#012169" />
      <path
        d={`M0 0L${W} ${H}M${W} 0L0 ${H}`}
        stroke="#ffffff"
        strokeWidth="8"
      />
      <path
        d={`M0 0L${W} ${H}M${W} 0L0 ${H}`}
        stroke="#c8102e"
        strokeWidth="3"
      />
      <path
        d={`M${W / 2} 0V${H}M0 ${H / 2}H${W}`}
        stroke="#ffffff"
        strokeWidth="12"
      />
      <path
        d={`M${W / 2} 0V${H}M0 ${H / 2}H${W}`}
        stroke="#c8102e"
        strokeWidth="7"
      />
    </>
  ),
  de: horizontal([
    ["#000000", 1],
    ["#dd0000", 1],
    ["#ffce00", 1],
  ]),
  es: horizontal([
    ["#aa151b", 1],
    ["#f1bf00", 2],
    ["#aa151b", 1],
  ]),
  it: vertical(["#009246", "#ffffff", "#ce2b37"]),
  nl: horizontal([
    ["#ae1c28", 1],
    ["#ffffff", 1],
    ["#21468b", 1],
  ]),
  pt: (
    <>
      <rect width={W} height={H} fill="#da291c" />
      <rect width={24} height={H} fill="#046a38" />
      <circle
        cx={24}
        cy={20}
        r={8}
        fill="none"
        stroke="#ffe900"
        strokeWidth="2.5"
      />
      <path
        d="M20.5 15h7v6a3.5 3.5 0 0 1-7 0z"
        fill="#ffffff"
        stroke="#da291c"
        strokeWidth="1.5"
      />
    </>
  ),
  pl: horizontal([
    ["#ffffff", 1],
    ["#dc143c", 1],
  ]),
  sv: nordic("#006aa7", "#fecc02", 18.75, 7.5),
  da: nordic("#c8102e", "#ffffff", 16.5, 6),
};

/** A language's flag, 21 by 14 pixels at the default text size, hidden from screen readers. */
export function Flag({ locale }: { locale: Locale }) {
  return (
    <svg
      data-flag={locale}
      viewBox={`0 0 ${W} ${H}`}
      width="21"
      height="14"
      aria-hidden="true"
      focusable="false"
      className="inline-block h-3.5 w-[1.3125rem] shrink-0 rounded-[2px] ring-1 ring-white/30"
    >
      {FLAGS[locale]}
    </svg>
  );
}
