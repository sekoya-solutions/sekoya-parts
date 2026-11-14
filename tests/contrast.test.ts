// Colour contrast (issue #83, docs/specs/design-system.md): every text pairing
// the site uses meets the Web Content Accessibility Guidelines (WCAG) 2.2 AA
// ratio of 4.5:1, and form field borders and focus rings 3:1. The colours are
// read from the stylesheet's theme, so a changed token is checked here.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../site/site.css", import.meta.url), "utf8");

/** The theme's colours, by token name, from `--color-<name>: #rrggbb;`. */
const colours = Object.fromEntries(
  [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6});/gi)].map((match) => [
    match[1] as string,
    (match[2] as string).toLowerCase(),
  ]),
);

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two #rrggbb colours, from 1 to 21. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

const colour = (token: string): string => {
  const value = colours[token];
  if (!value) throw new Error(`No --color-${token} in site/site.css.`);
  return value;
};

// [foreground, background]: text the site sets on that background.
const TEXT_PAIRS: [string, string][] = [
  ["navy", "white"],
  ["navy", "sand"],
  ["slate", "white"],
  ["slate", "sand"],
  ["action", "white"],
  ["action", "sand"],
  ["action-hover", "white"],
  ["action-hover", "sand"],
  ["white", "action"],
  ["white", "action-hover"],
  ["cream", "navy"],
  ["mist", "navy"],
  ["leaf", "navy"],
  ["white", "navy"],
];

// [element, background]: focus rings and form field borders.
const NON_TEXT_PAIRS: [string, string][] = [
  ["action", "white"],
  ["action", "sand"],
  ["leaf", "navy"],
  ["slate", "white"],
  // The search field on the navy header (issue #113).
  ["white", "navy"],
];

describe("theme colours", () => {
  it("reads the palette from the stylesheet", () => {
    expect(Object.keys(colours).sort()).toEqual(
      [
        "action",
        "action-hover",
        "cream",
        "leaf",
        "line",
        "mist",
        "navy",
        "sand",
        "slate",
        "white",
      ].sort(),
    );
  });

  it("computes WCAG ratios", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrast("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it.each(TEXT_PAIRS)("%s text on %s reaches 4.5:1", (fg, bg) => {
    expect(contrast(colour(fg), colour(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)("%s on %s reaches 3:1", (fg, bg) => {
    expect(contrast(colour(fg), colour(bg))).toBeGreaterThanOrEqual(3);
  });

  it("refuses the leaf green as text on white", () => {
    expect(contrast(colour("leaf"), colour("white"))).toBeLessThan(4.5);
  });
});
