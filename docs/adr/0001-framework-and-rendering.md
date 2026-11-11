# ADR 0001: Framework and rendering

- Status: Accepted
- Date: 2026-11-11
- Deciders: Owner

## Context

Sekoya Parts must show that a very large spare-parts catalog is feasible ([AGENTS.md](../../AGENTS.md), section 1). This Architecture Decision Record (ADR) chooses the web framework and how its pages are rendered. The forces:

- **Page count.** About 100,000 products and at least 1,000,000 appliance models (one product fits up to a million models), each with its own page in ten languages: over ten million pages. Building them all in advance is ruled out, so pages are rendered on request and then cached.
- **Partial refresh.** A price or description change must refresh only that part of a page. The content stays in the HTML that search engines receive, so fetching it in the browser after the page loads does not meet the requirement.
- **Page weight and speed.** A PageSpeed score of 95 to 100 on mobile, checked on every commit, and product-page HTML under 2 MB while the most popular compatible references are rendered as text.
- **Languages.** Ten languages on one domain under path prefixes: `fr` (the source), `en`, `de`, `es`, `it`, `nl`, `pt`, `pl`, `sv`, `da`.
- **Hosting.** Vercel, with automatic deployments for every branch and `main` (owner decision). Its plan limits belong to the hosting record.
- **No third-party scripts.**
- **Later choices.** The content management system (CMS) is chosen in a later record; this one says which CMS options each framework rules out.

Next.js was proposed in conversation but never adopted: it is compared here on equal terms.

### Criteria

1. Pages rendered on request and cached, with no full build of the catalog.
2. Refreshing only part of a page when a price or description changes. This record checks that the framework can do it; the caching record chooses how.
3. JavaScript sent to the browser, for a PageSpeed score of 95 or more on a slow phone.
4. Ten languages under path prefixes.
5. Support on Vercel, including caching on its network.
6. Whether the option rules out a CMS option.

## Options considered

Versions are the latest stable releases on 2026-11-11, and every link was checked that day. Numbers in parentheses refer to the criteria.

### 1. Next.js 16 with the App Router

