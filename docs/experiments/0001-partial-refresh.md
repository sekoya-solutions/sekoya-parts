# Experiment 1: partial refresh

- Status: In progress
- Issue: [#55](https://github.com/sekoya-solutions/sekoya-parts/issues/55)
- Decision tested: [ADR 0008](../adr/0008-caching-and-partial-refresh.md)

## Question

When a product's price is edited in Payload's admin, does the next visit re-run only the price part of the product page, and reuse the remote cache entries of the heading, the description and the reference list?

## Setup

- **Markers.** Each cached part renders a `data-computed-at` attribute with the time it was computed: the heading (`h1`), the price and the description (`p`), and the reference list (`ul`).
- **Refresh.** A save hook on products (`cms/hooks/revalidate-product.ts`) calls `revalidateTag(tag, { expire: 0 })` for the parts whose fields changed only, as chosen in `site/tags.ts` and covered by `tests/tags.test.ts`.
- **Where.** The protected Vercel preview of the pull request, reading the Neon `preview` branch. Edits change that branch only.
- **Who edits.** An agent, through Payload's REST API (`PATCH /api/products/<id>`) with the automation user's API key, which runs the same save hook as `/admin`. Every Preview build applies the migrations and creates or updates that user (`scripts/seed-automation-user.ts`), so nothing is done by hand per preview or after a branch reset.
- **Requests.** Single `curl` requests with the bypass header, spaced out, never in a loop or a burst.

## Checks

1. **Partial refresh.** For product 1, built in advance, and for one product rendered on its first visit:
   - read the page and note the four times;
   - an agent edits the price through the API;
   - read the page again: the new price shows, the price's time changes, and the other three keep theirs.
2. **Complete first visit.** The first HTML response to a product never visited on the deployment contains the price, the description and the references as HTML elements, which a browser shows without running JavaScript. Next.js's own script tags sit in the `<head>`, ahead of all content, so "before any script" is not a usable test.
3. **Budget.** Runtime Cache reads and writes for a pass over ten products, read from Vercel's dashboard, compared with Hobby's monthly 1,000,000 reads and 200,000 writes of 8 KB.

## Results

Run on 2026-11-12 against the preview of commit `cd0a935`, built at 10:05 UTC. Each line is one request, a few seconds apart; times are the `data-computed-at` values, in UTC.

### Automation user

`GET /api/users/me` with the key: 200, `automation@sekoya-parts.invalid`, strategy `api-key`. The preview build had applied the migration and created the user.

### Partial refresh

Product 3, rendered on its first visit:

| Request | Cache | Heading | Price | Description | References |
| --- | --- | --- | --- | --- | --- |
| 10:05:44 read | `MISS`, 1.26 s | 10:05:45.505 | 10:05:45.559, 18,90 € | 10:05:45.584 | 10:05:45.599 |
| 10:06:00 price set to 1,990 cents | 200 | | | | |
| 10:06:19 read | `REVALIDATED`, 0.19 s | 10:05:45.505 | **10:06:19.147**, 19,90 € | 10:05:45.584 | 10:05:45.599 |

Product 1, built in advance, with 500 references:

| Request | Cache | Heading | Price | Description | References |
| --- | --- | --- | --- | --- | --- |
| 10:05:38 read | `PRERENDER`, 0.59 s | 10:05:06.787 | 10:05:07.487, 8,90 € | 10:05:07.489 | 10:05:06.995 |
| 10:05:55 price set to 990 cents | 200 | | | | |
| 10:06:13 read | `REVALIDATED`, 0.74 s | **10:06:13.575** | **10:06:13.663**, 9,90 € | **10:06:13.660** | **10:06:13.604** |
| 10:06:36 price set to 1,090 cents | 200 | | | | |
| 10:06:41 read | `REVALIDATED`, 0.41 s | 10:06:13.575 | **10:06:41.665**, 10,90 € | 10:06:13.660 | 10:06:13.604 |

- On a page rendered at run time, a price edit re-ran the price only, and the next request showed the new price.
- On a page built in advance, the first edit after the deployment re-ran every part, the 500-reference query included; from the second edit on, only the price re-ran.
### Where the parts were cached

Vercel's dashboard, read at 10:26 UTC for the last 12 hours, shows **no Runtime Cache reads or writes at all**, on Preview and on Production. Its ISR view for Preview does show the morning's activity (3 tag revalidations, writes for `/product/1` and `/product/[id]`), so the dashboard is not lagging.

- Next.js's source (`next/dist/server/use-cache/handlers.js`) gives `"use cache: remote"` the handler the platform registers on `globalThis[Symbol.for('@next/cache-handlers')]`, and otherwise the server's own memory.
- So on these deployments the parts were cached in the memory of the function instance, not in the Runtime Cache. The reuse above came from one warm instance serving requests seconds apart; another instance, or a cold start, would have re-run every part.
- That also explains product 1: the parts computed during the build stayed in the build's memory. Vercel's page also says the Runtime Cache "may not share the same cache between build time and runtime" when the regions differ, which would matter once the Runtime Cache is in use.
- Why Vercel registers no remote handler for this project is not known yet.

### Complete first visit

Product 3's first response (`MISS`, 9,797 bytes) held the heading, the price, the description and its 2 references as HTML elements.

### Budget

Not measurable while the Runtime Cache is unused.

## Conclusion

Not reached. The hook refreshes only the edited part's tag, and a refreshed page shows the new price on the next request. But the reuse of the other parts came from one instance's memory, not from the shared Runtime Cache that ADR 0008 relies on, so partial refresh across instances is not shown. The next step is to find why `"use cache: remote"` does not reach the Runtime Cache on this project.

The edits left products 1 and 3 at 10,90 € and 19,90 € on the Neon `preview` branch, until its next reset.
