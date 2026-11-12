# ADR 0009: Compatible references

- Status: Accepted
- Date: 2026-11-11
- Deciders: Owner

## Context

This Architecture Decision Record (ADR) decides how the product page shows compatible references. The forces:

- **Owner requirement** ([AGENTS.md](../../AGENTS.md), section 1): only the most popular references are rendered as text, keeping the page under Google's 2 MB crawl limit, which a CI test enforces, and at a PageSpeed score of 95 or more.
- **Volume.** One product fits up to a million appliance models; the others fit a few.
- **Data and cache.** A stored popularity rank, read by index in order ([ADR 0007](0007-catalog-data-model.md)); the list is its own cached part, with the tag `product:<id>:references` ([ADR 0008](0008-caching-and-partial-refresh.md)).
- **Tests.** The 2 MB test measures uncompressed HTML in every language and fails at 2,000,000 bytes ([ADR 0004](0004-testing-and-ci.md)).
- **Crawling.** Search engines are limited to a showcase ([ADR 0002](0002-hosting-and-environments.md)).

### Criteria

1. The 2 MB limit, with a margin.
2. PageSpeed 95 on mobile.
3. Crawlable links to every compatible model.
4. Finding one model among a million.
5. Ten languages.
6. Cache and queries.
7. Proof.

## Options considered

Facts were checked on 2026-11-11.

- **Size per reference.** One reference is a link to its appliance-model page, about 70 bytes of HTML. Next.js also embeds the page's data for the browser in the HTML of the first load ([Vercel guide on document size](https://vercel.com/kb/guide/how-to-optimize-your-document-size-in-next-js)). The estimate is therefore about 150 bytes per reference, so 2 MB would allow over 10,000 references.
- **Page complexity binds first.** Lighthouse warns when the page body has more than about 800 elements, and flags an error above about 1,400 ([DOM size](https://developer.chrome.com/docs/lighthouse/performance/dom-size?hl=en)). Each reference adds at least two elements, a list item and its link, so a few hundred references already reach that range on a slow phone.
- **How many.** A fixed number is predictable and easy to test. A byte budget would adapt to name lengths, at the price of a less predictable page. Rendering a share of all references is ruled out: 10% of a million references would be about 15 MB.
- **The rest.**
  - **Paginated reference pages.** Google asks for a unique address per page, with sequential links, and the first page must not be marked as the canonical one ([pagination](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading)).
  - **A search box over the product's references** would belong to the search record.
  - **Only the model pages linking back** would leave the list unreachable from the product.
- **Markup.** A plain server-rendered list of links needs no code in the browser.

## Decision

Chosen:

- **1,000 references as text on the product page,** set by experiment 2, most popular first, in a plain list of links to the model pages. No code runs in the browser for the list.
- **Reference pages for the rest,** at `/<lang>/<product path>/models/<n>`, 500 references each. Ranks are numbered from 1 for each product, so page `n` reads ranks `(n − 1) × 500 + 1` to `n × 500` straight from the index, with no `OFFSET`.
  - Each page has its own address, with links to the previous and next pages. It does not mark the first page as canonical.
  - The product with a million models gets 2,000 pages per language. ADR 0002's showcase rule decides which of them search engines may crawl.
- **Visitors looking for their model** usually come from its model page, which lists its compatible products. A search box on the product page is left to the search record.
- **Cache.** The product page's list and every reference page carry the tag `product:<id>:references`.
- **The same list in every language:** model names are a brand and a reference, which need no translation.

Why:

- **Complexity limits come first.** At about 220 bytes per reference, 1,000 references take about 229 KB, far below 2 MB. Page complexity and the PageSpeed score limit the list long before the size does.
- **A margin for the design.** 2,000 references still score 97, but the page has no styles, fonts or images yet; 1,000 score 99 and leave room for them.
- **Simple, crawlable pagination.** Page numbers map straight to rank ranges, which gives the addresses and links Google asks for at index speed.

What [experiment 2](../experiments/0002-reference-list.md) showed, on 2026-11-12:

- **Bytes per reference:** about 220 in the HTML actually served, the browser data included, and 2 elements.
- **The PageSpeed score and element count** on mobile: a median of 99 up to 1,000 references (2,053 elements), and 97 at 2,000 (4,081 elements, 449 KB). Every count kept the score at 95 or more and the HTML under 1.5 MB, a margin below the 2 MB test. The owner chose 1,000 over 2,000, for the margin above.
- **Query times** for the first and the last reference page of the product with a million models: both read from the index, about 0.6 to 0.7 s on a first read from storage, then 1.4 to 11.6 ms.

Changing the number again updates this record, not the code's design.

## Consequences

Positive:

- The product page stays light, well within both limits.
- Every compatible model is one link away, through numbered pages read by index.

Negative:

- Most references appear on secondary pages rather than on the product page.
- The million-model product has many reference pages, which only the showcase rule keeps out of the crawl budget.

Follow-up:

- **Experiment 2:** the measurements above.
- **Languages and search engine optimization record:** the translated path for reference pages, and which of them the crawl showcase includes.
- **Search record:** a model search, available from the product page.
