# Roadmap

Where Sekoya Parts stands and what comes next. Agents read this file at the start of a session, after [AGENTS.md](../AGENTS.md), and update it whenever a step is done or the plan changes.

## Status on 2026-11-14

- **Repository:** rules in `AGENTS.md`, the pull request template, the chat-history opt-in, labels, branch protection on `main`, and the [Sekoya Parts board](https://github.com/users/sekoya-solutions/projects/3).
- **Stack decided:** the twelve Architecture Decision Records (ADRs) are accepted. They are listed in the [ADR index](adr/README.md) and summed up in the stack line of `AGENTS.md`, section 1. The Stack ADRs epic ([#3](https://github.com/sekoya-solutions/sekoya-parts/issues/3)) is closed.
- **Phase 1 done:** epic [#30](https://github.com/sekoya-solutions/sekoya-parts/issues/30).
  - Node 26.13.1 is verified and unpacked into `.tools/node` on the owner's machine, and the toolchain files are written ([#31](https://github.com/sekoya-solutions/sekoya-parts/issues/31)).
  - The first CI workflow runs Markdown lint on every pull request, as a required check ([#33](https://github.com/sekoya-solutions/sekoya-parts/issues/33)).
  - The Neon database exists, created by the owner through the Storage tab of their Vercel account, on Neon's free plan, in AWS Europe Central 1 (Frankfurt), with PostgreSQL 18 ([#35](https://github.com/sekoya-solutions/sekoya-parts/issues/35)). It holds no data yet.
- **Phase 2 done:** epic [#37](https://github.com/sekoya-solutions/sekoya-parts/issues/37).
  - A bare Next.js skeleton: one placeholder page, `vercel.json` with functions in `fra1`, and a CI job running Biome, the type check and the build ([#38](https://github.com/sekoya-solutions/sekoya-parts/issues/38)).
  - It runs Next.js 16.4.6, the version ADR 0003 pins, installed once it passed the three-day release age ([#39](https://github.com/sekoya-solutions/sekoya-parts/issues/39)).
  - The Vercel project serves the placeholder page at `https://sekoya-parts.vercel.app/`, behind the firewall settings of phase 2, step 1, and the Neon database is connected for Production ([#41](https://github.com/sekoya-solutions/sekoya-parts/issues/41)). PageSpeed Insights scores the placeholder 100 in all four categories, on mobile and desktop.
  - Payload 3.93.0 runs inside the app, with the catalog schema created by committed migrations ([#45](https://github.com/sekoya-solutions/sekoya-parts/issues/45)). The admin is at `/admin`.
  - The seeded catalog generator loaded Neon's `main` at the small scale, and the `preview` and `dev` branches were reset from it ([#46](https://github.com/sekoya-solutions/sekoya-parts/issues/46)). Each holds 1,000 products, 1,000,000 appliance models and 1,004,373 compatibility rows, in 220 MB of the free plan's 1 GB; phase 3 replaced it with the full catalog. The generator and Vitest also run in CI against a PostgreSQL 18 container.
  - Required checks on `main`: "Markdown lint", "Lint, types and build" and "Generator and tests" ([#50](https://github.com/sekoya-solutions/sekoya-parts/issues/50)), "End-to-end tests" since [#60](https://github.com/sekoya-solutions/sekoya-parts/issues/60), and "Lighthouse" and Vercel's "Vercel" status since [#61](https://github.com/sekoya-solutions/sekoya-parts/issues/61).
  - A product page at the temporary address `/product/<id>`, built from three cached parts, runs on a protected preview ([#47](https://github.com/sekoya-solutions/sekoya-parts/issues/47)). The minimal app is complete.
  - Experiment 1 confirmed partial refresh through the Runtime Cache ([#55](https://github.com/sekoya-solutions/sekoya-parts/issues/55)); agents edit content on previews through an automation user that every Preview build creates.
  - Experiment 2 set the product page's reference list to 1,000 references, and Lighthouse runs on every preview ([#57](https://github.com/sekoya-solutions/sekoya-parts/issues/57)).
  - Playwright's end-to-end tests and the 2 MB test run on every pull request, against a production build in CI ([#60](https://github.com/sekoya-solutions/sekoya-parts/issues/60)).
  - Each preview's Lighthouse scores, in the four categories, appear in a "Lighthouse scores" check and in one comment on the pull request, with the redacted reports to download ([#59](https://github.com/sekoya-solutions/sekoya-parts/issues/59)). Since [#96](https://github.com/sekoya-solutions/sekoya-parts/issues/96), that is one check per page, named by its template, with a coloured symbol per score.
  - The "Lighthouse" check fails below a median mobile performance of 95, and is required on `main` ([#61](https://github.com/sekoya-solutions/sekoya-parts/issues/61)).
  - Lighthouse also measures each Production deployment of `main`, at the public address ([#67](https://github.com/sekoya-solutions/sekoya-parts/issues/67)).
- **Phase 3 in progress:** epic [#72](https://github.com/sekoya-solutions/sekoya-parts/issues/72).
  - Every page is under its language, with translated addresses and language tags; the product page is at its final address, and `/` lists the ten languages ([#73](https://github.com/sekoya-solutions/sekoya-parts/issues/73)).
  - Model pages and numbered reference pages, in the ten languages ([#79](https://github.com/sekoya-solutions/sekoya-parts/issues/79)).
  - Category pages, 48 products each, and a home page listing the categories, in the ten languages ([#81](https://github.com/sekoya-solutions/sekoya-parts/issues/81)).
  - Neon's `main`, `preview` and `dev` hold the full catalog: 100,000 products, 60 brands, 1,000,000 appliance models and 1,451,992 compatibility rows, in a 273 MB database ([#77](https://github.com/sekoya-solutions/sekoya-parts/issues/77)). CI keeps the small catalog.
  - Twelve showcase products, one per category, with French names and descriptions loaded by the generator ([#98](https://github.com/sekoya-solutions/sekoya-parts/issues/98)).
  - The home page lists them below the categories ([#111](https://github.com/sekoya-solutions/sekoya-parts/issues/111)).
  - A daily DeepL translation sweep translates them into the nine other languages, with a translation memory that keeps DeepL's 1,000,000 free characters for new and changed text only ([#104](https://github.com/sekoya-solutions/sekoya-parts/issues/104)). Production serves the ten languages since `f1c0f05`, and 91,220 of the 1,000,000 characters are spent.
  - The home, category and model pages open with a text introduction and load right-sized card images: 98 to 100 on every measured page ([#87](https://github.com/sekoya-solutions/sekoya-parts/issues/87)).
- **Documentation-only pull requests** run Markdown lint only: Vercel skips their build, the three other CI jobs are skipped, and a stand-in "Lighthouse" check passes in place of the measurement ([#91](https://github.com/sekoya-solutions/sekoya-parts/issues/91), ADR 0004).
- **Documentation-only pushes** to a pull request that already changes code run Markdown lint only too, when every check on the previous head passed: Vercel skips the build when only `.md` files changed since the branch's last preview, and the stand-in copies that preview's Lighthouse result ([#106](https://github.com/sekoya-solutions/sekoya-parts/issues/106), ADR 0004).
- **Search:** a search box on every page finds appliance models in PostgreSQL, and an exact model reference leads straight to its page ([#113](https://github.com/sekoya-solutions/sekoya-parts/issues/113)).
- **Algolia:** one application on the free plan, in EU West, with one index per environment: `products_production` (45,000 records), `products_preview` and `products_dev` (2,000 each), each with its own write and search keys limited to its index ([#115](https://github.com/sekoya-solutions/sekoya-parts/issues/115)). The three hold 45,000, 2,000 and 2,000 records, kept in step with Payload's edits; the results page does not query Algolia yet.
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

### Phase 2, done: a walking skeleton and the two experiments

1. **Hosting** ([#41](https://github.com/sekoya-solutions/sekoya-parts/issues/41)):
   - **Done: the Vercel project,** created by the owner in their Hobby account from this repository, with the Vercel GitHub app limited to selected repositories ([ADR 0002](adr/0002-hosting-and-environments.md)):
     - production at `https://sekoya-parts.vercel.app/`, with functions in `fra1`, set by the committed `vercel.json`;
     - previews protected by Vercel Authentication, Standard Protection;
     - the firewall: Bot Protection on Log, AI Crawlers denied, and one rate-limiting rule (per IP address, 300 requests in a fixed 60-second window, answered with 429, on every path except `/_next/static/`). The rule is checked on its configuration only: a test from one machine was challenged by Vercel's platform protection before the rule reached 300.
   - **Done: the database connected to the project** (ADR 0005): environment variables for Production only, under the `DATABASE_` prefix, and no database branch per deployment. The app reads `DATABASE_URL` (pooled) at runtime and `DATABASE_URL_UNPOOLED` for migrations and bulk loads.
   - **Done: the `dev` branch,** created by the owner from the empty `main` with auto-delete off (Neon's dialog defaults to one day), its connection strings and `PAYLOAD_SECRET` in a git-ignored `.env.local`. Reset from the loaded `main` after #46.
   - **Done: the `preview` branch,** reset from the loaded `main` after #46, with auto-delete off. Vercel's Preview environment has its own sensitive `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `PAYLOAD_SECRET`, set by hand: the Neon integration can only give previews `main` or a new branch per deployment.
   - **Done: Protection Bypass for Automation** (#47). The owner created an "Agent checks" secret, kept in the git-ignored `.env.local` as `VERCEL_AUTOMATION_BYPASS_SECRET`, so agents read protected previews without a sign-in: a Vercel sign-in in the desktop app's browser pane did not carry over to the next session. The secret also skips the firewall's mitigations and bot protection, so it never goes in a URL or a reply.
   - **Done: the Vercel Toolbar off for pre-production deployments** (project settings, owner, 2026-11-12, [#59](https://github.com/sekoya-solutions/sekoya-parts/issues/59)). Its script, from `vercel.live`, set a third-party cookie in some Lighthouse runs and cost about 23 best-practices points. The documented `x-vercel-skip-toolbar` header did not keep it out of Lighthouse's browser. Each Lighthouse run now fails if the page requests `vercel.live`.
   - **Done: a separate bypass secret for CI** ([#57](https://github.com/sekoya-solutions/sekoya-parts/issues/57)): the owner's "CI checks" secret, the GitHub Actions secret `VERCEL_AUTOMATION_BYPASS_SECRET`, so it can be revoked apart from the agents' "Agent checks" secret.
2. **A minimal app,** in three issues:
   - **Done: Payload 3 and the catalog schema** ([#45](https://github.com/sekoya-solutions/sekoya-parts/issues/45)):
     - Payload 3.93.0 in the `app/(payload)` route group, the site in `app/(site)`, GraphQL off, and since [#88](https://github.com/sekoya-solutions/sekoya-parts/issues/88) its telemetry off, so the server sends no usage data to `telemetry.payloadcms.com` (owner decision);
     - the collections of [ADR 0007](adr/0007-catalog-data-model.md) in ten languages, and the project tables `appliance_models` and `compatibility` in a hand-written migration;
     - the schema only from committed migrations, run by `npm run payload -- migrate` over `DATABASE_URL_UNPOOLED`;
     - Vercel's Production builds apply pending migrations before `next build` (`scripts/build.js`); CI and local builds skip them, and since [#55](https://github.com/sekoya-solutions/sekoya-parts/issues/55) Preview builds apply them to the shared `preview` branch too;
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
   - since experiment 2 ([#57](https://github.com/sekoya-solutions/sekoya-parts/issues/57)), the page renders 1,000 references.
3. **Done: experiment 1, partial refresh** (ADR 0008, [#55](https://github.com/sekoya-solutions/sekoya-parts/issues/55), [report](experiments/0001-partial-refresh.md)):
   - only the edited part is recomputed: the parts are stored in Vercel's Runtime Cache in `fra1` (Next.js's debug log), and a price edit re-runs the price only; on a page built in advance, the first refresh after each deployment re-runs every part once;
   - the first-visit HTML holds every part as HTML elements;
   - a first visit costs about 4 Runtime Cache reads and 4 writes, so the showcase fits Hobby's limits many times over.

   ADR 0008 holds. The parts carry `data-computed-at` markers, a save hook on products refreshes only the changed parts, and the report is [experiment 1](experiments/0001-partial-refresh.md). Agents edit prices through Payload's API as an automation user, which every Preview build creates or updates with the Preview variable `AUTOMATION_API_KEY`; production has no such user. Since all previews share the `preview` branch, a migration from an unmerged branch stays applied there until the branch is reset.
4. **Done: experiment 2, reference list** ([ADR 0009](adr/0009-compatible-references.md), [#57](https://github.com/sekoya-solutions/sekoya-parts/issues/57), [report](experiments/0002-reference-list.md)):
   - about 220 bytes and 2 elements per reference;
   - a median mobile score of 99 up to 1,000 references, and 97 at 2,000 (449 KB);
   - the first and last reference pages of product 1 read from the index, 1.4 to 11.6 ms once in memory.

   The owner set 1,000 references on the product page, keeping a margin for phase 3's design; ADR 0009 is updated. The Lighthouse workflow (Lighthouse CI 0.16.0) runs on each ready preview through `deployment_status`, which Vercel sends only while the project's "`deployment_status` Events" Git setting is on, with the owner's "CI checks" bypass secret as the GitHub Actions secret `VERCEL_AUTOMATION_BYPASS_SECRET`. It reports figures only.

   **Accepted audit finding (owner decision, 2026-11-12):** Lighthouse CI brings `basic-ftp` 5.3.1 (through `proxy-agent`, `pac-proxy-agent` and `get-uri`), which `npm audit` flags as high for a slow FTP directory-listing parser. It runs in CI only, never on the site, and only when listing an FTP server's files through a proxy, which Lighthouse CI never does here. No override: the fix is in `basic-ftp` 6, outside the range every `get-uri` release supports. Revisit when `get-uri` requires `basic-ftp` 6.2.1 or later.
5. **The remaining CI jobs,** as their code appears:
   - Biome, the type check and the build, which run since the skeleton (#38) as the required "Lint, types and build" check, against the small catalog since #47;
   - Vitest, with the first tests, in the "Generator and tests" job since #46, required on `main` since #50;
   - Playwright and the 2 MB test, in the "End-to-end tests" job since [#60](https://github.com/sekoya-solutions/sekoya-parts/issues/60): Playwright 1.65.0 runs Chromium's headless shell, installed on the runner only, against the job's own build and small catalog. The 2 MB test measured `/product/1`, which renders the full 1,000 references (228,324 bytes); since [#73](https://github.com/sekoya-solutions/sekoya-parts/issues/73) it measures product 1 in the ten languages, and end-to-end tests of partial refresh and of the templates come with their code;
   - Lighthouse on previews, as a "Lighthouse" check that appears on the pull request (seen on #58). Since [#61](https://github.com/sekoya-solutions/sekoya-parts/issues/61), it fails when an address's median mobile performance is below 95, and the summary names the address and its score. Each address gets one request to check the preview answers, one Lighthouse warm-up run that is not counted, then five runs, one after another. It is required on `main`, with Vercel's "Vercel" status, each pinned to its app (GitHub Actions, Vercel): a pull request merges only once its preview is deployed and measured. A pull request from a fork stays blocked until the owner lets Vercel deploy it, and a failed deployment fails the "Vercel" status. Since [#59](https://github.com/sekoya-solutions/sekoya-parts/issues/59), the workflow also:
     - posts a "Lighthouse scores" check, passing or failing with the threshold, whose title gives the median of each category (performance, accessibility, best practices, SEO), and keeps one comment up to date on the open pull request whose head is the deployed commit, through the workflow's own token;
     - uploads the HTML and JSON reports of every run as the `lighthouse-reports-<commit>` artifact, kept 30 days and downloadable by any signed-in GitHub user. Each report is rebuilt from its result with the extra headers removed, then checked for the secret and the header's name; no other report leaves the job (`scripts/lighthouse-report.ts`, tested by Vitest);
     - leaves `is-crawlable` and `robots-txt` out of the SEO score (owner decision): they fail only because a preview is protected, through Vercel's `X-Robots-Tag: noindex` and its sign-in redirect on `robots.txt`. Phase 3 tests the site's own `robots.txt` and indexing rules.

     First figures, on `905ce0d`: performance 99, accessibility 95, best practices 96 (the missing `/favicon.ico`, fixed with ADR 0012's icon), SEO 100.

     Two findings of #61, from the reports of run 43272369772:
     - **The low first run** (92 against 100) came from the runner, not the preview: the same requests and sizes, but twice the main-thread work and a benchmark index of 1,996 against about 2,950. Lighthouse CI starts a new Chrome for every run, and only the first one runs on a cold runner, hence the warm-up run.
     - **The 307** before each page is made by Chrome itself, not by Vercel: HTTP/1.1 with 127 bytes of headers and no body, before an HTTP/2 200 on the same address. It most likely comes from the bypass header, which Lighthouse sends through Chrome's `Network.setExtraHTTPHeaders`. Lighthouse counts it as a redirect of about 770 ms in every run, so preview scores are a little stricter than a visitor's page load. It stays: avoiding it would put the secret in the address.

   - Lighthouse on Production deployments of `main`, since [#67](https://github.com/sekoya-solutions/sekoya-parts/issues/67), in the same workflow and with the same warm-up run, five runs and threshold:
     - at the public address, `https://sekoya-parts.vercel.app`, since Vercel's own address for each deployment answers with its sign-in, and without the bypass secret, which the job gives previews only;
     - every SEO audit runs, and the run fails if `is-crawlable` or `robots-txt` is missing;
     - the first request checks the `x-sekoya-commit` header, which every Vercel build sends with its commit (`site/commit.ts`, through `next.config.ts`), and stops the run when the public address serves another commit, with no retry;
     - the scores go to the job summary and the "Lighthouse scores" checks on `main`'s commit, with the reports, and no comment. A low score only marks `main`'s commit red (owner decision): GitHub notifies whoever started the run, here Vercel's app.

### Phase 3, in progress: the catalog

Epic [#72](https://github.com/sekoya-solutions/sekoya-parts/issues/72), in the order the owner set on 2026-11-12. Each step gets its issue when its work starts.

1. **Done: language routing** ([#73](https://github.com/sekoya-solutions/sekoya-parts/issues/73), [ADR 0011](adr/0011-languages-and-seo.md)):
   - every site page is under `app/(site)/[lang]`, whose root layout sets `<html lang>`; any other first segment, and any address without a language, returns Next.js's default 404 (the [design spec](specs/design-system.md) lists the 404 cases);
   - `/` lists the ten languages and is the `x-default` of the home pages; each `/<lang>` is a placeholder home page until the home template;
   - the product page is at `/<lang>/<category slug>/<words>-<reference>`, in lowercase ASCII (`site/addresses.ts`), and `/product/<id>` is gone. A product is found by its reference, so product references are uppercase letters and digits only, and category slugs lowercase words joined by hyphens, both checked by Payload on save, which `tests/validation.test.ts` proves through Payload's local API since [#75](https://github.com/sekoya-solutions/sekoya-parts/issues/75);
   - any other words, category slug or letter case before a valid reference redirect permanently (308) to the address. The tests and the Lighthouse check use the lookup address `/fr/p/sp000001` and follow its redirect, so they never depend on the catalog's words;
   - a cached lookup, one entry per reference for the ten languages, gives the product's id, names and addresses. It is tagged with the reference, the product's description tag, its category and its brand; save hooks on categories and brands refresh them, which also refreshes the headings that show them. The price, description and reference list keep the cache keys and tags of ADR 0008;
   - each page's head lists its ten versions and `x-default` at full addresses, on the origin `site/site-url.ts` gives (the production domain, a preview's branch address, or localhost);
   - interface labels live in `site/dictionaries/<lang>.json`, and a test checks every key exists in all ten;
   - product 1 is built in advance in the ten languages, and the 2 MB test covers all ten (about 230 KB each).
2. **Done: the full-scale catalog** ([#77](https://github.com/sekoya-solutions/sekoya-parts/issues/77), [ADR 0007](adr/0007-catalog-data-model.md)):
   - `npm run generate -- --scale full --seed 1 --replace` loaded Neon's `main` in 33.1 s from the owner's machine: 100,000 products in 1.6 s, 1,000,000 models in 8.1 s and 1,451,992 compatibility rows in 22.1 s. The catalog tables take 264 MB with their indexes, the database 273 MB, against ADR 0007's estimate of about 300 MB;
   - the full catalog adds only about 53 MB to the small one, since the million models and product 1's million compatibility rows exist at both scales;
   - the owner reset `preview` and `dev` from `main`. Each branch is billed at most its own data size, so the three stay under the free plan's 1 GB;
   - the database tests read the loaded scale from `CATALOG_SCALE`, now `full` in `.env.example` for the Neon branches; CI sets `small` itself;
   - the same seed keeps the prices, part types and compatible models of products 1 to 1,000, but they get new brands among 60, hence new names and addresses (product 1 is now a Norium knob). The load bypassed Payload's save hooks, so production keeps serving its cached parts until the merge's deployment, which starts the Runtime Cache empty (owner decision);
   - the owner keeps `main`'s direct connection string in the git-ignored `.env.main` for later loads.
3. **Done: the model page and the numbered reference pages** ([#79](https://github.com/sekoya-solutions/sekoya-parts/issues/79), [ADR 0009](adr/0009-compatible-references.md), ADR 0011):
   - the model page is at `/<lang>/<model word>/<brand slug>-<model reference>`, the word translated (`appareil`, `geraet`...) in `site/addresses.ts`. It shows the brand and reference, the appliance type in the page's language, and the compatible products with their names, prices and links;
   - a model is found by its brand slug and reference, unique together. Brand slugs are lowercase letters and digits with no hyphen, so the brand ends at the first hyphen; Payload checks this on save, and refuses a category slug equal to a model word, since both share the place after the language. Another language's word or letter case redirects permanently;
   - reference pages are at the product's address followed by `/<n>`, 500 references each from rank 1 (owner decision), with previous and next links and their own canonical address. Only a product with more than 1,000 references has them; product 1 has 2,000 per language;
   - the reference rows are one cache entry per product and range, shared by the ten languages, and the page builds the links in its language (owner decision). A separate entry gives a product's number of references, read before any range, so a page number past the end creates no entry. Lists carry the tags of the brands they show, and a brand's save refreshes the model lookups of its old and new slugs;
   - the model page's products are one entry per model and language, tagged with the model and each product's price, description, category and brand;
   - the 2 MB test also measures a full reference page in the ten languages, and Lighthouse measures the reference page and the model page on every deployment, through `first-link:` addresses that the script resolves from the product page. Locally, product 1's French page is about 265 KB and a reference page about 138 KB.
4. **Done: the category listing and the home page** ([#81](https://github.com/sekoya-solutions/sekoya-parts/issues/81), ADR 0008, ADR 0011):
   - category pages at `/<lang>/<category slug>`, then `/<lang>/<category slug>/<n>`, 48 products each in reference order (owner decision), with previous and next links and their own canonical address. Another language's slug, another letter case or `/1` redirects permanently; a page past the last is a 404. Product references must now hold a letter, so a number after a category slug is always a page;
   - each page's rows are one cache entry per category and page, shared by the ten languages, tagged with the category's listing, the category, the catalog, and each shown product's price and brand: at most 99 tags, under Next.js's limit of 128, past which it drops tags with only a warning. A test checks the limit against the installed Next.js. A product created, deleted, moved, renamed or given another reference refreshes the listings of its categories before and after the save;
   - the rows are read from a new index on (category, reference). On the full catalog, the first page takes 0.09 ms and the last of the largest category, 8,469 products, 8 ms, where PostgreSQL sorts the category's rows rather than walk the index;
   - the home page lists the 12 categories with their number of products, from two shared entries; the showcase products joined it in step 6 ([#111](https://github.com/sekoya-solutions/sekoya-parts/issues/111)). Each category's first page and the home page are built in advance in each language;
   - Lighthouse also measures the French home page and the first category it lists. Locally, on the full catalog, the French home page is about 13 KB and a category page about 27 KB.
5. **Done: the design, images and fonts** ([ADR 0012](adr/0012-front-end-assets.md)), in two parts:
   - **Done: the design system** ([#83](https://github.com/sekoya-solutions/sekoya-parts/issues/83), [design spec](specs/design-system.md)):
     - Tailwind CSS 4 with the owner's palette as its only colours, Manrope served from the site, and the wordmark logo;
     - a skip link, a header, a language switch of plain links and a footer on every page, and the five templates styled;
     - a unit test checks each colour pairing against the WCAG AA ratios, and the "Lighthouse" check also fails below a median accessibility of 95;
     - the heaviest product page grew by about 6.8 KB, to about 272 KB;
     - a designed 404 shows in the address's language, but only once the browser runs Next.js's scripts. The spec lists the three 404 cases, their limits and their possible fixes, left for later (owner decision);
   - **Done: the images** ([#85](https://github.com/sekoya-solutions/sekoya-parts/issues/85), [source note](../assets/images/README.md)):
     - 48 originals, four per category, generated by the owner with Grok Imagine rather than CC0 (owner decision), committed as 1,600-pixel square JPEGs with a manifest of their hashes;
     - every build resizes them with sharp to 320, 480, 640 and 960 pixels in AVIF, WebP and JPEG (576 files, 11.3 MB), reusing Next.js's build cache: about 10 s from scratch, under 1 s when cached. They are served from `/images/` with a year of caching, under names that change with their content;
     - each product shows one of its category's four images, on its page (loaded first) and on its cards; the home page shows one per category. The reference list stays text only;
     - phones show two cards per row, and the product page is text first, with a thumbnail beside the name and price: with a large image first, Lighthouse's simulated slow phone painted it at about 3 s and performance fell to 92 (owner decision);
     - a category page's HTML grew from about 33 KB to 122 KB (9 KB compressed), the home page from 23 KB to 47 KB; the heaviest product page stays about 274 KB.
   - **Done: performance headroom on the image-led pages** ([#87](https://github.com/sekoya-solutions/sekoya-parts/issues/87)): on two preview runs of the final code, the home, category, model and reference pages score 100 and the product page 99, with accessibility at 100:
     - on PR #99, the home page scored 94 twice. Only its largest paint lost points: Lighthouse's simulated slow phone shares its bandwidth among every request started before the first card image paints, about 107 KB of images, 141 KB of Next.js scripts and the 25 KB font, so the image painted at 3.0 to 3.2 s;
     - card images now declare their real width, so a phone loads the 320 width: the home page's twelve images weigh 60 KB instead of 113 KB;
     - the home, category and model pages open with a short introduction in large text, the largest element of a phone's first screen, as the product page is text first (owner decision);
     - removing Next.js's scripts is not possible in the App Router, and a later font would save at most about 0.1 s, so neither is done;
     - the home and category pages' largest paint moved from 3.0 to 3.2 s simulated to about 1.2 s. The model page, also led by its product cards, stayed at 95 to 98 with the right-sized images alone, its first card image painting at 2.4 to 2.9 s; with its introduction it scores 100.
6. **Done: the showcase products and their translations** ([ADR 0006](adr/0006-content-management.md), ADR 0011), in three parts:
   - **Done: the twelve showcase products** ([#98](https://github.com/sekoya-solutions/sekoya-parts/issues/98), [ADR 0007](adr/0007-catalog-data-model.md)):
     - one per category, chosen by the owner: SP000027, SP000054, SP000043, SP000067, SP000033, SP000028, SP000039, SP000007, SP000017, SP000001 (the million-model knob), SP000008 and SP000034, all within the small catalog that CI loads;
     - their French names and descriptions are committed in `catalog/showcase.ts` and loaded by the generator at every scale and seed, which also keeps each one in its listed category. For seed 1, every other value of every product is unchanged, which a test pins;
     - names leave out the brand, which differs between the small and full catalogs, and texts name no appliance type, since a product's compatible models are of every type;
     - until #104, the nine other languages showed the French text, through Payload's fallback, and the addresses were built from the French name;
     - Neon's `main` was reloaded with the full catalog and the showcase in 33.7 s, a 276 MB database, and the owner reset `preview` and `dev` from it;
     - production serves them since the merge (`0d562bf`): product 1's French page has the heading "Bouton de programmateur universel, axe 6 mm" and its French description;
   - **Done: the DeepL translation job** ([#104](https://github.com/sekoya-solutions/sekoya-parts/issues/104), ADR 0006 amended, ADR 0011):
     - one sweep brings each showcase product's nine other languages in line with its French text, through Payload, so the product save hook refreshes only the parts it changes. French is the source: a French edit overwrites the other languages;
     - `GET /api/translations/run` runs it: the daily Vercel cron with `CRON_SECRET`, or a signed-in user at once. Anyone else gets 401, a second run during one gets 409, and a DeepL failure gets 502. No save hook or Payload job queues it (owner decision), since the sweep finds new and changed texts itself;
     - DeepL's free plan allows 1,000,000 characters in total, once, and one full translation costs 45,594 (owner decisions: spend it very conservatively). A translation memory, keyed by language and the SHA-256 hash of the French text, keeps every translation through catalog reloads, so only new or changed text is sent. Nothing retries: a quota (456), rate (429) or key (403) refusal stops the run, keeping what was already paid for;
     - English is sent as British English and Portuguese as European Portuguese;
     - the key is set in Vercel's Production and locally, never on previews, which keep the French text;
     - the real runs on Neon's `dev` before the merge and on production after it (`f1c0f05`) each sent 9 requests and 45,594 characters and wrote 108 languages, so 91,220 of the 1,000,000 characters are spent. Production's `/en/p/sp000001` leads to `/en/knob/universal-programmer-button-6-mm-shaft-sp000001`, with the English name and description;
     - CI tests the logic against a fake DeepL. A live check (`.github/workflows/deepl-live.yml`) reads DeepL's usage every day, which spends no characters, and fails on a rejected key or from 90% of the quota; on pull requests that touch the translation code it also translates one phrase;
   - **Done: the showcase products on the home page** ([#111](https://github.com/sekoya-solutions/sekoya-parts/issues/111), ADR 0008):
     - each language's home page lists them below the categories, as category-page cards: image, name in that language, price and link, sorted by name in that language (owner decisions);
     - every one of their images loads lazily, so the first screen, the introduction and the first category tiles, is unchanged;
     - the section is one cache entry shared by the ten languages, tagged with each product's price and description, the categories and brands its names and addresses are built from, and a new `showcase` tag. A product that gains or loses the showcase flag, or a showcase product given another reference, refreshes it; an ordinary product's price edit does not;
     - it lists at most 24 products, the first by reference, so its entry stays under Next.js's 128 tags whatever is flagged in Payload;
7. Algolia's index and the single search flow ([ADR 0010](adr/0010-search.md)), with search latency measured, in three parts:
   - **Done: the search box and model search in PostgreSQL** ([#113](https://github.com/sekoya-solutions/sekoya-parts/issues/113)), which needs no Algolia account:
     - every page's header holds a search box, a plain `GET` form with no browser code, sent to `/api/search` with the page's language;
     - that route answers before any page renders: a query equal to exactly one model's reference, in any letter case and with or without spaces and dashes, gets a 307 to that model's page; any other query gets a 307 to the results page, `/<lang>/<search word>?q=<query>` (`recherche`, `search`, `suche` and so on). A page that reads the query cannot send a 307 itself: with Cache Components, it streams after a 200;
     - the results page lists at most 20 models whose reference starts with the query, says when none matches, and carries `noindex`. It is not cached, since each query differs;
     - a B-tree index with `text_pattern_ops` on the reference in upper case without spaces or dashes serves both the prefix and the exact match, and gives their order, so a one-letter query reads 21 rows: about 1 ms on Neon's `dev`, and 30 MB on each branch. A database test checks the plan uses it;
     - Payload refuses a search word as a category slug, as it refuses the model words;
   - **Done: Algolia's index** ([#115](https://github.com/sekoya-solutions/sekoya-parts/issues/115)), kept in step with Payload's edits; [#117](https://github.com/sekoya-solutions/sekoya-parts/issues/117) recorded it as done here:
     - one application on the free plan, created by the owner; the dashboard shows the Europe (FR) cluster, 10,000 search requests and 50,000 records a month, with three indices sharing its 50,000 records (owner decision): `products_production` 45,000, `products_preview` and `products_dev` 2,000 each. `npm run algolia:keys` created each environment's write and search keys with the owner's admin key, which stays in the owner's `.env.local`; each key works only on its own index, and the search key allows 60 queries per hour per visitor;
     - each index holds the showcase products, then the most popular. A product's popularity is a pure function of its id, as no score was stored (ADR 0007);
     - a record holds the reference, brand, category, price, popularity, the name and address in each language, and up to 500 compatible model references, normalised like the model search, fewer when needed to stay under 10,000 bytes. On `dev`, records average about 950 bytes;
     - Payload's hooks queue the products a save changes, inside the save's transaction: a product save or deletion, a brand's new name, a category's new name or slug, and so the translation sweep's writes. After the response, a reconcile run sends the queue; it also runs on every Production and Preview build and from a second daily cron (`/api/search-index/run`), so a failed send is retried and a reset branch or reloaded catalog refills its index with no step by hand. Runs are serialised by an advisory lock, and a row queued again during a run stays for the next one;
     - each environment's state, the products its index holds, is kept in `search_index_state`, so a run sends only the difference; with no state (a new index, a branch reset from another environment, or a catalog reloaded by the generator, which empties it), the run reads the index's ids from Algolia and sends every record again;
     - tests use a fake Algolia: no real key in CI and no quota spent;
     - a rebuild's read of the index's ids counts against the 10,000 monthly searches, one request per 1,000 records, so up to 45 for production; the three first fills spent 3;
     - results: `products_dev` filled from the branch, `products_preview` by the pull request's Preview build, and `products_production` with 45,000 records (42.8 MB) by the Production build of `32855b8`, which also applied the migration. On production, the owner set SP097450's price to 3591 cents in the admin, and its record read back 3591;
   - parts from Algolia on the results page, with search latency measured.
8. The showcase sitemap and `robots.txt` (ADR 0011).
9. Bot Protection switched from Log to Challenge before the catalog pages go public, once the firewall logs show how CI, PageSpeed Insights and the agents' checks are treated, with a fix for any of them that would be challenged.

## Decisions open for the owner

- **Vercel Hobby's terms:** whether a freelance portfolio counts as commercial use (ADR 0002).
- **The showcase:** the pages search engines may crawl (ADR 0002, ADR 0011). The twelve showcase products are chosen ([#98](https://github.com/sekoya-solutions/sekoya-parts/issues/98)).
- **Local end-to-end tests:** a portable PostgreSQL or a dedicated Neon branch for running them on the owner's machine ([#101](https://github.com/sekoya-solutions/sekoya-parts/issues/101)).

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
- **Checking caching on a preview:**
  - Vercel's Preview environment keeps `NEXT_PRIVATE_DEBUG_CACHE=1`, never Production. Next.js then logs, in the deployment's runtime logs, which cache handler it uses (`setting "remote" cache handler from symbol` means Vercel's Runtime Cache) and its cache endpoint. It is a private Next.js flag, so its lines may change between versions.
  - Conclusions about caching come from those logs and the `data-computed-at` markers. The Runtime Cache dashboard (Observability, Runtime Cache, Preview) shows totals only on Hobby and can lag by more than 20 minutes, so a missing figure is checked again, not read as no use.
  - Content edits on a preview go through Payload's REST API as the automation user, with `AUTOMATION_API_KEY` from `.env.local`.
- **The board** sometimes adds new issues by itself. Look up the item before adding it, and set its Status.
- **Research:** facts come from official pages only, with a subagent on Sonnet for broad reading. Decisive facts are re-checked on the page before an ADR cites them.
