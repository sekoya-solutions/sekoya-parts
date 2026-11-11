# ADR 0004: Testing and continuous integration

- Status: Accepted
- Date: 2026-11-11
- Deciders: Owner

## Context

This Architecture Decision Record (ADR) chooses how the project is tested and what continuous integration (CI) checks on every commit. The forces:

- **Owner requirements** ([AGENTS.md](../../AGENTS.md), section 1): a PageSpeed score of 95 to 100 checked on every commit, product-page HTML under 2 MB tested in CI, and full non-regression tests.
- **Earlier records.** [ADR 0001](0001-framework-and-rendering.md) chose Next.js 16 with Cache Components. [ADR 0002](0002-hosting-and-environments.md) protects Vercel previews, with a bypass secret for CI. [ADR 0003](0003-toolchain.md) chose Node 26, npm with install scripts off, TypeScript 7 and Biome, and left Markdown lint to this record.
- **Robustness** (AGENTS.md, section 3): a check must not pass or fail by luck or timing.
- **Portable tools only,** with every download on the owner's machine approved first.

### Criteria

1. Test levels and what each guards against.
2. A PageSpeed check of 95 or more, with mobile settings that match PageSpeed Insights and stable results.
3. The 2 MB limit, measured on the HTML actually served.
4. Reaching a protected preview without exposing the bypass secret.
5. Lint and type checks.
6. Cost and speed.
7. Required checks on `main`, without checks that fail for no real cause.

## Options considered

Facts and versions were checked on 2026-11-11.

