# Experiment 3: search latency

- Status: Done
- Issue: [#119](https://github.com/sekoya-solutions/sekoya-parts/issues/119)
- Decision tested: [ADR 0010](../adr/0010-search.md)

## Question

How long does a search take, Neon's wake-up included? ADR 0010 runs the exact-match step in PostgreSQL before any Algolia query, and starts both queries at once instead if that step slows search.

## Setup

- **Flow.** A search sends the form to the search route, `/api/search`, which looks the query up among model references and answers a 307: to the model's page on an exact match, otherwise to the results page. The results page runs the model search and the Algolia query at once.
- **Timings.** The route gives its lookup's duration in a `Server-Timing` header; the results page gives its model search's and its Algolia query's durations in the `data-models-ms` and `data-parts-ms` attributes. Each duration includes getting the database connection, so Neon's wake-up shows in the first lookup after a suspension.
- **Requests.** `npm run search-latency -- <URL> --idle` (`scripts/search-latency.ts`), run from the owner's machine in France against the Preview of commit `d241437`, with the bypass header. It waited six minutes with no other traffic, past Neon's five-minute suspension: a fixed wait, since nothing a script can observe says when Neon suspends. Then six rounds, 30 seconds apart: five searches for "joint", which matches no model reference and finds 145 parts, each with its results page, then one exact model reference, which spends no Algolia search.
- **Environment.** Vercel functions in Frankfurt (`fra1`), Neon's `preview` branch in Frankfurt on the free plan, the `products_preview` index on Algolia's Europe (FR) cluster.

## Results

Run on 2026-11-14 at about 10:40 UTC. Durations in milliseconds; "total" is the request as the owner's machine saw it, network to Frankfurt included.

| Round | Route total | Route lookup | Page total | Page models | Page Algolia |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1, Neon suspended | 2,005 | 770.8 | 1,498 | 184.8 | 162.3 |
| 2 | 164 | 53.3 | 129 | 38.3 | 45.7 |
| 3 | 131 | 35.7 | 201 | 84.5 | 115.0 |
| 4 | 130 | 24.0 | 181 | 55.6 | 78.5 |
| 5 | 107 | 26.5 | 119 | 29.0 | 58.5 |
| 6, exact reference | 138 | 33.7 | — | — | — |

- **Neon's wake-up** costs about 0.7 s, once, in the route's lookup: 770.8 ms against 24 to 53 ms warm. The results page's lookup that follows took 184.8 ms, against 29 to 85 ms warm.
- **Cold functions.** Round 1's totals, 2.0 s for the route and 1.5 s for the page, hold time the lookups do not explain, most likely each function's cold start: the page's two lookups, run at once, account for 185 ms of its 1,498.
- **Algolia** answers in 46 to 115 ms warm, seen from Frankfurt, while its own processing took 1 to 6 ms on `dev`: the rest is spent outside Algolia's processing, on the way there and back. The first query after the idle period took 162 ms.
- **Warm, a search takes about 250 to 400 ms** for both requests, seen from France.
- **The exact-match redirect** answers in 107 to 164 ms warm.

## Conclusion

The exact-match step does not slow search noticeably. Warm, it costs 24 to 53 ms. Cold, Neon's 0.7 s wake-up lands in it, but starting the Algolia query at the same time would not remove that wake-up: the results page needs the database for its model list anyway, so a cold search pays it once either way. At most, the 100 to 160 ms of the Algolia query would overlap it, at the cost of one search of quota on every exact match, the most common query. The owner kept the order of ADR 0010 (2026-11-14), and the ADR records these figures.
