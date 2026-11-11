# ADR 0002: Hosting and environments

- Status: Accepted
- Date: 2026-11-11
- Deciders: Owner

## Context

Sekoya Parts is hosted on Vercel, with automatic deployments for every branch and `main` ([AGENTS.md](../../AGENTS.md), section 1). That choice is the owner's and is not reopened here. This Architecture Decision Record (ADR) checks that a Vercel plan can carry the catalog, and sets up its environments and secrets. The forces:

- **Rendering model.** [ADR 0001](0001-framework-and-rendering.md) chose Next.js 16 with Cache Components. Pages are rendered on their first visit and stored by Incremental Static Regeneration (ISR). Parts of a page shared between server instances are cached with `"use cache: remote"`, which Vercel keeps in its Runtime Cache.
- **Page count.** Over ten million pages: about 100,000 products and at least 1,000,000 appliance models, each in ten languages. Product pages can come close to 2 MB of HTML.
- **Traffic.** A portfolio demonstration has few human visitors, but search engine crawlers can request millions of pages.
- **Free tiers.** Free plans are kept unless a limit severely blocks the demonstration (owner decision).
- **Open points from ADR 0001.** The Hobby limits for ISR, the Runtime Cache and functions, and the empty page cache at the start of each deployment.
- **Public repository.** No secret is ever committed.
- **Terms.** The Hobby plan is for non-commercial use. Whether a freelance portfolio fits is the owner's call; this record only states the terms.

### Criteria

1. Plan limits against the catalog, and what happens when each one is reached.
2. Crawler load against those limits, and the protections the plan offers.
3. Empty caches after each deployment: effect on production and previews, and how to limit it.
4. Environments: production from `main`, a preview per branch, local development, preview protection, and how the PageSpeed check reaches a preview.
5. Secrets and environment variables, with nothing in the public repository.
6. Function region, close to European visitors and to the future database.
7. Terms of the Hobby plan.

## Options considered

Figures are Vercel's on 2026-11-11, and every link was checked that day. Two choices are combined: the plan, and how much of the catalog crawlers may reach. The environment setup that follows is the same for every option.

### Hobby limits (1)

