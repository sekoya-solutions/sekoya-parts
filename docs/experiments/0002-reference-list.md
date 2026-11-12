# Experiment 2: reference list

- Status: In progress
- Issue: [#57](https://github.com/sekoya-solutions/sekoya-parts/issues/57)
- Decision tested: [ADR 0009](../adr/0009-compatible-references.md)

## Question

How many compatible references can the product page render as text while keeping a mobile PageSpeed score of 95 or more and the HTML under 1.5 MB? And do the first and last reference pages of the product with a million models read as fast as each other, straight from the index?

## Setup

- **Pages.** A temporary page, `/experiments/references/<count>`, shows product 1 with 250, 500, 1,000 or 2,000 references, using the product page's own markup (`ProductView` in `site/product.tsx`). It answers only on Vercel previews (`site/experiment.ts`, covered by `tests/experiment.test.ts`), and is removed once the number is set.
- **PageSpeed.** The Lighthouse workflow (`.github/workflows/lighthouse.yml`) runs on each ready preview, on GitHub's runners. `scripts/lighthouse.ts` sends one warm-up request per address, then runs Lighthouse CI 0.16.0 (Lighthouse 13.6.0) five times per address with its default mobile settings, which PageSpeed Insights also uses, and the bypass header. It reports the uncompressed HTML size, the median performance score, the five scores and the element count from Lighthouse's DOM size insight.
- **Requests.** Six page loads per address and preview, one after another. The reports hold the bypass header, so they are deleted and never uploaded.
- **Queries.** `EXPLAIN (ANALYZE, BUFFERS)` of the reference list's own query, read-only, for ranks 1 to 500 and 999,501 to 1,000,000 of product 1.

## Results

### Sizes from a local build

A local build with `VERCEL_ENV=preview`, against the Neon `dev` branch, prerendered:

| References | HTML bytes |
| ---: | ---: |
| 250 | 63,704 |
| 500 | 118,749 |
| 1,000 | 228,871 |
| 2,000 | 449,172 |

Each reference adds about 220 bytes, browser data included: (449,172 − 63,704) / 1,750. Without `VERCEL_ENV=preview`, each of the four pages is stored with status 404.

### PageSpeed and element count

To be filled from the Lighthouse workflow on the preview.

### Query times

Run on 2026-11-12 against the Neon `dev` branch, reset from the same loaded `main` as `preview`, with the same tables and indexes: only `dev`'s connection strings are on the owner's machine. `EXPLAIN ANALYZE` times the query inside PostgreSQL 18.6, so where it is sent from does not change them. Product 1 has 1,000,000 ranks.

| Reference page | Ranks | First run | Next three runs | Plan |
| --- | --- | ---: | ---: | --- |
| First | 1 to 500 | 694 ms | 11.5 to 11.6 ms | bitmap index scan on `compatibility_pkey` |
| Last | 999,501 to 1,000,000 | 561 ms | 1.4 to 1.9 ms | index scan on `compatibility_pkey` |

- Both pages read their 500 ranks from the `compatibility` key, with no `OFFSET`: the last page is no slower than the first.
- On a first run, almost all of the time is spent reading the 500 appliance models from Neon's storage (850 to 960 pages read); once they are in memory, the queries take milliseconds. The list is cached after it is first computed, so a visitor meets this cost only when a list is recomputed.
- For the first page, the planner expects about 4,400 rows instead of 500 and chooses a parallel plan; it stays at about 11 ms when warm.

## Conclusion

To be written once the PageSpeed figures are in.
