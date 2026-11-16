# Design system

The site's look, decided by the owner on 2026-11-13 in [issue #83](https://github.com/sekoya-solutions/sekoya-parts/issues/83), within [ADR 0012](../adr/0012-front-end-assets.md). The images followed in [issue #85](https://github.com/sekoya-solutions/sekoya-parts/issues/85).

## Images

- **Originals:** 48 square JPEGs at 1,600 x 1,600 pixels, four per category, in `assets/images/<category>/<n>.jpg`. The owner generated them with Grok Imagine; [their source note](../../assets/images/README.md) gives the prompt and each subject.
- **Resizing:** `scripts/images.ts`, run by every build, writes each at 320, 480, 640 and 960 pixels in AVIF, WebP and JPEG into `public/images/`. A file's name holds a hash of its original and its encoding settings, so it is served with a year of immutable caching (`site/images-headers.ts`).
- **Which image:** a product shows image `((id - 1) mod 4) + 1` of its category, so the four are spread evenly and a product always keeps the same one (`site/images.ts`). A category created later in Payload, with no images, shows none. The home page shows each category's first image.
- **Markup:** `site/picture.tsx` writes `<picture>` with AVIF and WebP sources and a JPEG `<img>` that has its width, height, `sizes` and a text alternative in the page's language: the product's or the category's name.
- **Phones:** card grids show two cards per row. `CARD_SIZES` gives a card image's real width, half the screen less 3rem, so Lighthouse's 412-pixel phone at 1.75x loads the 320 width rather than the 480 one (issue #87). The home, category and model pages open with a short introduction in large text, sized to be the first screen's largest element on a phone, so the page's largest paint comes with the HTML rather than after the card images; an end-to-end test checks it in the ten languages. On a desktop, the first card image stays the largest element. The product page is text first: its image is a 7rem thumbnail beside the name and price, so the text stays the largest element and appears with the first paint; from 48rem the image takes a 28rem column beside the text. A Lighthouse run on PR #86 showed why: with a large image first, the simulated slow phone painted it only after the page's HTML, font and scripts, at about 3 s, and performance fell to 92 or 93.
- **Loading:** the product page's main image loads at once with high priority. On the home, category and model pages, the first two images, a phone's first row, load at once, the first with high priority, and the others lazily.
- **Where:** the product page's main image, the product cards of category and model pages, and the home page's category tiles. The product page's reference list stays text only.

## Typeface

- **Manrope,** from the npm package `@fontsource-variable/manrope` 5.3.0, under the SIL Open Font License 1.1 ([licence](../licenses/manrope-OFL.txt)).
- `site/fonts.ts` loads it through `next/font/local`, so it is served from the site itself. One variable file covers every weight.
- Only two files are built:
  - Latin (24,836 bytes), preloaded, for nine languages;
  - Latin Extended (15,120 bytes), for Polish, downloaded only by a page that holds one of its characters.
- While Manrope loads, the text shows in Arial sized to Manrope's metrics, so the swap does not move it.
- **Long words** (issue #177): headings, card names and the cart's lines are hyphenated in the page's language (`hyphens: auto`, read from `<html lang>`), so a German, Dutch or Scandinavian compound never pushes a phone's page wider than its screen. Where a browser has no hyphenation rules for the language, `overflow-wrap: break-word` breaks the word at the edge instead. Body paragraphs are not hyphenated.
- **Phone header** (issue #177, owner decision of 2026-11-16): below the `sm` breakpoint, the account and cart links show icons drawn for the site (`site/header-icons.tsx`), in the text's colour, their names kept for screen readers; the header's links wrap onto a second line rather than scroll sideways, until the mobile menu of [#181](https://github.com/sekoya-solutions/sekoya-parts/issues/181).

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

- Every page in a language has a skip link, a navy header and its main content, then a footer (`site/frame.tsx`). A thin bar of true facts about the demo comes before the header, outside its banner landmark (issue #144, owner decision, 2026-11-15): the number of appliance models, the ten languages, and "demonstration shop: nothing is sold", linking to the demo terms of sale. The header holds the wordmark, the search box, the category menu, a link to the brand index (issue #147) and the language switch.
- The category menu is a native `<details>` element, like the language switch: the 12 categories in the page's language, sorted by name, each linking to its first page. It runs no browser code and opens by keyboard. It reads the shared categories entry, so a renamed category refreshes the pages that show it.
- Breadcrumbs (`site/breadcrumbs.tsx`) open the category, brand, product, reference and model pages: home, then the category or the brand index and the brand, the product and the reference page as each applies, the current page last and unlinked. The same trail is given as schema.org `BreadcrumbList` data at full addresses, inline JSON with `<` escaped. `.breadcrumbs` styles the line, each crumb tall enough to tap.
- The language switch is a native `<details>` element holding plain links to the same page in the other nine languages, the addresses of its `hreflang` tags. It runs no browser code.
- Long lists are styled through one class on their container, never classes on each item: `.reference-list` for the product page's 1,000 references, `.product-list` for category and model pages, and `.pager` for the previous and next links.
- Category pages open their product list with the sort and brand controls (`ListingControls` in `site/category-page.tsx`, issue #148): one `GET` form, each list under its label, then an "Apply" button in the action colour, styled by `.listing-controls`, each control at least 2.75rem tall to tap on a phone. They sit side by side when they fit, and wrap below.
- Prices (`site/product-card.tsx`, issue #151): the current price in its bold `<span>`; during a sale, the former price follows in an `<s>`, slate, with a hidden "Was:" label for screen readers, then the discount as a `<mark>`, navy on leaf, such as "-25 %". The product page shows its availability and delivery estimate under the price, the availability in bold.
- The home page (issue #155) opens with its introduction, then the promotions (`site/promotions.tsx`), the part finder's first step, the categories and the showcase. The promotions are a slider of up to three slides and a row of tiles, over the owner's images, with `alt=""` since their headline and text say where they lead.
  - The slider is a scroll-snap strip, `.slider`, one slide per view, moved by swiping, its scroll bar or its numbered links, `.slider-nav`, each 2.75rem square. It never moves by itself and runs no script. On phones a slide's text sits below its image; from 48rem it sits over the image's calm left half, on a sand panel, in navy.
  - The tiles, `.promotion-tiles`, are one per row on phones and three from 40rem, each an image with its headline and text below.
  - Their images load lazily, so the introduction stays the phone's largest element; the slides are written at 640 to 1,920 pixels wide and the tiles at 320 to 960 (`IMAGE_SETS`).
- The part finder (`site/finder.tsx`, issue #155) is one page in three steps, with no script: a brand list in a `GET` form, the brand's appliance types as links with their model counts, then the pair's 24 most popular models as links and a reference field, styled by `.listing-controls`.
- The brand pages (`site/brands.tsx`, issue #147): the brand index lists every brand by name, each with its number of products, in a grid of 12rem columns styled by `.brand-list`. Each brand's listing is built like a category page, with the same introduction, product cards and previous and next links (`ProductListing` in `site/category-page.tsx`).
- The navy footer (issue #143) has two link columns, each a `<nav>` named by its heading: help (help and frequently asked questions, delivery and returns) and legal information (legal notice, demo terms of sale, privacy, accessibility statement). The demo notice follows them. `.footer-links` gives each link the height to tap it on a phone. The columns sit side by side from the `sm` breakpoint, one under the other below it.
- The information pages are one template (`site/info-page.tsx`): a heading, then sections of a second-level heading and paragraphs, in a column of prose width, styled by `.info-page`. Their texts are in `site/info/<lang>.json`; the legal notice's details are in `site/publisher.ts`; while the publisher's are pending, its publisher section says they will be published soon.

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
