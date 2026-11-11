# ADR 0010: Search

- Status: Accepted
- Date: 2026-11-11
- Deciders: Owner

## Context

This Architecture Decision Record (ADR) chooses the hosted search engine and how the catalog is searched. The forces:

- **Owner decisions** ([AGENTS.md](../../AGENTS.md), section 1):
  - a hosted search engine like Algolia is mandatory;
  - it stays on a free plan unless that severely blocks feasibility;
  - about 50,000 searchable products is acceptable;
  - no third-party scripts, and a PageSpeed score of 95 or more.
- **Data.** Search fields per product: reference, generated name in ten languages, brand, category, price and popularity ([ADR 0007](0007-catalog-data-model.md)). Edits go through Payload's save hooks ([ADR 0006](0006-content-management.md)).
- **Model lookup.** Finding an appliance model among a million by its reference was left to this record ([ADR 0009](0009-compatible-references.md)).
- **Hosting.** Vercel's Hobby plan has one firewall rate-limiting rule, and secrets stay out of the public repository ([ADR 0002](0002-hosting-and-environments.md)).

### Criteria

1. Free-plan limits.
2. Ten languages.
3. Protecting the quota.
4. PageSpeed and no third-party scripts.
5. Keeping the index in sync.
6. Model search.
7. Region and lock-in.

## Options considered

Facts were checked on 2026-11-11.

- **Algolia.**
  - **Free plan.** 50,000 records and 10,000 searches a month. At the limit, Algolia may suspend the service or add its own attribution to the results ([free plan terms](https://www.algolia.com/policies/free-plan-details)). Records are limited to 10 KB, and the plan offers US, UK and EU West hosting ([pricing](https://www.algolia.com/pricing/)).
  - **Languages.** Algolia offers one index per language, or one index with a field per language that each query restricts to its own language ([multilingual search](https://www.algolia.com/doc/guides/managing-results/optimize-search-results/handling-natural-languages-nlp/how-to/multilingual-search)). Ten indices would split the records across indices, so the 50,000 records would no longer cover 50,000 products.
  - **Abuse.** A search key can be limited per IP address or per user token per hour ([API keys](https://www.algolia.com/doc/rest-api/search/add-api-key)).
  - **Server-side queries.** Queries sent from a server can pass the visitor's user token, so these limits apply to each visitor ([extra headers](https://www.algolia.com/doc/api-reference/api-methods/set-extra-header)).
- **Meilisearch Cloud** starts at $20 a month after a 14-day trial ([Meilisearch pricing](https://www.meilisearch.com/pricing)).
- **Elastic Cloud** offers a 14-day trial ([Elastic trial](https://www.elastic.co/cloud/cloud-trial-overview)), then usage-based pricing.
- **Typesense Cloud** offers a free cluster, but its permanence and limits were not confirmed.
- **Model lookup in PostgreSQL.** An index with a pattern operator class serves `LIKE` prefix searches ([operator classes](https://www.postgresql.org/docs/current/indexes-opclass.html)). A million models would exceed any free search plan, but PostgreSQL already holds them.

## Decision

Chosen:

- **Algolia's free plan, hosted in EU West,** with one index of up to 45,000 products. That leaves a margin under the 50,000 records.
  - The showcase products are always included; the others are the most popular.
- **One record per product:** reference, brand, category, price and popularity, plus one name field per language. Each query restricts the searched fields to the visitor's language, and the index and query languages are set explicitly, as Algolia recommends.
- **The record also holds the product's 500 most popular compatible model references,** normalised like the model search below. This mirrors the product page's list in ADR 0009.
  - A search for a model reference then finds the parts that fit it.
  - At about 12 bytes per reference, 500 references take about 6 KB, which keeps the record under Algolia's 10 KB.
  - Most products have only a few models, so their records hold all of them.
- **Queries go through the site's own server route,** never from the browser.
  - A search is a plain form that renders a server-side results page, so the browser runs no search code and talks to no third party.
  - The route sends a hashed visitor token with each query. Its search key allows 60 queries per hour for each token, and the key is never shown to the browser.
  - There is no search as you type, so each submitted search costs one request. Results pages are kept out of search engines.
- **Index sync.**
  - Payload's save hook updates the edited product's record.
  - The generator fills the index in batches of 1,000.
  - A whole new generation replaces records in place, so the index never holds two copies of the catalog.
- **Model search in PostgreSQL,** by prefix on the model reference normalised to upper case without spaces or dashes, through an index with a pattern operator class. Results link to the model pages.
- **One search box, one flow** on the server route:
  1. **Exact match first.** The query is normalised. If it is exactly a model reference in PostgreSQL, the visitor goes straight to that model's page, which lists every compatible part. No Algolia search is spent.
  2. **Otherwise, both searches at once,** shown on one results page:
     - matching appliance models first, from PostgreSQL's prefix lookup, each linking to its page;
     - then parts from Algolia, matched by name, reference or one of their top model references, with typo tolerance.
- **A small "Search by Algolia" text link** on the results page, plain text with no script.

Why:

- **The only confirmed permanent free plan.** It fits the owner's mandate and the 50,000-product cap.
- **One record per product** keeps the record count equal to the product count. Capping its references at 500 keeps its size within the free plan's 10 KB limit: a million references would take about 12 MB.
- **The server route** keeps the browser free of third-party requests and search code. It hides the key, and limits each visitor.
- **PostgreSQL** already holds the million models and answers a prefix search by index.
- **The flow** gives each engine what it does best. PostgreSQL gives the complete, exact list of models; Algolia gives typo-tolerant search across parts in ten languages. The PostgreSQL lookup costs nothing against the quota, and the exact-match redirect saves Algolia searches on the most common query, a reference read off an appliance's label.

What it costs, and where each cost is checked:

- **A small monthly quota.** 10,000 searches is about 330 a day. When it runs out, the results page says search is unavailable until the next month, rather than failing.
- **Conflicting free-plan figures.** Algolia's pages disagree on the number of indices (10 or 20) and show other plans elsewhere. The free plan terms above are taken as the reference, and the dashboard confirms them when the account is created.
- **Attribution.** Algolia's support pages, which could not be read, may ask free plans for its logo. The text link covers that without a script.
- **Search route cost.** Each search costs one Vercel function invocation.
- **Search latency is not measured yet.** The exact-match step runs before Algolia, so Neon's wake-up after five idle minutes would delay every search. The implementation measures both latencies, Neon's wake-up included. If the step slows search, both queries start at once, and on an exact match the Algolia result is dropped, at the cost of one search of quota.
- **Less popular models of a large product.** Searching for one of them does not find the product through Algolia. The model search finds the model, and its page lists the product.
- **Record size.** The generator checks each record's size before sending it, so a long name never pushes a record over 10 KB.

## Consequences

Positive:

- Search adds no script, no key and no third-party request to the browser.
- The model lookup costs nothing extra.

Negative:

- About 55,000 products are not searchable by name, only reachable by browsing.
- The monthly quota is small, and a determined bot spread over many addresses could still use it up.

Follow-up:

- **Implementation, with the owner's account:** create the Algolia application in EU West. Store its admin key and the limited search key as Vercel secrets.
- **Data model:** add the normalised model reference with its index.
- **Languages and search engine optimization record:** keep search results pages out of crawling and indexing.
