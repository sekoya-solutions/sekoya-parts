# Design system

The site's look, decided by the owner on 2026-11-13 in [issue #83](https://github.com/sekoya-solutions/sekoya-parts/issues/83), within [ADR 0012](../adr/0012-front-end-assets.md). The images followed in [issue #85](https://github.com/sekoya-solutions/sekoya-parts/issues/85).

## Images

- **Originals:** 48 square JPEGs at 1,600 x 1,600 pixels, four per category, in `assets/images/<category>/<n>.jpg`. The owner generated them with Grok Imagine; [their source note](../../assets/images/README.md) gives the prompt and each subject.
- **Resizing:** `scripts/images.ts`, run by every build, writes each at 320, 480, 640 and 960 pixels in AVIF, WebP and JPEG into `public/images/`. A file's name holds a hash of its original and its encoding settings, so it is served with a year of immutable caching (`site/images-headers.ts`).
- **Which image:** a product shows image `((id - 1) mod 4) + 1` of its category, so the four are spread evenly and a product always keeps the same one (`site/images.ts`). A category created later in Payload, with no images, shows none. The home page shows each category's first image.
- **Markup:** `site/picture.tsx` writes `<picture>` with AVIF and WebP sources and a JPEG `<img>` that has its width, height, `sizes` and a text alternative in the page's language: the product's or the category's name.
- **Phones:** card grids show two cards per row, so a phone loads half-width images. The product page is text first: its image is a 7rem thumbnail beside the name and price, so the text stays the largest element and appears with the first paint; from 48rem the image takes a 28rem column beside the text. A Lighthouse run on PR #86 showed why: with a large image first, the simulated slow phone painted it only after the page's HTML, font and scripts, at about 3 s, and performance fell to 92 or 93.
- **Loading:** the product page's main image loads at once with high priority. On the home, category and model pages, the first two images, a phone's first row, load at once, the first with high priority, and the others lazily.
- **Where:** the product page's main image, the product cards of category and model pages, and the home page's category tiles. The product page's reference list stays text only.

## Typeface

- **Manrope,** from the npm package `@fontsource-variable/manrope` 5.3.0, under the SIL Open Font License 1.1 ([licence](../licenses/manrope-OFL.txt)).
- `site/fonts.ts` loads it through `next/font/local`, so it is served from the site itself. One variable file covers every weight.
- Only two files are built:
  - Latin (24,836 bytes), preloaded, for nine languages;
  - Latin Extended (15,120 bytes), for Polish, downloaded only by a page that holds one of its characters.
- While Manrope loads, the text shows in Arial sized to Manrope's metrics, so the swap does not move it.

## Colours

The theme in `site/site.css` replaces Tailwind's palette with these tokens, drawn from the Sekoya Solutions logo. `tests/contrast.test.ts` reads them from the stylesheet and checks each pairing the site uses: 4.5:1 for text, 3:1 for focus rings and form field borders, as the Web Content Accessibility Guidelines (WCAG) 2.2 AA require.

| Token | Colour | Use | Contrast |
| --- | --- | --- | --- |
| `navy` | `#0B1C29` | text, header and footer | 17.3:1 on white |
| `action` | `#0A7A5C` | links, buttons, focus rings | 5.3:1 with white |
| `action-hover` | `#08654C` | hovered links and buttons | 7.1:1 with white |
| `leaf` | `#22C08A` | on navy only: the logo's "o", focus rings | 7.4:1 on navy |
| `cream` | `#E8D8C0` | links on navy | 12.4:1 on navy |
| `mist` | `#9DBDCC` | secondary text on navy | 8.7:1 on navy |
| `sand` | `#F6F1E8` | soft surfaces | 15.4:1 with navy |
| `slate` | `#4F6170` | secondary text, form field borders | 6.4:1 on white |
| `line` | `#C9D3D9` | decorative card borders only | 1.5:1 on white |

Prices are bold navy.

## Logo

A wordmark only: "Sekoya Parts" in Manrope, "Sekoya" in cream and "Parts" in mist on the navy header, with the "o" of Sekoya in leaf green (`site/wordmark.tsx`).

## Layout

- Every page in a language has a skip link, a navy header with the wordmark and the language switch, its main content and a footer (`site/frame.tsx`).
- The language switch is a native `<details>` element holding plain links to the same page in the other nine languages, the addresses of its `hreflang` tags. It runs no browser code.
- Long lists are styled through one class on their container, never classes on each item: `.reference-list` for the product page's 1,000 references, `.product-list` for category and model pages, and `.pager` for the previous and next links.

## The 404 page and its limits

`app/(site)/[lang]/not-found.tsx` shows a 404 page in the address's language, with the header, the footer and a link to the home page. Every case below answers with status 404 and a `noindex` tag, so search engines treat them correctly. Measured on Next.js 16.4.6, the latest release on 2026-11-13. The owner chose to leave these cases as they are for now.

1. **An address the page rejects with `notFound()`:** an unknown product, model or category, or a page number past the last.
   - What happens: the server sends an empty HTML shell, `<html id="__next_error__">`, with no `lang` attribute and no text. The browser draws the 404 from the page's data once Next.js's scripts run (6 files, about 172 KB compressed, the same as every page).
   - Where it fails: the page stays blank when scripts are off, blocked or fail to load, and for readers that run none, such as `curl` or link previews. On a slow first visit it stays blank until the scripts arrive. The tab title is the site's, since a not-found file inside a segment cannot set metadata.
   - Why: Next.js's not-found boundary is a browser error boundary, and React's server renderer does not run error boundaries, so the error reaches the top of the page and Next.js sends its error shell. The same behaviour is described in [Next.js not-found.tsx: Empty 404 HTML and the Fix](https://www.afaqrashid.com/writing/nextjs-not-found-page-empty).
   - Possible fix: none for addresses read from the database; only a change in Next.js would render this 404 on the server.
2. **An unknown language,** such as `/xx` or `/FR`.
   - What happens: the same empty shell. After the scripts run, Next.js's default English 404 appears, not the designed page, because the language layout itself rejects the address and no not-found file sits above the root layouts.
   - Possible fix: `dynamicParams = false` on the language segment, which makes an unknown language an unmatched address, together with `global-not-found.js`, which Next.js marks experimental.
3. **More path segments than any route,** such as `/fr/a/b/c/d/e`.
   - What happens: the server sends a complete page, but it is Next.js's default English 404, with no `lang` attribute.
   - Possible fix: `global-not-found.js`, experimental, which would show a designed page in French.
