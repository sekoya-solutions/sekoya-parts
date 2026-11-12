# Roadmap

Where Sekoya Parts stands and what comes next. Agents read this file at the start of a session, after [AGENTS.md](../AGENTS.md), and update it whenever a step is done or the plan changes.

## Status on 2026-11-12

- **Repository:** rules in `AGENTS.md`, the pull request template, the chat-history opt-in, labels, branch protection on `main`, and the [Sekoya Parts board](https://github.com/users/sekoya-solutions/projects/3).
- **Stack decided:** the twelve Architecture Decision Records (ADRs) are accepted. They are listed in the [ADR index](adr/README.md) and summed up in the stack line of `AGENTS.md`, section 1. The Stack ADRs epic ([#3](https://github.com/sekoya-solutions/sekoya-parts/issues/3)) is closed.
- **Phase 1 done:** epic [#30](https://github.com/sekoya-solutions/sekoya-parts/issues/30).
  - Node 26.13.1 is verified and unpacked into `.tools/node` on the owner's machine, and the toolchain files are written ([#31](https://github.com/sekoya-solutions/sekoya-parts/issues/31)).
  - The first CI workflow runs Markdown lint on every pull request, as a required check ([#33](https://github.com/sekoya-solutions/sekoya-parts/issues/33)).
  - The Neon database exists, created by the owner through the Storage tab of their Vercel account, on Neon's free plan, in AWS Europe Central 1 (Frankfurt), with PostgreSQL 18 ([#35](https://github.com/sekoya-solutions/sekoya-parts/issues/35)). It holds no data yet.
- **Phase 2 started:** epic [#37](https://github.com/sekoya-solutions/sekoya-parts/issues/37).
  - A bare Next.js skeleton: one placeholder page, `vercel.json` with functions in `fra1`, and a CI job running Biome, the type check and the build ([#38](https://github.com/sekoya-solutions/sekoya-parts/issues/38)).
  - It runs Next.js 16.4.5 until 16.4.6, the version ADR 0003 pins, passes the three-day release age ([#39](https://github.com/sekoya-solutions/sekoya-parts/issues/39)).
  - The Vercel project serves the placeholder page at `https://sekoya-parts.vercel.app/`, behind the firewall settings of phase 2, step 1, and the Neon database is connected for Production ([#41](https://github.com/sekoya-solutions/sekoya-parts/issues/41)). PageSpeed Insights scores the placeholder 100 in all four categories, on mobile and desktop.
  - Payload 3.93.0 runs inside the app, with the catalog schema created by committed migrations ([#45](https://github.com/sekoya-solutions/sekoya-parts/issues/45)). The admin is at `/admin`.
  - The seeded catalog generator loaded Neon's `main` at the small scale, and the `preview` and `dev` branches were reset from it ([#46](https://github.com/sekoya-solutions/sekoya-parts/issues/46)). Each holds 1,000 products, 1,000,000 appliance models and 1,004,373 compatibility rows, in 220 MB of the free plan's 1 GB. The generator and Vitest also run in CI against a PostgreSQL 18 container.
  - Required checks on `main`: "Markdown lint", "Lint, types and build" and "Generator and tests" ([#50](https://github.com/sekoya-solutions/sekoya-parts/issues/50)).
  - A product page at the temporary address `/product/<id>`, built from three cached parts, runs on a protected preview ([#47](https://github.com/sekoya-solutions/sekoya-parts/issues/47)). The minimal app is complete.
- **Not set up yet:** no Algolia or DeepL account for Sekoya Parts.
- **Shared Hobby limits:** the owner's Vercel Hobby account holds other projects, which share its monthly limits, the Runtime Cache included ([ADR 0002](adr/0002-hosting-and-environments.md)).

## Next phases

Each step follows the usual flow: an issue, a branch, a pull request, then the owner's go ([AGENTS.md](../AGENTS.md), section 5). Each phase gets an epic issue on the board when it starts.

### Phase 1, done: setup and the first CI check

1. **Done: downloads, each approved first.** The Node 26.13.1 Windows archive, its signed checksums and Node's release keys ([ADR 0003](adr/0003-toolchain.md)). The checksum list was verified with `gpgv` and the archive against it, then the archive was unpacked into `.tools/node`. A later Node security release is downloaded the same way, with its file name, size and checksum given again.
2. **Done: toolchain files.**
   - `.node-version` and `.npmrc` (install scripts off, a three-day minimum release age, exact versions);
   - a `package.json` with `engines.node` set to `26.x`;
   - `node_modules` and the Next.js build folder added to `.gitignore`.
3. **Done: Markdown lint.** The markdownlint-cli2 workflow, made a required check on `main` ([ADR 0004](adr/0004-testing-and-ci.md), [#33](https://github.com/sekoya-solutions/sekoya-parts/issues/33)). It replaces the manual check of Markdown files in `AGENTS.md`, section 4. `package.json` overrides markdownlint to 0.42.1 for a re2js security fix; the override is removed once markdownlint-cli2 requires 0.42.1 or later.
4. **Done: the Neon database,** created by the owner in Frankfurt with PostgreSQL 18 ([ADR 0005](adr/0005-database.md)). The Vercel project and the Neon branches moved to phase 2: before an app exists, importing the repository would publish its files on a public production address, and a branch of the empty database would hold nothing.

### Phase 2: a walking skeleton and the two experiments

1. **Hosting** ([#41](https://github.com/sekoya-solutions/sekoya-parts/issues/41)):
   - **Done: the Vercel project,** created by the owner in their Hobby account from this repository, with the Vercel GitHub app limited to selected repositories ([ADR 0002](adr/0002-hosting-and-environments.md)):
     - production at `https://sekoya-parts.vercel.app/`, with functions in `fra1`, set by the committed `vercel.json`;
     - previews protected by Vercel Authentication, Standard Protection;
     - the firewall: Bot Protection on Log, AI Crawlers denied, and one rate-limiting rule (per IP address, 300 requests in a fixed 60-second window, answered with 429, on every path except `/_next/static/`). The rule is checked on its configuration only: a test from one machine was challenged by Vercel's platform protection before the rule reached 300.
   - **Done: the database connected to the project** (ADR 0005): environment variables for Production only, under the `DATABASE_` prefix, and no database branch per deployment. The app reads `DATABASE_URL` (pooled) at runtime and `DATABASE_URL_UNPOOLED` for migrations and bulk loads.
   - **Done: the `dev` branch,** created by the owner from the empty `main` with auto-delete off (Neon's dialog defaults to one day), its connection strings and `PAYLOAD_SECRET` in a git-ignored `.env.local`. Reset from the loaded `main` after #46.
   - **Done: the `preview` branch,** reset from the loaded `main` after #46, with auto-delete off. Vercel's Preview environment has its own sensitive `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `PAYLOAD_SECRET`, set by hand: the Neon integration can only give previews `main` or a new branch per deployment.
   - **Done: Protection Bypass for Automation** (#47). The owner created an "Agent checks" secret, kept in the git-ignored `.env.local` as `VERCEL_AUTOMATION_BYPASS_SECRET`, so agents read protected previews without a sign-in: a Vercel sign-in in the desktop app's browser pane did not carry over to the next session. The secret also skips the firewall's mitigations and bot protection, so it never goes in a URL or a reply.
   - **Later: a separate bypass secret for CI,** added by the owner as a GitHub Actions secret when the Lighthouse job is built, so each can be revoked on its own.
2. **A minimal app,** in three issues:
   - **Done: Payload 3 and the catalog schema** ([#45](https://github.com/sekoya-solutions/sekoya-parts/issues/45)):
     - Payload 3.93.0 in the `app/(payload)` route group, the site in `app/(site)`, GraphQL off;
     - the collections of [ADR 0007](adr/0007-catalog-data-model.md) in ten languages, and the project tables `appliance_models` and `compatibility` in a hand-written migration;
     - the schema only from committed migrations, run by `npm run payload -- migrate` over `DATABASE_URL_UNPOOLED`;
     - Vercel's Production builds apply pending migrations before `next build` (`scripts/build.js`); previews, CI and local builds skip them;
     - `package.json` overrides `dompurify` to 3.4.17, since `monaco-editor` 0.57.0 pins a version with known flaws; the override is removed once `monaco-editor` requires a fixed version.
   - **Done: the generator at a small scale** ([#46](https://github.com/sekoya-solutions/sekoya-parts/issues/46)):
     - `catalog/generator.ts` builds every row from a seed and a scale, without a database; `npm run generate` (`scripts/generate.ts`) loads them with `COPY` in one transaction over `DATABASE_URL_UNPOOLED`, and refuses a filled catalog without `--replace`;
     - every scale has 1,000,000 appliance models and one product compatible with all of them; the small scale has 1,000 products and 20 brands, the full scale 100,000 and 60;
     - no product is a showcase product yet, so no product text is stored;
     - the "Generator and tests" CI job runs the migrations, the generator at the small scale and Vitest on every pull request;
     - the load of Neon's `main` took 23.9 s from the owner's machine (24.3 s in CI), for 212 MB of catalog tables with their indexes; the million models make most of that size at every scale.
   - **Done: one product page** ([#47](https://github.com/sekoya-solutions/sekoya-parts/issues/47)), built from the per-part cached components of [ADR 0008](adr/0008-caching-and-partial-refresh.md):
     - `app/(site)/product/[id]` at the temporary address `/product/<id>`, in French; language routing replaces it in phase 3;
     - the price, the description and the reference list in `site/product.tsx`, each with `"use cache: remote"`, `cacheLife('max')`, its own tag and `catalog`; the heading is a cached read with the description's tag, which also gives a missing product its 404;
     - the reference list takes only the product id, so the ten languages will share its entry, and reads ranks 1 to 500 on the `compatibility` key; its links point to `/model/<id>`, the model template of phase 3;
     - placeholder descriptions from `catalog/text.ts`, seeded by the product and the language;
     - product 1, with a million models, is built in advance, so every build reads the catalog: the "Lint, types and build" job now loads the small catalog into its own PostgreSQL container first;
     - the HTML of product 1 is 117,828 bytes with its 500 references, about 235 bytes per reference, against ADR 0009's estimate of 150.
   - **Next: experiment 1** on that page.
3. **Experiment 1, partial refresh** (ADR 0008):
   - only the edited part is recomputed;
   - the first-visit HTML is complete without JavaScript;
   - Runtime Cache usage is measured.

   If it fails, a new ADR replaces ADR 0008 with whole-page caching.
4. **Experiment 2, reference list** ([ADR 0009](adr/0009-compatible-references.md)):
   - bytes per reference;
   - PageSpeed and element count for 250 to 2,000 references;
   - query times for the first and last reference pages.

   The number of references is set from the results.
5. **The remaining CI jobs,** as their code appears:
   - Biome, the type check and the build, which run since the skeleton (#38) as the required "Lint, types and build" check, against the small catalog since #47;
   - Vitest, with the first tests, in the "Generator and tests" job since #46, required on `main` since #50;
   - Playwright and the 2 MB test;
   - Lighthouse on previews.

   The first pull request after setup checks that the Lighthouse result appears on it, before that check is made required (ADR 0004).

### Phase 3: the catalog

- The full generator, the four page templates and the reference pages.
- Payload's admin, its hooks and the DeepL translation job ([ADR 0006](adr/0006-content-management.md), [ADR 0011](adr/0011-languages-and-seo.md)).
- Translated addresses, `hreflang`, the showcase sitemap and `robots.txt` (ADR 0011).
- Algolia's index and the single search flow ([ADR 0010](adr/0010-search.md)), with search latency measured.
- The design, images and fonts ([ADR 0012](adr/0012-front-end-assets.md)).
- Bot Protection switched from Log to Challenge before the catalog pages go public, once the firewall logs show how CI, PageSpeed Insights and the agents' checks are treated, with a fix for any of them that would be challenged.

## Decisions open for the owner

- **Vercel Hobby's terms:** whether a freelance portfolio counts as commercial use (ADR 0002).
- **Design:** the typeface, colours, logo and layouts (ADR 0012).
- **The showcase:** the ten showcase products, and the pages search engines may crawl (ADR 0002, ADR 0011).
- **Images:** the 50 or so original or CC0 images, with their licences.

## Working notes for a new session

- **Where decisions live:** `AGENTS.md` for the standing rules, the ADRs for technical decisions, this file for the plan. The latest chat-history entries arrive with the session-start context; older ones are in `docs/chat-history/`, which only exists locally.
- **Each pull request:**
  - write its body to a file without a byte-order mark and pass it with `--body-file`;
  - after each edit, fetch the saved body back and compare it with the file;
  - before merging, check that `closingIssuesReferences` lists the issue;
  - merge with `--match-head-commit`;
  - then tick the issue's criteria against `main`.
- **Accepting an ADR:**
  - set its status and its index row to Accepted;
  - change its decision line from Proposed to Chosen;
  - update the stack line in `AGENTS.md`.
- **Checking a protected preview:** single `curl` requests with the `x-vercel-protection-bypass` header, its value read from `.env.local` and never printed; the preview's address is in Vercel's comment on the pull request.
- **The board** sometimes adds new issues by itself. Look up the item before adding it, and set its Status.
- **Research:** facts come from official pages only, with a subagent on Sonnet for broad reading. Decisive facts are re-checked on the page before an ADR cites them.