- **Unit tests.**
  - Vitest 5.1.0 runs TypeScript and JSX directly ([Vitest features](https://vitest.dev/guide/features.html)). Next.js has a Vitest guide, which notes that Vitest cannot test async Server Components ([Next.js Vitest guide](https://nextjs.org/docs/app/guides/testing/vitest)).
  - Jest 30.5.2 needs Babel or ts-jest to run TypeScript ([Jest](https://jestjs.io/docs/getting-started)).
  - Node's test runner only strips types and cannot load `.tsx` files ([TypeScript in Node](https://nodejs.org/docs/latest-v26.x/api/typescript.html)), so it cannot test React components.
- **End-to-end tests.** Next.js recommends them for async Server Components, run against a production build ([testing](https://nextjs.org/docs/app/guides/testing), [Playwright guide](https://nextjs.org/docs/app/guides/testing/playwright)).
  - Playwright 1.65.0 installs browsers one at a time, into a folder that can be chosen. It sends extra headers with every request ([browsers](https://playwright.dev/docs/browsers), [test options](https://playwright.dev/docs/api/class-testoptions)).
  - Cypress 16.3.0 downloads its binary in an install script ([Cypress installation](https://docs.cypress.io/app/get-started/install-cypress)), which ADR 0003's setting blocks.
- **PageSpeed check.**
  - Lighthouse CI 0.16.0 runs Lighthouse several times, can send extra headers, and checks the performance score. By default it keeps the best run, unless told to use the median ([configuration](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md)).
  - Lighthouse's default simulated throttling matches PageSpeed Insights ([throttling](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md)).
  - Google's variability guide finds the median of five runs twice as stable as one run, and asks for at least two dedicated cores ([variability](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md)).
  - The PageSpeed Insights API runs in Google's data centres and documents no way to send headers ([PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/about)). It could reach a protected preview only with the secret in the URL, which Google would log.
- **Where the browser checks run.**
  - **A production build inside CI.** It runs in a `pull_request` workflow: results land on the pull request's commit and no secret is needed.
  - **The Vercel preview.** This is the real platform. Vercel tells GitHub that a preview is ready through two events ([Vercel for GitHub](https://vercel.com/docs/git/vercel-for-github), [events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)):
    - `deployment_status`, whose run uses the deployed commit;
    - `repository_dispatch`, whose run uses the last commit of `main`, and which only works once the workflow file is on `main`.

    Required checks can be check runs or commit statuses ([protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)).
- **Markdown lint.**
  - markdownlint-cli2 0.24.0 has rules for heading levels, lists, tables with the same number of cells on every row, and code fences ([rules](https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md)).
  - remark-lint's consistency preset does not check heading levels or blank lines around lists ([preset](https://github.com/remarkjs/remark-lint/tree/main/packages/remark-preset-lint-consistent)).
- **Cost and forks.** Standard runners are free for public repositories, and the Linux runner has 4 vCPUs and 16 GB of memory ([billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)). Secrets are not passed to workflows started from forks ([secrets](https://docs.github.com/en/actions/how-tos/security-for-github-actions/security-guides/using-secrets-in-github-actions)).
- **The 2 MB limit.** Googlebot fetches the first 2 MB of a file, counted uncompressed ([Googlebot](https://developers.google.com/search/docs/crawling-indexing/googlebot)).

## Decision

Chosen:

- **On every push to a pull request,** a `pull_request` workflow runs:
  - Biome, the TypeScript check and markdownlint-cli2;
  - Vitest unit tests;
  - a production build, then Playwright end-to-end tests against it, in Chromium only;
  - the 2 MB test, which fails if the uncompressed HTML of the heaviest product page reaches 2,000,000 bytes in any language.
- **On every ready Vercel preview,** a `deployment_status` workflow runs Lighthouse CI against the preview with the bypass header:
  - mobile settings, matching PageSpeed Insights;
  - one warm-up request, then five runs;
  - the median run must score at least 95 in performance.
- **Required checks on `main`:** every job above, plus Vercel's own deployment status. Each one is required as soon as it exists, starting with Markdown lint, since only documentation exists today.
- **No retries:** required tests are never retried. A flaky test is fixed at its cause, with Playwright's trace kept on failure.

Why:

- **Next.js's own guidance:** unit tests for components and logic, end-to-end tests for async Server Components, run against a production build.
- **Vitest** runs TypeScript and JSX as they are. Node's runner cannot load `.tsx` files, and Jest needs Babel.
- **Playwright** fits ADR 0003's no-install-scripts rule, which Cypress does not.
- **Lighthouse on the preview** measures the real platform, and the bypass header never leaves CI. Five runs and a median keep a lucky run from deciding, and the warm-up keeps a cold cache from deciding.
- **`deployment_status`** runs on the deployed commit, so its result lands on the pull request, and a change to the workflow is tested in its own pull request. `repository_dispatch` would need a status posted by hand, and runs only after the workflow is merged.

What it costs, and where each cost is checked:

- **Unconfirmed check placement.** GitHub does not state that a `deployment_status` check appears on the pull request. The first pull request after setup checks it before the check is made required. If it does not appear, the workflow posts a commit status on the deployed commit instead.
- **Vercel's preference.** Vercel recommends `repository_dispatch` and keeps `deployment_status` for compatibility. If it drops `deployment_status`, the same commit-status route applies.
- **Hobby quota.** Each push loads a preview about six times, which is small against the Hobby limits of ADR 0002.
- **Score variance.** GitHub's runners are virtual machines. If scores still vary, the variability guide's next step is a dedicated machine.
- **Pull requests from forks.** Vercel waits for the owner's approval before deploying them, so their Lighthouse check runs only after that approval.
- **Data and experiments.** The production build in CI needs catalog data, which the database and data-model records provide. End-to-end tests of partial refresh follow experiment 1.

### Downloads for the owner's approval

- **Playwright's Chromium,** about a few hundred megabytes according to Playwright, stored in `.tools/` through `PLAYWRIGHT_BROWSERS_PATH`. Its exact file name and size are given before it is downloaded. Locally, Lighthouse CI uses this Chromium too, to be confirmed at setup.
- **The npm packages** Vitest, `@playwright/test`, `@lhci/cli` and markdownlint-cli2. None has an install script ([npm registry](https://registry.npmjs.org/@lhci/cli/0.16.0)), and they come with the lockfile.

## Consequences

Positive:

- Every pull request is checked for lint, types, unit and end-to-end tests and the 2 MB limit, with no secret involved.
- PageSpeed is measured on the real platform, at mobile settings, without luck deciding the result.

Negative:

- Two workflows, one of them started by Vercel.
- A first-run check is needed before the Lighthouse job can be required.
- Fork pull requests get their Lighthouse check only once the owner lets Vercel deploy them.

Follow-up:

- **Implementation:**
  - the Markdown lint workflow first, made required;
  - then the other jobs, as the code they check appears.
- **Database and data-model records:** catalog data for the production build in CI.
- **Experiments 1 and 2:** end-to-end tests of partial refresh, and the 2 MB test's target page.
