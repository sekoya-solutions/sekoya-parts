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
- **Requests.** Single `curl` requests with the bypass header, spaced out, never in a loop or a burst.

## Checks

1. **Partial refresh.** For product 1, built in advance, and for one product rendered on its first visit:
   - read the page and note the four times;
   - the owner edits the price in `/admin`;
   - read the page again: the new price shows, the price's time changes, and the other three keep theirs.
2. **Complete first visit.** The first HTML response to a product never visited on the deployment contains the price, the description and the references, before any script.
3. **Budget.** Runtime Cache reads and writes for a pass over ten products, read from Vercel's dashboard, compared with Hobby's monthly 1,000,000 reads and 200,000 writes of 8 KB.

## Results

Not run yet.

## Conclusion

Not reached yet.
