# ADR 0008: Caching and partial refresh

- Status: Accepted
- Date: 2026-11-11
- Deciders: Owner

## Context

This Architecture Decision Record (ADR) decides how pages and their parts are cached, and how an edit refreshes only the part it changes. It is the core of what Sekoya Parts demonstrates ([AGENTS.md](../../AGENTS.md), section 1). The forces:

- **Framework.** Next.js 16 with Cache Components ([ADR 0001](0001-framework-and-rendering.md)), which left open what is re-run when one part is refreshed.
- **Hosting.** Vercel's Hobby plan: pages are stored through Incremental Static Regeneration (ISR), the Runtime Cache has monthly limits, and every deployment starts with empty caches ([ADR 0002](0002-hosting-and-environments.md)).
- **Security.** Most recent Next.js advisories concern `use cache` ([ADR 0003](0003-toolchain.md)).
- **Edits.** Payload's save hooks call the refresh ([ADR 0006](0006-content-management.md)).
- **Data.** A product page has a price, a description and a list of compatible references read in popularity order ([ADR 0007](0007-catalog-data-model.md)).

### Criteria

1. Partial refresh: what is re-run and what is reused after a price edit.
2. Freshness of a new price.
3. What a first visit to a page not built in advance receives.
4. The Runtime Cache budget on Hobby.
5. Cold caches after deployments.
6. Security.
7. Proof.

## Options considered

Facts were checked on 2026-11-11.

- **Where parts are cached.**
  - **Next.js's default cache** keeps each part's result in the memory of one server. On serverless hosting, a cached function runs again on each regeneration of the page ([use cache](https://nextjs.org/docs/app/api-reference/directives/use-cache)). A price edit would therefore re-run every part.
  - **`"use cache: remote"`** stores the results in a cache shared by all servers, refreshed by tags ([use cache: remote](https://nextjs.org/docs/app/api-reference/directives/use-cache-remote)). On Vercel this is the Runtime Cache. Hobby includes 1,000,000 reads and 200,000 writes of 8 KB a month, shared by the team. The entries cannot be read after a new deployment ([Runtime Cache](https://vercel.com/docs/runtime-cache)).
  - **Whole pages only,** through ISR and tags. This is the simplest option, but every edit re-renders the whole page, the reference list included.
- **What the documentation leaves open.** Each cached function has its own entry, keyed by its inputs ([use cache](https://nextjs.org/docs/app/api-reference/directives/use-cache)). A refresh happens on the next request ([revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)), and it regenerates the page's shell ([platform guide](https://nextjs.org/docs/app/guides/ppr-platform-guide)). No page states that the other parts' remote entries are then reused, so experiment 1 must show it.
- **Tags.** One tag per product would refresh the description along with the price. Tags per part keep them apart, within 256 characters per tag ([revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)).
- **Refresh.**
  - With the `max` profile, the next visitor gets the old content while the new one is built.
  - With `{ expire: 0 }`, stale content is never served, and the next request waits for the new content.
  - `updateTag` works only inside Server Actions ([updateTag](https://nextjs.org/docs/app/api-reference/functions/updateTag)), so a save hook cannot rely on it.
  - On Hobby, refresh calls are limited to 50 per second for the team ([Runtime Cache](https://vercel.com/docs/runtime-cache)).
- **First visit to a page not built in advance** ([ISR with Cache Components](https://nextjs.org/docs/app/guides/incremental-static-regeneration-cache-components)):
  - With `partialPrefetching`, the visitor gets an app shell at once and the content streams in.
  - Without it, the first request waits for the full render, and later visits get the cached page.

## Decision

Chosen:

- **Each part of a page is its own cached component** with `"use cache: remote"` and an explicit `cacheLife('max')`. On the product page, the parts are the price, the description and the reference list. Model and category pages follow the same pattern. Content changes only through edits and new generations, which refresh it by tag.
- **Tags per part:** `product:<id>:price`, `product:<id>:description`, `product:<id>:references`, `model:<id>`, `category:<id>`, plus one `catalog` tag for a whole new generation. A category listing also carries the price tags of the products it shows.
- **No cached component wraps tagged parts.** An outer cache would hold its parts' output ([cacheLife](https://nextjs.org/docs/app/api-reference/functions/cacheLife)), so an inner refresh might not reach it.
- **Payload's save hook calls `revalidateTag(tag, { expire: 0 })`** for the edited parts only, so no visitor sees an old price. A new generation refreshes the single `catalog` tag, never 100,000 product tags.
- **`partialPrefetching` stays off.** A first visit waits for the full render, so its HTML is complete. The showcase pages are built in advance (ADR 0002).
- **Cached parts take only identifiers and the language as arguments.** They never read cookies, headers or other per-visitor data, which `use cache` forbids anyway ([use cache](https://nextjs.org/docs/app/api-reference/directives/use-cache)).

Why:

- **Only remote entries can outlive a page regeneration on serverless hosting,** so only they can let a price edit leave the description and references untouched.
- **Per-part tags** refresh exactly what changed.
- **`{ expire: 0 }`** never shows an old price.
- **Complete HTML on first visits** keeps the content visible to search engines without relying on streaming.

What experiment 1 must show, on a Vercel preview:

- **Partial refresh.** Each part records when it was computed. After a price edit, only the price's time changes; the description and the reference list keep theirs.
- **Complete first visit.** The first HTML response to a page not built in advance contains the price, the description and the references, read without JavaScript.
- **Budget.** Runtime Cache usage for a full pass over the showcase, measured against Hobby's limits.

If experiment 1 shows the other parts are re-run, a new record replaces this one. The fallback is whole pages through ISR, with the edit still visible at once.

What it costs:

- **Cold caches after deployments.** Every deployment empties the remote entries, so each page's parts run again on their next visit. Traffic is low and ADR 0002 limits crawlers.
- **Waiting first visits.** A first visit to a page not built in advance waits for the full render, with the database's wake-up delay included.
- **Silent rate limit.** A refresh call over Hobby's rate limit is only logged, which is why a new generation uses the single `catalog` tag.

## Consequences

Positive:

- An edit refreshes only its part, which experiment 1 then confirms.
- First visits get complete HTML.

Negative:

- The Runtime Cache budget is shared with any other project on the owner's Hobby team.
- Each deployment starts cold.

Follow-up:

- **Experiment 1:** the three checks above.
- **End-to-end tests:** a price edit changes the price part and nothing else.
- **Security:** Next.js security releases are taken as decided in ADR 0003.