Version 16.4.6 ([releases](https://github.com/vercel/next.js/releases)). Next.js is maintained by Vercel.

- **On request (1).** Pages not built in advance are rendered on their first visit and cached. With Cache Components, each dynamic route must list at least one page to build in advance ([generateStaticParams](https://nextjs.org/docs/app/api-reference/functions/generate-static-params)). Other pages are served as an app shell at once and completed in the background, from 16.3 and with the `partialPrefetching` option; without it, the first request waits for the full render ([ISR with Cache Components](https://nextjs.org/docs/app/guides/incremental-static-regeneration-cache-components)). On Vercel, Incremental Static Regeneration (ISR) stores the result durably, per deployment ([Vercel ISR](https://vercel.com/docs/incremental-static-regeneration)).
- **Partial refresh (2).** Built in and stable since 16.0 ([cacheComponents](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)). A component marked `"use cache"` gets its own cache entry and tags ([use cache](https://nextjs.org/docs/app/api-reference/directives/use-cache)). `revalidateTag`, which a route handler called by a CMS webhook can run, marks the tagged entries stale. With the recommended `max` profile, visitors get the old content while the new one is built ([revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)). Two limits:
  - The documentation does not say that only the stale component is re-run while the rest of the page is reused.
  - The default cache lives in each server instance's memory and, on serverless hosting, typically does not last from one request to the next ([use cache](https://nextjs.org/docs/app/api-reference/directives/use-cache)). A cache shared by all instances is `"use cache: remote"` ([use cache: remote](https://nextjs.org/docs/app/api-reference/directives/use-cache-remote)). On Vercel it is stored in the Runtime Cache, which is regional, does not survive a new deployment and, on the Hobby plan, is shared by all of a team's projects within monthly limits ([Runtime Cache](https://vercel.com/docs/runtime-cache)).
- **JavaScript (3).** React Server Components (RSC) send no component code to the browser ([Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)). Next.js still sends its runtime (React and the router). The RSC payload, the data the browser uses to take over the page, is also embedded in the HTML of the first load ([Vercel guide on document size](https://vercel.com/kb/guide/how-to-optimize-your-document-size-in-next-js)). Both count against PageSpeed and the 2 MB limit.
- **Languages (4).** Official guide: an `app/[lang]` folder, and a redirect in `proxy.js` for addresses without a language ([internationalization](https://nextjs.org/docs/app/guides/internationalization)). Proxy is the name of middleware since 16.0 ([proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)).
- **Vercel (5).** Vercel documents ISR, streaming, Partial Prerendering and Cache Components for Next.js. The static shell of a page is served through ISR, and its dynamic parts by functions ([Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)).
- **CMS (6).** Rules out none. Payload installs into a Next.js app and supports Next.js 16.2.6 and later. Its documentation warns that full compatibility with Cache Components is not guaranteed, while the admin panel runs without errors with them ([Payload installation](https://payloadcms.com/docs/getting-started/installation)).

### 2. Astro 7

Version 7.4.10, with the Vercel adapter 11.0.21 ([releases](https://github.com/withastro/astro/releases)).

- **On request (1).** Pages can be rendered on demand, one by one or all of them ([on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/)). The Vercel adapter caches them with ISR, refreshed by path with a secret token ([Vercel adapter](https://docs.astro.build/en/guides/integrations-guide/vercel/)). Astro 7.0 added route caching with tags. Its Vercel provider is still experimental ([route caching](https://docs.astro.build/en/guides/caching/)).
- **Partial refresh (2).** Not built in. Server islands render one part of a page separately, but the browser fetches that part after the page loads. It is therefore missing from the HTML that search engines receive ([server islands](https://docs.astro.build/en/guides/server-islands/)). Route caching works on whole responses. A partial refresh would be hand-built: cache the data behind each part in Vercel's Runtime Cache, which any framework can use ([Runtime Cache](https://vercel.com/docs/runtime-cache)), and rebuild the page when one part changes.
- **JavaScript (3).** The best of the five: no JavaScript by default. Interactive components opt in one by one ([islands](https://docs.astro.build/en/concepts/islands/)).
- **Languages (4).** Built in, with a prefix for every language, the default one included ([internationalization](https://docs.astro.build/en/guides/internationalization/)).
- **Vercel (5).** The official adapter supports ISR, server islands and image optimization ([Vercel adapter](https://docs.astro.build/en/guides/integrations-guide/vercel/)).
- **CMS (6).** Payload's documented installation is inside a Next.js app. With Astro it would run as a second application, which Astro reads over HTTP. Astro has an official Payload guide ([Payload guide](https://docs.astro.build/en/guides/cms/payload/)).

### 3. Nuxt 4 (Vue)

Version 4.6.4 ([releases](https://github.com/nuxt/nuxt/releases)).

- **On request (1).** Route rules with `isr` render pages on demand and cache them on Vercel, refreshed by path with a secret token ([Nitro on Vercel](https://nitro.build/deploy/providers/vercel), [Nuxt on Vercel](https://vercel.com/docs/frameworks/full-stack/nuxt)).
- **Partial refresh (2).** Not built in. Server components are still experimental ([server components](https://nuxt.com/docs/4.x/guide/concepts/server-components)). Once a server component is rendered into a page, it is part of that page's cached entry. Nitro's cached functions cache data, with no documented tags. To share that cache between instances on Vercel, they need an external store such as Redis ([Nitro cache](https://nitro.build/guide/cache), [Nuxt on Vercel](https://vercel.com/docs/frameworks/full-stack/nuxt)). A partial refresh would be hand-built, as for Astro.
- **JavaScript (3).** The whole page runs again in the browser by default ([Nuxt on Vercel](https://vercel.com/docs/frameworks/full-stack/nuxt)). Only the experimental server components send less.
- **Languages (4).** The official module `@nuxtjs/i18n`, with a strategy that prefixes every route ([Nuxt i18n](https://i18n.nuxtjs.org/docs/guide)).
- **Vercel (5).** Vercel documents ISR through route rules, and image optimization ([Nuxt on Vercel](https://vercel.com/docs/frameworks/full-stack/nuxt)).
- **CMS (6).** Payload as a second application read over HTTP, as for Astro.

### 4. SvelteKit 3 (Svelte)

Version 3.2.0, with the Vercel adapter 7.0.3 ([releases](https://github.com/sveltejs/kit/releases)).

- **On request (1).** Each route can declare ISR on Vercel, refreshed by path with a secret token ([Vercel adapter](https://svelte.dev/docs/kit/adapter-vercel)).
- **Partial refresh (2).** Not built in: each cached route is one block. Streamed parts need JavaScript, so they are not in the HTML first served ([loading data](https://svelte.dev/docs/kit/load)). Remote functions are experimental ([remote functions](https://svelte.dev/docs/kit/remote-functions)). A partial refresh would be hand-built, as for Astro.
- **JavaScript (3).** The whole page runs again in the browser by default. With `csr = false`, a page sends no JavaScript at all, and every link then loads a full page ([page options](https://svelte.dev/docs/kit/page-options)).
- **Languages (4).** Paraglide, added by the Svelte command-line tool ([Paraglide](https://svelte.dev/docs/cli/paraglide)). Its path-prefix routing was not checked.
- **Vercel (5).** Vercel documents ISR, streaming and image optimization ([SvelteKit on Vercel](https://vercel.com/docs/frameworks/full-stack/sveltekit)).
- **CMS (6).** Payload as a second application read over HTTP, as for Astro.

### 5. React Router 8 (framework mode, formerly Remix)

Version 8.5.1 ([changelog](https://reactrouter.com/changelog)).

- **On request (1).** Every page is rendered on request. Caching works only through `Cache-Control` headers on Vercel's network ([headers](https://reactrouter.com/how-to/headers)). Vercel's page for React Router lists no ISR ([React Router on Vercel](https://vercel.com/docs/frameworks/frontend/react-router)).
- **Partial refresh (2).** Not built in. Support for React Server Components is experimental ([React Server Components](https://reactrouter.com/how-to/react-server-components)). A partial refresh would be hand-built, as for Astro.
- **JavaScript (3).** The whole page runs again in the browser. Leaving out the scripts component removes all JavaScript, and client-side navigation with it ([Scripts](https://reactrouter.com/api/components/Scripts)).
- **Languages (4).** No official guide found: prefixed routes are written by hand or with a third-party library.
- **Vercel (5).** Server rendering and streaming. No ISR or image optimization listed ([React Router on Vercel](https://vercel.com/docs/frameworks/frontend/react-router)).
- **CMS (6).** Payload as a second application read over HTTP, as for Astro.

### Common to every option

- **Tag purge.** Vercel can tag the responses of its functions and purge them by tag, on all plans ([cache purge](https://vercel.com/docs/caching/cdn-cache/purge)). Whatever the framework, a price change can therefore refresh every cached page that shows that price. What separates the options is how much of each page is computed again.
- **Cache per deployment.** Vercel's ISR cache belongs to one deployment, so each new deployment starts without cached pages ([Vercel ISR](https://vercel.com/docs/incremental-static-regeneration)). This is for the hosting record.

### Summary

| Criterion | Next.js | Astro | Nuxt | SvelteKit | React Router |
| --- | --- | --- | --- | --- | --- |
| 1. On request, cached | ISR | ISR | ISR | ISR | Network headers only |
| 2. Partial refresh | Built in, stable | Hand-built | Hand-built | Hand-built | Hand-built |
| 3. JavaScript | Runtime and RSC payload | None by default | Whole page | Whole page, or none | Whole page, or none |
| 4. Languages | Official guide | Built in | Official module | Command-line add-on | No guide |
| 5. Vercel | Full | Official adapter | Documented | Documented | Basic |
| 6. CMS | Payload in the same app | Payload as a second app | Payload as a second app | Payload as a second app | Payload as a second app |

## Decision

Chosen: **Next.js 16 with the App Router and Cache Components**, at the current 16.x release (16.4.6 on 2026-11-11). The toolchain record pins the exact version.

Why:

- Partial refresh is the core of what the project demonstrates, and Next.js is the only option where it is built in and stable. Each part of a page is cached and tagged on its own, and a CMS webhook can mark one tag stale. The other options need a hand-built cache layer: more code to write and test, and a demonstration of our own cache rather than of the platform.
- Vercel supports it fully: ISR for the page shell, streaming, and tags shared with Vercel's network.
- Payload, a CMS candidate, runs inside the same application instead of a second deployment.

What it costs, and where each cost is checked:

- **Page weight.** It sends more JavaScript than Astro, and the RSC payload adds to the HTML. Experiment 2 and the PageSpeed check measure the real product page against 2 MB and a score of 95.
- **Partial refresh not yet proven.** The documentation does not say that refreshing one tag re-runs only that part of the page. Lasting reuse also depends on `"use cache: remote"` and the Runtime Cache limits. The caching record and experiment 1 settle both.
- **Payload compatibility.** Payload does not guarantee full compatibility with Cache Components, which the CMS record weighs.
- **Fallback.** If experiment 1 or 2 fails with Next.js, Astro comes next: no JavaScript by default and built-in languages, with a hand-built partial refresh. A new record would then replace this one.

## Consequences

Positive:

- Partial refresh relies on documented, stable framework features rather than project code.
- One application holds the site and, if the CMS record picks Payload, its admin panel.

Negative:

- The project depends on the Next.js caching model. On another host, lasting caches would need another cache handler.
- Every dynamic route must list at least one page to build in advance, so the build includes a few popular products and models.
- Each deployment starts without cached pages (hosting record).

Follow-up:

- **Hosting record:** the Hobby limits for ISR, the Runtime Cache and functions, against over ten million pages.
- **Toolchain record:** the exact Next.js version, compatible with Payload (16.2.6 or later).
- **Caching record and experiment 1:**
  - What is re-run when one tag is refreshed.
  - What a search engine receives on the first visit to a page not built in advance.
- **Experiment 2:** the real HTML size, including the RSC payload.
- **CMS record:** Payload with Cache Components.
