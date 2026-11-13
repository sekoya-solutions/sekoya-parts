// Manrope, the brand typeface (issue #83, docs/adr/0012-front-end-assets.md),
// from @fontsource-variable/manrope under the SIL Open Font License 1.1
// (docs/licenses/manrope-OFL.txt). next/font/local serves the files from the
// site itself, with no request to another host.
//
// Only two of the package's files are built: Latin, for nine of the ten
// languages, and Latin Extended, for Polish. Each is its own family with the
// package's unicode-range, so a browser downloads Latin Extended only for a
// page holding one of its characters. next/font/local takes one unicode-range
// per call, hence two calls.
//
// The stack puts Latin Extended first. It covers only its own range and has
// no fallback face of its own, so every other character reaches the Latin
// family, then the Latin family's metric-adjusted fallback, which next/font
// sizes to Manrope so the swap moves no text. A fallback face placed before
// Latin Extended would cover Polish letters and keep that file from ever
// being used.
import localFont from "next/font/local";

// next/font reads its options at build time: they must be literals, so the
// paths and the unicode ranges, from @fontsource-variable/manrope 5.3.0's
// wght.css, are written out in full.
export const manrope = localFont({
  src: [
    {
      path: "../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
      weight: "200 800",
      style: "normal",
    },
  ],
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
  ],
  display: "swap",
  adjustFontFallback: "Arial",
  variable: "--font-manrope",
});

export const manropeExtended = localFont({
  src: [
    {
      path: "../node_modules/@fontsource-variable/manrope/files/manrope-latin-ext-wght-normal.woff2",
      weight: "200 800",
      style: "normal",
    },
  ],
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
  ],
  display: "swap",
  adjustFontFallback: false,
  preload: false,
  variable: "--font-manrope-ext",
});

/** The classes that define both font variables, for the <html> element. */
export const fontVariables = `${manropeExtended.variable} ${manrope.variable}`;
