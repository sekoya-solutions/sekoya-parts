# ADR 0012: Front-end assets

- Status: Accepted
- Date: 2026-11-11
- Deciders: Owner

## Context

This Architecture Decision Record (ADR) chooses how pages are styled and what the browser downloads besides the HTML. The forces:

- **Owner requirements** ([AGENTS.md](../../AGENTS.md), section 1):
  - a PageSpeed score of 95 to 100;
  - no third-party scripts;
  - about 50 original or CC0 images, reused across products and resized at import;
  - an original design.
- **Hosting.** Hobby includes 5,000 image transformations a month ([ADR 0002](0002-hosting-and-environments.md)).
- **Tools.** Biome for lint and format, and npm with install scripts off ([ADR 0003](0003-toolchain.md)). Lighthouse runs on every preview ([ADR 0004](0004-testing-and-ci.md)).
- **Page weight.** The product page lists 500 references, so every byte per element counts ([ADR 0009](0009-compatible-references.md)).
- **Languages.** A language chooser at the bare domain and a language switch on every page ([ADR 0011](0011-languages-and-seo.md)).

### Criteria

1. PageSpeed 95 on mobile.
2. No third-party requests.
3. Image limits.
4. An original design system.
5. Accessibility.
6. Fit with the tools.
7. The language chooser and switch.

## Options considered

Facts were checked on 2026-11-11.

- **Styling.**
  - Next.js supports CSS Modules, which scope class names per component, as well as Tailwind CSS and global CSS ([CSS in Next.js](https://nextjs.org/docs/app/getting-started/css)).
  - Tailwind 4.3.5 adds a PostCSS plugin and a native engine, with no install scripts ([npm registry](https://registry.npmjs.org/@tailwindcss/oxide/4.3.5)). Its utility classes sit on every element, which adds bytes to a 500-item list, both in its HTML and in the data Next.js embeds.
  - Biome lints and formats CSS ([language support](https://biomejs.dev/internals/language-support/)).
- **Fonts.**
  - `next/font` serves font files from the site itself, so the browser sends no request to Google, and loads them with no layout shift ([fonts in Next.js](https://nextjs.org/docs/app/getting-started/fonts)).
  - The system font stack downloads nothing at all.
- **Images.**
  - Next.js's on-demand optimisation would count against Hobby's 5,000 transformations a month. An image can skip it and be served as it is ([Image component](https://nextjs.org/docs/app/api-reference/components/image)).
  - sharp 0.35.5 resizes images ahead of time, with no install scripts ([npm registry](https://registry.npmjs.org/sharp/0.35.5)).
  - AVIF and WebP compress better than older formats, but browsers support them less broadly ([image formats](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types)).
- **Interactive pieces.** A language switch is a set of links, and a search is a form. Neither needs code running in the browser.

## Decision

Chosen:

- **Styling: Tailwind CSS 4,** the usual utility framework of real e-commerce sites, with the design tokens (colours, spacing, type scale, radii) in its theme. Long lists, like the 500 references, are styled through a single class on their container rather than classes on each item, which keeps their HTML short.
- **Fonts: one brand typeface, self-hosted through `next/font`.**
  - It is served from the site itself, with no layout shift.
  - Only the weights and the Latin character set the ten languages need are kept.
  - The typeface is the owner's design choice. Its source, licence and size are stated before it is used.
- **Images, resized at build time by a script using sharp:**
  - The originals, with their licence notes, are committed in the repository.
  - The script produces a few fixed widths in AVIF, WebP and JPEG, served as static files.
  - Pages use `<picture>` with explicit width and height. The main product image loads with high priority, and the others lazily.
  - Next.js's on-demand optimisation and Vercel Blob are not used.
- **No browser code for the language switch or the search:**
  - The switch is a set of links to the page's translated addresses (ADR 0011).
  - The bare domain lists the ten languages as plain links.
  - Search is the plain form of ADR 0010.
- **Accessibility:** Lighthouse also checks the accessibility category on every preview, with the same minimum of 95.

Why:

- **A realistic stack that still scores 95.** Tailwind's stylesheet holds only the classes the site uses, and the container class keeps the long lists light. `next/font` serves the brand font from the site without layout shift.
- **Images resized at build time** never touch Hobby's transformation limit or Blob's operations. Images are served from the site, as files cached by Vercel's network.
- **Links and forms** work without code in the browser, which helps both PageSpeed and visitors on slow phones.

What it costs, and where each cost is checked:

- **Class bytes.** Utility classes add bytes to every element. The pages stay light because the long lists use their container class, and experiment 2 measures the product page with them.
- **Font weight.** A font file is part of the first load. Keeping one family, few weights and the Latin set keeps it small, and Lighthouse measures it on every preview.
- **Images ship in three formats,** which costs a few files per image at build time, so that every browser gets an image.
- **Build time.** Resizing runs on each build. With about 50 images this stays small, and the build log shows it.

No separate download is needed on the owner's machine. Tailwind and sharp come with the lockfile, and the font, once chosen, is stated for approval.

## Consequences

Positive:

- A realistic e-commerce stack, with a brand typeface and utility classes.
- Every asset comes from the site itself.

Negative:

- Long lists must keep to their container class, which code review watches.
- The typeface needs the owner's choice and approval before the design is finished.

Follow-up:

- **Design work, by the owner:** the typeface, colours, logo and layouts that fill the tokens.
- **Testing and CI:** the accessibility threshold in Lighthouse CI, next to the performance one.
- **Implementation:** the image script, its originals with licence notes, and the `<picture>` component.
