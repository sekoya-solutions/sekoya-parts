# Experiment 2: reference list

- Status: Done
- Issue: [#57](https://github.com/sekoya-solutions/sekoya-parts/issues/57)
- Decision tested: [ADR 0009](../adr/0009-compatible-references.md)

## Question

How many compatible references can the product page render as text while keeping a mobile PageSpeed score of 95 or more and the HTML under 1.5 MB? And do the first and last reference pages of the product with a million models read as fast as each other, straight from the index?

## Setup

- **Pages.** A temporary page, `/experiments/references/<count>`, shows product 1 with 250, 500, 1,000 or 2,000 references, using the product page's own markup (`ProductView` in `site/product.tsx`). It answered only on Vercel previews (`site/experiment.ts`, covered by `tests/experiment.test.ts`), and was removed once the number was set.
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

Run on 2026-11-12 from 15:16 to 15:23 UTC by the Lighthouse workflow (run 43246063899) against the preview of commit `19e886a`, five mobile runs per address after one warm-up request. Every page was served from the build (`PRERENDER`).

| Address | References | HTML bytes | Median score | Scores | Elements |
| --- | ---: | ---: | ---: | --- | ---: |
| `/product/1` | 500 | 118,336 | 99 | 99, 99, 100, 99, 99 | 1,039 |
| `/experiments/references/250` | 250 | 63,836 | 99 | 99, 99, 100, 99, 99 | 532 |
| `/experiments/references/500` | 500 | 118,881 | 99 | 100, 99, 99, 99, 99 | 1,039 |
| `/experiments/references/1000` | 1,000 | 229,003 | 99 | 99, 98, 98, 99, 99 | 2,053 |
| `/experiments/references/2000` | 2,000 | 449,304 | 97 | 97, 97, 97, 97, 97 | 4,081 |

- **Bytes per reference** on the preview: (449,304 − 63,836) / 1,750, about 220 bytes, browser data included, against ADR 0009's estimate of 150. 2,000 references take 0.45 MB, far below the 1.5 MB margin.
- **Elements:** 2 per reference, a list item and its link, as ADR 0009 expected, plus 32 to 81 others; 500 references already pass the 800 elements Lighthouse warns about, and 1,000 the 1,400 it flags, without dropping the score below 97.
- **Scores** stay at 98 to 100 up to 1,000 references, and drop to 97 at 2,000. The page has no styles, fonts or images yet (phase 3).
- The run's log shows the bypass secret only as GitHub's mask, and the run kept no artifacts.

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

ADR 0009's design holds, and the number changes from 500 to 1,000. Every measured count keeps a median mobile score of 95 or more and the HTML under 1.5 MB, so the ADR's rule allows 2,000. The owner chose 1,000 (2026-11-12): it scores 99, against 97 at 2,000, which leaves room for phase 3's styles, fonts and images, with half the elements. The first and last reference pages read from the index as fast as each other.

After the experiment, the temporary page was removed, `PRODUCT_PAGE_REFERENCES` set to 1,000, and the Lighthouse workflow measures `/product/1` only. Its run on commit `45a259e` (run 43248291238) gave `/product/1` 228,456 bytes, 2,053 elements and a median of 98, with scores of 87, 99, 99, 98 and 98: one run in five can fall well below the others on GitHub's runners, which the median absorbs and which the 95 threshold of the remaining CI jobs must allow for. The reference pages of phase 3 keep 500 references each, as ADR 0009 decides.