| Resource | Included per month on Hobby | Source |
| --- | --- | --- |
| CDN requests | 1,000,000 | [Hobby plan](https://vercel.com/docs/plans/hobby) |
| Function invocations | 1,000,000 | [Hobby plan](https://vercel.com/docs/plans/hobby) |
| Fast Data Transfer | 100 GB | [Hobby plan](https://vercel.com/docs/plans/hobby) |
| Active CPU | 4 hours | [Hobby plan](https://vercel.com/docs/plans/hobby) |
| ISR reads and writes | 1,000,000 and 200,000 units | [Pricing](https://vercel.com/pricing) |
| Runtime Cache reads and writes | 1,000,000 and 200,000 units, shared by all the team's projects | [Runtime Cache](https://vercel.com/docs/runtime-cache) |
| Builds | 45 minutes each, one at a time, 100 deployments a day | [Limits](https://vercel.com/docs/limits), [builds](https://vercel.com/docs/builds/managing-builds) |

- **Units.** An ISR or Runtime Cache unit is 8 KB read or written ([ISR pricing](https://vercel.com/docs/incremental-static-regeneration/limits-and-pricing), [Runtime Cache](https://vercel.com/docs/runtime-cache)). Writes are compressed, but Vercel does not document the ratio. The Hobby ISR figures appear on the pricing page only, not in the documentation tables.
- **When a limit is reached.** In most cases the feature stops until 30 days have passed ([Hobby plan](https://vercel.com/docs/plans/hobby)). The Runtime Cache pauses for the rest of the period ([Runtime Cache](https://vercel.com/docs/runtime-cache)). Sustained usage beyond the limits can pause the deployment, and visitors then get an HTTP 503 error ([paused deployments](https://vercel.com/kb/guide/why-is-my-account-deployment-blocked)).

### Crawler cost (2, 3)

A page served from the cache costs a CDN request. A page rendered on a cache miss also costs a function invocation, and its HTML is written to the ISR cache. An estimate, assuming pages of 64 KB on average (8 write units), until experiment 2 measures real sizes:

- **On Hobby,** the 200,000 ISR write units cover about 25,000 page renders a month.
- **One pass over ten million pages** needs about 10,000,000 invocations and 80,000,000 write units: 10 times Hobby's invocations and 400 times its ISR writes.
- **On Pro,** those write units alone cost about $320 per pass at the lowest listed rate of $4 per million ([pricing](https://vercel.com/pricing)), before invocations, CPU and data transfer.
- **The largest page,** a product near 2 MB, costs about 250 write units per render before compression.

Each deployment has its own ISR cache, and a new one does not reuse the previous one's pages ([ISR](https://vercel.com/docs/incremental-static-regeneration)). The CDN cache key also includes the deployment ([cache purge](https://vercel.com/docs/caching/cdn-cache/purge)). So after every production deployment, a crawler's next visit to each page pays again. Previews start empty too, but only the tests visit them.

### Option A: Hobby, whole catalog open to crawlers

- One crawler pass over the catalog would exceed the monthly invocations and ISR writes many times over (estimate above).
- The demonstration would then go offline: features stop for up to 30 days, or the deployment is paused with 503 errors.
- Ruled out.

### Option B: Hobby, crawlers limited to a showcase

- **Showcase.** `robots.txt` lets search engines crawl only a showcase: the home page, category pages, the ten showcase products and a sample of appliance-model pages, in all ten languages. It stays at a few thousand pages, well under the 25,000 renders a month estimated above. The languages and search engine optimization record sets the exact list and the sitemaps. Every other page still renders for any visitor who asks, which is what demonstrates feasibility.
- **Firewall, for clients that ignore `robots.txt`.** These protections are free on all plans:
  - The Bot Protection ruleset challenges unverified bots and leaves verified crawlers such as Googlebot alone ([bot management](https://vercel.com/docs/bot-management)).
  - The AI Bots ruleset can deny AI crawlers ([bot management](https://vercel.com/docs/bot-management)).
  - Hobby's one rate-limiting rule per project caps the requests from each IP address ([rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)).
  - Attack Mode is available for emergencies ([Attack Mode](https://vercel.com/docs/vercel-firewall/attack-mode)).
  - Traffic the firewall denies, challenges or rate-limits costs no CDN requests or data transfer ([firewall usage](https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing)).
- **Costs.** Search engines index only the showcase, which fits a demonstration of feasibility rather than a search for traffic. Crawlers obey `robots.txt` voluntarily. The documentation does not say whether the rate-limiting rule exempts verified crawlers.

### Option C: Pro, $20 a month

- **Price.** $20 a month, including $20 of usage credit, then on-demand rates ([Pro plan](https://vercel.com/docs/plans/pro-plan)).
- **Spend Management** sends alerts and can pause production at a chosen amount. Its checks run every few minutes, and setting an amount alone does not stop usage ([Spend Management](https://vercel.com/docs/spend-management)).
- **What it adds:** commercial use, Skew Protection ([Skew Protection](https://vercel.com/docs/skew-protection)), which keeps an open page talking to the deployment that served it, functions in more than one region, rollback to any eligible earlier deployment, and more firewall rules.
- **Costs.** An open catalog costs every crawler pass (estimate above), and every production deployment resets the page cache. A spending cap brings back option A's outage, at a chosen price. Option B's crawl limits are therefore still needed on Pro.

### Environments (4)

- **Production.** Vercel for GitHub deploys `main` on every merge. Production domains stay public ([Git](https://vercel.com/docs/git), [deployment protection](https://vercel.com/docs/deployment-protection)).
- **Previews.** Every push to another branch gets a deployment, with a branch URL that stays the same across pushes ([generated URLs](https://vercel.com/docs/deployments/generated-urls)). New projects protect previews with Vercel Authentication on all plans, which also keeps search engines off preview URLs ([environments](https://vercel.com/docs/deployments/environments), [deployment protection](https://vercel.com/docs/deployment-protection)).
- **Continuous integration (CI).**
  - Protection Bypass for Automation, on all plans, lets a tool send a secret in the `x-vercel-protection-bypass` header ([bypass for automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)).
  - Vercel tells GitHub when a preview is ready, with its URL, through `repository_dispatch` or `deployment_status` events ([Vercel for GitHub](https://vercel.com/docs/git/vercel-for-github)). The testing record picks one.
- **Local development.** `next dev`, with values in a git-ignored `.env.local`. Only `vercel env pull` needs the Vercel command-line tool ([environment variables](https://vercel.com/docs/environment-variables)). Local values are written by hand for now; if the tool becomes useful, it follows the portable-tool rule.
- **Repository.** Hobby cannot connect to repositories owned by GitHub organizations ([limits](https://vercel.com/docs/limits)). `sekoya-solutions` is a personal account, so this does not apply; moving the repository to an organization would require Pro.

### Secrets (5)

- **Vercel environment variables** of the Secret type, which cannot be read back after saving ([secret variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)). They are set per environment, with branch-specific values for previews if needed. Changes apply to new deployments only, within 64 KB per deployment ([environment variables](https://vercel.com/docs/environment-variables)).
- **GitHub Actions secrets** for CI, such as the bypass secret.
- **A git-ignored `.env.local`** on the developer's machine, with `.env.example` listing the variable names only.

### Region (6)

- **Default.** Functions run in `iad1` (Washington, D.C.) by default ([regions](https://vercel.com/docs/regions)). Hobby runs them in one region ([function regions](https://vercel.com/docs/functions/configuring-functions/region)), and the ISR cache follows that region ([ISR](https://vercel.com/docs/incremental-static-regeneration)).
- **Choice.** `fra1` (Frankfurt) is central to the countries of the ten languages; `cdg1` (Paris) is the alternative ([regions](https://vercel.com/docs/regions)). The database record then looks for a provider region in Frankfurt.

### Terms (7)

The fair-use guidelines restrict Hobby to non-commercial personal use ([fair use](https://vercel.com/docs/limits/fair-use-guidelines)). Their definition of commercial use includes advertising the sale of a product or service, and a deployment that brings financial gain to a paid employee or consultant writing the code. The page has no sentence about portfolios and refers unsure cases to Vercel Support. The owner judges whether this portfolio fits.

### Summary

| Criterion | A: Hobby, open | B: Hobby, showcase | C: Pro |
| --- | --- | --- | --- |
| 1. Limits | Exceeded many times over | Fit at the estimate | Paid on demand |
| 2. Crawlers | Unbounded | Showcase plus firewall | Unbounded cost without B's limits |
| 3. Empty caches | Every page re-rendered | Showcase re-rendered | Every page re-rendered, paid |
| 4. Environments | Same for all | Same for all | Adds Skew Protection |
| 5. Secrets | Same for all | Same for all | Same for all |
| 6. Region | One | One | Several possible |
| 7. Terms | Non-commercial only | Non-commercial only | Commercial allowed |

## Decision

Chosen: **option B**, the Hobby plan with crawlers limited to a showcase, protected previews, and functions in `fra1` (Frankfurt). If the owner judges the portfolio commercial, or a Hobby limit blocks the demonstration itself, the fallback is Pro (option C), keeping option B's crawl limits.

Why:

- It costs nothing, as the owner asked, and nothing in the demonstration needs search engines to crawl ten million pages. Each page rendering on request is the proof.
- The firewall protections are free, and so is the traffic they block.
- Protected previews keep crawlers off branch deployments, while the bypass secret still lets CI test them.

What it costs, and where each cost is checked:

- **Showcase only.** Search engines see only the showcase. The languages and search engine optimization record sets the list, the sitemaps and `robots.txt`.
- **An estimate, not a measurement.** The crawler estimate assumes 64 KB pages. Experiment 2 measures real sizes, and the Vercel usage page shows real consumption after the first deployments.
- **Cold caches.** Every deployment starts with empty caches. Building the showcase pages in advance makes them ready at once; Cache Components already requires at least one page per route. The build must stay under 45 minutes.
- **Shared Runtime Cache.** It is shared with any other project on the owner's Hobby team. The caching record budgets its 1,000,000 reads and 200,000 writes.
- **Rollback.** Hobby can only go back to the deployment just before the current one. After a rollback, new merges do not go live until a deployment is promoted ([instant rollback](https://vercel.com/docs/instant-rollback)).
- **No Skew Protection on Hobby.**

## Consequences

Positive:

- Hosting costs nothing while usage stays within the Hobby limits.
- Previews stay private, and no secret is ever in the repository.
- Pages are rendered in one European region, where the database record will place the database.

Negative:

- Search engines index only the showcase.
- Rollback and Skew Protection are limited.
- Usage must be watched on the Vercel dashboard, since a reached limit stops a feature for up to 30 days.

Follow-up:

- **Testing record:** Lighthouse on previews with the bypass header, and how the workflow receives the preview URL.
- **Database record:** a region in Frankfurt.
- **Caching record:** the Runtime Cache budget for `"use cache: remote"`.
- **Languages and search engine optimization record:** the showcase list, `robots.txt` and the sitemaps.
- **Front-end assets record:** images that do not depend on Vercel's 5,000 monthly image transformations on Hobby ([pricing](https://vercel.com/docs/pricing)).
- **Implementation, with the owner's accounts:** create the Vercel project from the repository, set the region to `fra1`, turn on the firewall rules, and create the bypass secret.
