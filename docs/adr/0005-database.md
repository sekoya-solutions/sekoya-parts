# ADR 0005: Database

- Status: Accepted
- Date: 2026-11-11
- Deciders: Owner

## Context

This Architecture Decision Record (ADR) chooses the database that holds the catalog. The forces:

- **Volume.** About 100,000 products, at least 1,000,000 appliance models, and over a million compatibility rows, since one product fits up to a million models ([AGENTS.md](../../AGENTS.md), section 1).
- **Free tier** unless that severely blocks the demonstration (owner decision).
- **A rarely visited demonstration.** Pages are cached ([ADR 0002](0002-hosting-and-environments.md)), so the database is queried mostly when a page is rendered on a cache miss, by CI tests and by imports.
- **Region.** Functions run in Frankfurt (ADR 0002).
- **Testing.** The production build in continuous integration (CI) needs catalog data ([ADR 0004](0004-testing-and-ci.md)).
- **Payload, maybe.** The content management system (CMS) record may choose Payload, which offers PostgreSQL, MongoDB and SQLite.

### Criteria

1. Free-tier capacity against the catalog's estimated size, and what happens at each limit.
2. Pauses or cold starts after inactivity.
3. A Frankfurt region.
4. Access from Vercel functions, and Payload support.
5. The catalog's queries at a million rows.
6. Data for CI, previews and local development, without a system install.
7. Lock-in and export.

## Options considered

Facts were checked on 2026-11-11.

**Size estimate:** about 400 MB with indexes. It assumes:

- **Compatibility:** five compatible models for each ordinary product, so 1.5 million rows.
- **Models:** 1,000,000, each with a short reference and name.
- **Products:** names stored in ten languages.
- **Storage overhead:** PostgreSQL adds a 23-byte header and a 4-byte pointer to every row ([page layout](https://www.postgresql.org/docs/current/storage-page-layout.html)).

The data-model record refines the estimate.

- **Neon (PostgreSQL).**
  - The free plan gives each project 1 GB of storage, 100 CU-hours of compute and 5 GB of data transfer a month, and 10 branches. At a limit, compute stops until the next month, without deleting data ([plans](https://neon.com/docs/introduction/plans)).
  - The database sleeps after five idle minutes and wakes by itself within a few hundred milliseconds ([scale to zero](https://neon.com/docs/introduction/scale-to-zero)).
  - Frankfurt is a region ([regions](https://neon.com/docs/introduction/regions)).
  - On Vercel, Neon recommends the `pg` driver with `@vercel/functions` ([connecting](https://neon.com/docs/connect/choose-connection)). Its Vercel integration can create a branch for every preview ([Vercel integration](https://neon.com/docs/guides/vercel-managed-integration)).
- **Supabase (PostgreSQL).** The free plan gives each project a 500 MB database ([pricing](https://supabase.com/pricing)). A project with low activity over seven days is paused until someone restores it from the dashboard ([pausing](https://supabase.com/docs/guides/platform/free-project-pausing)).
- **Turso (libSQL, based on SQLite).**
  - The free plan gives 5 GB, 500 million rows read and 10 million rows written a month ([pricing](https://turso.tech/pricing)). One full import of the catalog writes about four million rows.
  - Its command-line documentation says free databases are archived after ten days of inactivity ([unarchive](https://docs.turso.tech/cli/group/unarchive.md)). A Frankfurt location was not confirmed.
  - Payload's SQLite adapter runs on libSQL ([Payload SQLite](https://payloadcms.com/docs/database/sqlite)).
- **MongoDB Atlas.** A free cluster holds 0.5 GB, including indexes, and is paused after 30 days without connections ([free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)). Its document model also fits a million-row many-to-many link less naturally than a table does.
- **Queries.** The two lookups are a product's models by popularity, page by page, and a model's products. In PostgreSQL, both are index range scans on the compatibility table. Experiment 2 measures them.
- **CI and local data.**
  - GitHub Actions can run a PostgreSQL service container on Linux runners ([service containers](https://docs.github.com/en/actions/using-containerized-services/creating-postgresql-service-containers)). The official image's latest major version is 18 ([postgres image](https://hub.docker.com/_/postgres)).
  - Neon branches give development and previews their own copy of the data in the cloud ([branching](https://neon.com/docs/introduction/branching)).

## Decision

Chosen: **Neon's free plan, PostgreSQL 18, in AWS Frankfurt** (`aws-eu-central-1`).

- **Production** uses the main branch.
- **All Vercel previews share one `preview` branch.** The per-preview integration is not used: each preview would hold a branch until Vercel deletes it, and the ten-branch limit would soon be reached.
- **Local development** uses a `dev` branch, so nothing is installed.
- **CI** builds against a PostgreSQL 18 service container, filled by the data generator. Tests never use the free tier.
- **Functions** connect with `pg` and `@vercel/functions`, as Neon recommends for Vercel.

Why:

- **Room.** It has room for the estimate: 1 GB, where Supabase and MongoDB offer about 500 MB.
- **It never needs a person to wake it.** It sleeps when idle and wakes by itself. Supabase, Turso and MongoDB document pauses or archiving of idle free databases.
- **Standard PostgreSQL** keeps export simple, with `pg_dump` ([backups](https://neon.com/docs/manage/backups)), and the data can always be regenerated. Payload supports it.

What it costs, and where each cost is checked:

- **Wake-up delay.** A page rendered on a cache miss after five idle minutes waits a few hundred milliseconds longer. Cached pages are not affected.
- **Monthly limits.** If compute or data transfer runs out, uncached pages fail until the next month. ADR 0002's crawl limits keep usage low, and the Neon dashboard shows consumption.
- **The 90-day warning.** Neon's regions page warns that Free projects inactive for 90 days may be deleted, in its section on deprecated Azure regions. This project uses AWS, and its data can be regenerated.
- **Fallback.** If Neon's 1 GB is not enough, the fallback is Turso, with 5 GB and Payload support. Its row quotas, its archiving after ten idle days and its region would then be checked.

No download is needed on the owner's machine. The `pg` and `@vercel/functions` packages come with the lockfile.

## Consequences

Positive:

- Free, standard PostgreSQL next to the functions.
- Tests run on their own database in CI.

Negative:

- Previews share one branch, so they all see the same data.
- A first query after an idle period is slower.

Follow-up:

- **Data-model record:** the schema, the generator and a refined size.
- **Implementation, with the owner's account:** create the Neon project in Frankfurt with its `preview` and `dev` branches, and connect it to Vercel.
- **Experiment 2:** query times on the compatibility table.
