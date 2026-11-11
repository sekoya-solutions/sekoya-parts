# ADR 0006: Content management

- Status: Proposed
- Date: 2026-11-11
- Deciders: Owner

## Context

This Architecture Decision Record (ADR) chooses where catalog content is edited and how an edit reaches the site. The forces:

- **Volume.** About 100,000 products, at least 1,000,000 appliance models and over a million compatibility rows, in PostgreSQL 18 on Neon ([ADR 0005](0005-database.md)).
- **Partial refresh.** A price or description edit refreshes only that part of a page, through the tags of [ADR 0001](0001-framework-and-rendering.md).
- **Translation.** About ten showcase products get real descriptions, translated automatically into ten languages when a product is added; the others use placeholder text ([AGENTS.md](../../AGENTS.md), section 1).
- **Stack.** Next.js 16 with Cache Components, npm and Node 26 ([ADR 0003](0003-toolchain.md)), on Vercel's Hobby plan with no extra server ([ADR 0002](0002-hosting-and-environments.md)), free unless that severely blocks the demonstration.
- **Public site.** The admin must be signed in and kept away from search engines.

### Criteria

1. Scale, or the catalog staying in PostgreSQL with the content management system (CMS) editing only what changes.
2. Partial refresh through ADR 0001's tags.
3. A hook for automatic translation.
4. Fit with the stack.
5. Cost.
6. A protected admin on a public site.
7. Media storage.

## Options considered

Facts were checked on 2026-11-11.

- **Payload 3.93, inside the Next.js application.**
  - **Fit with the stack.** It runs on the same PostgreSQL database and supports Next.js 16.3.3 to 16.x. It runs on Node 26 and has no install scripts ([npm registry](https://registry.npmjs.org/@payloadcms/next/3.93.0)).
  - **Large tables.** A project can add its own tables that Payload does not manage ([PostgreSQL adapter](https://payloadcms.com/docs/database/postgres)).
  - **Refresh hooks.** It runs hooks after a change. Its website template calls `revalidateTag` from them ([template hook](https://github.com/payloadcms/payload/blob/main/templates/website/src/collections/Pages/hooks/revalidatePage.ts)).
  - **Languages.** It sets no limit on the number of languages ([localization](https://payloadcms.com/docs/configuration/localization)).
  - **Background work.** A hook can queue a job. On serverless hosting, jobs run through an endpoint that a cron calls ([jobs](https://payloadcms.com/docs/jobs-queue/overview)), and on Hobby a cron runs once a day, at any time within its hour ([Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)).
  - **Admin.** It includes sign-in with lockout ([authentication](https://payloadcms.com/docs/authentication/overview)), and by default the admin asks search engines not to index it ([admin metadata](https://payloadcms.com/docs/admin/metadata)).
  - **Cache Components.** Version 3 works with them without admin errors, but does not guarantee full compatibility ([installation](https://payloadcms.com/docs/getting-started/installation)). Its known limits are a flash on hard refresh and 404 pages answered with status 200 ([pull request 16020](https://github.com/payloadcms/payload/pull/16020)). Full support is merged into the 4.0 beta, which is not yet stable ([pull request 18702](https://github.com/payloadcms/payload/pull/18702)).
  - **Media.** Uploads can be stored in Vercel Blob ([storage adapters](https://payloadcms.com/docs/upload/storage-adapters)). Hobby includes 1 GB, and Blob stops for 30 days if a limit is passed ([Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)).
- **A hosted CMS on its free plan.** Sanity's free plan holds 10,000 documents ([Sanity limits](https://www.sanity.io/docs/content-lake/technical-limits)), so the catalog cannot live there. It could hold the showcase texts, but prices would still be edited somewhere else. Contentful's pages could not be read, so it is not assessed.
- **A self-hosted CMS.** Both need a server of their own, which ADR 0002 rules out.
  - **Directus** is provided as a Docker image that needs a database and Redis ([Directus self-hosting](https://directus.com/docs/self-hosting/overview)). Its managed plan is paid ([Directus pricing](https://directus.com/pricing)).
  - **Strapi** pairs with a separately deployed back end on a host with persistent processes ([Strapi and Vercel](https://community.strapi.io/integrations/vercel)). Its managed plans are all paid ([Strapi Cloud pricing](https://strapi.io/pricing-cloud)).
- **No CMS.** Import scripts plus a small admin page written for the project. Nothing can break with Cache Components, but sign-in, forms, languages and the translation step are all code to write.

## Decision

Proposed: **Payload 3.93 inside the Next.js application,** on Neon through `@payloadcms/db-postgres`.

- **Payload manages what is edited:** products (price, names and descriptions in ten languages), categories and admin users.
- **Models and compatibility** live in the project's own tables, filled by the data generator and never edited in the admin.
- **An edit's hook refreshes the tags of the edited product.** The caching record names the tags.
- **A new showcase product queues a translation job.** The daily Vercel cron runs it, or the owner calls the job endpoint to run it at once.
- **The admin lives at `/admin`,** behind Payload's sign-in. It is unindexed by default and outside the crawl showcase of ADR 0002.
- **Payload 4** replaces version 3 once it is stable, for full Cache Components support.

Why:

- **Nothing extra to host.** It is the only option that runs inside the application and database already chosen, at no cost.
- **Built in:** hooks, languages, background jobs and sign-in.
- **The alternatives:** hosted free plans cannot hold the catalog, self-hosted ones need a server, and no CMS means writing the admin by hand.

What it costs, and where each cost is checked:

- **Cache Components in version 3.** The limits concern Payload's admin. The public pages are the project's own Next.js code. The setup step checks the admin with Cache Components turned on, and experiment 1 checks the path from an edit to a refreshed page. If the admin proves unusable, the fallback is no CMS. That fallback stays cheap because the large tables belong to the project, not to Payload.
- **Translation delay.** On Hobby, a new showcase product's translations appear within a day, unless the owner runs the job at once.
- **Bulk data.** Payload's local programming interface creates one document per call ([local API](https://payloadcms.com/docs/local-api/overview)), so the data-model record decides how the generator fills Payload's tables.
- **pnpm.** Payload prefers pnpm, and supports npm ([installation](https://payloadcms.com/docs/getting-started/installation)).
- **Media** is left to the front-end assets record, which can use Payload's uploads in Vercel Blob within Hobby's 1 GB.

No download is needed on the owner's machine. The Payload packages come with the lockfile, and its secrets go into Vercel's environment variables.

## Consequences

Positive:

- One application holds the site and its admin, at no cost.
- Edits, refreshes and translations go through documented hooks and jobs.

Negative:

- Version 3's Cache Components limits in the admin until Payload 4 is stable.
- Translations may take up to a day on Hobby.

Follow-up:

- **Data-model record:** the split between Payload's collections and the project's own tables, and how the generator fills them.
- **Caching record and experiment 1:** the tag of each part, and the refresh from an edit.
- **Languages record:** the translation service the job calls.
- **Implementation:** Payload's secrets in Vercel, the daily cron, and an admin account for the owner.
