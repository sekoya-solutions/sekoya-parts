# ADR 0007: Catalog data model

- Status: Proposed
- Date: 2026-11-11
- Deciders: Owner

## Context

This Architecture Decision Record (ADR) defines the catalog's data model and how its data is generated. The forces:

- **Volume.** About 100,000 products, at least 1,000,000 appliance models, and one product compatible with up to a million of them ([AGENTS.md](../../AGENTS.md), section 1).
- **Four page templates:** home, category listing, product page, and one page per appliance model.
- **Content.** About ten showcase products get real descriptions in ten languages; the others use placeholder text in every language.
- **Storage.** PostgreSQL 18 on Neon's free plan, 1 GB per project ([ADR 0005](0005-database.md)).
- **Split.** Payload manages what is edited, and the models and compatibility live in the project's own tables ([ADR 0006](0006-content-management.md)).
- **Data for CI.** The production build in continuous integration (CI) needs catalog data ([ADR 0004](0004-testing-and-ci.md)).

### Criteria

1. Simple, indexed queries for the four templates.
2. The split with Payload.
3. Popular references first, page by page.
4. Placeholder text in ten languages without a larger database.
5. A repeatable generator for production, previews and CI, within the free tier.
6. A refined size estimate.
7. The fields search will need.

## Options considered

Facts were checked on 2026-11-11.

- **Placeholder text.**
  - Stored, it would take about 500 MB: 100,000 products, ten languages, about 500 bytes each. That is half of Neon's 1 GB for text nobody reads.
  - Produced when a page is rendered, from a seed made of the product and the language, it takes no space and gives the same text on every render.
- **Popularity.**
  - A rank stored on each compatibility row lets an index return a product's models already in popularity order ([indexes and ORDER BY](https://www.postgresql.org/docs/current/indexes-ordering.html)).
  - Computed at query time, it would sort up to a million rows on every uncached render.
  - Deep pages also matter: rows skipped by `OFFSET` are still computed ([LIMIT and OFFSET](https://www.postgresql.org/docs/current/queries-limit.html)). Paging continues from the last rank seen instead.
- **Generator.**
  - PostgreSQL recommends `COPY` to load many rows in one command ([populating a database](https://www.postgresql.org/docs/current/populate.html)).
  - Payload's local programming interface creates one document per call (ADR 0006), which is too slow for 100,000 products and does not cover the project's own tables.
- **Storage across branches.** Neon bills a child branch for the changes it accumulates, capped at its data size ([Neon plans](https://neon.com/docs/introduction/plans)). A branch reset from its parent matches the parent again ([branching](https://neon.com/docs/introduction/branching)).

## Decision

Proposed:

- **Payload collections** (Payload stores localized fields in separate `_locales` tables ([PostgreSQL adapter](https://payloadcms.com/docs/database/postgres))):
  - `categories`: the part type, with a name and slug in ten languages;
  - `brands`;
  - `products`: reference, brand, category, price in euro cents and a showcase flag. Names and descriptions in ten languages are filled only for showcase products.
- **Project tables:**
  - `appliance_models`: brand, reference and appliance type, about a million rows;
  - `compatibility`: product, model and popularity rank (1 is the most popular). Its key, product then rank, serves the product page; a second index, model then product, serves the model page.
- **Generated text.**
  - An ordinary product's name is built from its part type's translated name, its brand and its reference.
  - Its placeholder description is produced at render time from a seed of the product and the language.
  - Nothing of either is stored.
- **One generator script:**
  - A seeded random generator gives the same catalog every time.
  - It loads every table with `COPY`, Payload's included.
  - A test reads a sample back through Payload to confirm Payload sees the rows.
- **Branches.**
  - The generator fills Neon's main branch once.
  - The `preview` and `dev` branches are reset from main rather than filled again, so they add little storage.
  - CI runs the same script into its own database at a smaller scale, keeping the one product with a million models.
- **For search later:** reference, generated name in each language, brand, category, price and a popularity score per product.

Why:

- **Storage.** Generated text and names cost no storage, and stay identical between renders, tests and cache refreshes.
- **Speed.** A stored rank and two indexes make each template a short index range scan.
- **Loading.** `COPY` is PostgreSQL's own fast path for loading.

**Refined size: about 300 MB with indexes.** It assumes:

- **Compatibility:** 1.5 million rows, at about 90 bytes per row including both indexes.
- **Models:** a million, at about 120 bytes each with their index.
- **Products, categories and brands:** about 30 MB.

That leaves room within the 1 GB, with branches reset from main.

What it costs, and where each cost is checked:

- **Writing into Payload's tables** ties the generator to Payload's schema. The read-back test catches a mismatch after each Payload upgrade.
- **Generated names** are less varied than hand-written ones, which suits a demonstration of scale.
- **Measured size and query times** come from the first full generation and experiment 2.

## Consequences

Positive:

- The catalog fits Neon's free tier with room to spare.
- The same seed rebuilds the same catalog anywhere.
- Each template reads a few rows through an index.

Negative:

- The generator depends on Payload's table layout.
- The preview and dev branches must be reset from main after each new generation.

Follow-up:

- **Experiment 2:** query times on the compatibility table, and the reference list's size.
- **Caching record:** tags per product part.
- **Languages and search engine optimization record:** slugs in each language.
- **Search record:** the index built from the fields above.
