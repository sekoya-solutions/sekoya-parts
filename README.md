# Sekoya Parts

A spare-parts e-commerce catalog built to show one thing: that a very large catalog can stay fast. It is a portfolio project, so it demonstrates the feasibility of the catalog only; most product texts are placeholders.

## Status

Bootstrap. There is no application code yet: the technical stack is being written up as Architecture Decision Records (ADRs), and nothing is implemented before the owner approves them.

## What it will demonstrate

- About 100,000 products, about 50,000 of them searchable, across four page templates: home, category listing, product page, and one page per appliance model.
- One product compatible with up to 1,000,000 appliance models. Its page shows the most popular of them as text, within Google's 2 MB crawl limit.
- Ten languages on one domain (`/fr/`, `/en/`, `/de/` and so on), with French as the source. Twelve showcase products, one per category, are translated automatically when added; the rest use placeholder text.
- A PageSpeed score of 95 or more, checked on every commit, and fine-grained cache invalidation: changing a price or a description refreshes only that part of a page.

## Running the end-to-end tests locally

`npm run test:e2e:local` runs the end-to-end tests as CI's "End-to-end tests" job does, on a throwaway PostgreSQL 18 database: migrations, the small catalog with seed 1, a production build, then Playwright. Pass Playwright's arguments after `--`, for example `npm run test:e2e:local -- e2e/intro.spec.ts`.

- **Tools,** downloaded once into the git-ignored `.tools/` folder; the command names any that is missing and downloads nothing itself:
  - PostgreSQL 18.6 in `.tools/pgsql`: EDB's `postgresql-18.6-1-windows-x64-binaries.zip` from `get.enterprisedb.com`, unpacked so that `.tools/pgsql/bin` holds `pg_ctl`;
  - Chrome Headless Shell in `.tools/ms-playwright`: `PLAYWRIGHT_BROWSERS_PATH=.tools/ms-playwright npx playwright install --only-shell chromium`.
- **Isolation:** the database is a new cluster on a free local port, with a password generated for the run, deleted when the run ends, fails or is interrupted. Every variable `.env.example` names is set by the command itself, so `.env.local`, the Neon branches and the Algolia, DeepL and Vercel keys are never used.
- **Windows:** the command makes the `.next` folder case-sensitive, as on Linux, before building: otherwise `/FR` and `/fr` share one prerendered file.

## License

All rights reserved; see [LICENSE](LICENSE).
