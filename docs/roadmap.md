# Roadmap

Where Sekoya Parts stands and what comes next. Agents read this file at the start of a session, after [AGENTS.md](../AGENTS.md), and update it whenever a step is done or the plan changes.

## Status on 2026-11-11

- **Repository:** rules in `AGENTS.md`, the pull request template, the chat-history opt-in, labels, branch protection on `main`, and the [Sekoya Parts board](https://github.com/users/sekoya-solutions/projects/3).
- **Stack decided:** the twelve Architecture Decision Records (ADRs) are accepted. They are listed in the [ADR index](adr/README.md) and summed up in the stack line of `AGENTS.md`, section 1. The Stack ADRs epic ([#3](https://github.com/sekoya-solutions/sekoya-parts/issues/3)) is closed.
- **Phase 1 started:** epic [#30](https://github.com/sekoya-solutions/sekoya-parts/issues/30). Node 26.13.1 is verified and unpacked into `.tools/node` on the owner's machine, and the toolchain files are written ([#31](https://github.com/sekoya-solutions/sekoya-parts/issues/31)). The first CI workflow runs Markdown lint on every pull request, as a required check ([#33](https://github.com/sekoya-solutions/sekoya-parts/issues/33)).
- **Nothing built yet:**
  - no application code; the only npm package is markdownlint-cli2;
  - no Vercel, Neon, Algolia or DeepL account set up for the project.

## Next phases

Each step follows the usual flow: an issue, a branch, a pull request, then the owner's go ([AGENTS.md](../AGENTS.md), section 5). Each phase gets an epic issue on the board when it starts.

### Phase 1: setup and the first CI check

1. **Done: downloads, each approved first.** The Node 26.13.1 Windows archive, its signed checksums and Node's release keys ([ADR 0003](adr/0003-toolchain.md)). The checksum list was verified with `gpgv` and the archive against it, then the archive was unpacked into `.tools/node`. A later Node security release is downloaded the same way, with its file name, size and checksum given again.
2. **Done: toolchain files.**
   - `.node-version` and `.npmrc` (install scripts off, a three-day minimum release age, exact versions);
   - a `package.json` with `engines.node` set to `26.x`;
   - `node_modules` and the Next.js build folder added to `.gitignore`.
3. **Done: Markdown lint.** The markdownlint-cli2 workflow, made a required check on `main` ([ADR 0004](adr/0004-testing-and-ci.md), [#33](https://github.com/sekoya-solutions/sekoya-parts/issues/33)). It replaces the manual check of Markdown files in `AGENTS.md`, section 4. `package.json` overrides markdownlint to 0.42.1 for a re2js security fix; the override is removed once markdownlint-cli2 requires 0.42.1 or later.
4. **Accounts, created by the owner:**
   - Vercel project in `fra1`, with protected previews, a bypass secret and the firewall rules ([ADR 0002](adr/0002-hosting-and-environments.md));
   - Neon project in Frankfurt, with `preview` and `dev` branches ([ADR 0005](adr/0005-database.md)).

### Phase 2: a walking skeleton and the two experiments

1. **A minimal app:**
   - Next.js 16.4 with Payload 3, one product page built from the per-part cached components of [ADR 0008](adr/0008-caching-and-partial-refresh.md);
   - the generator at a small scale, plus the product with a million models ([ADR 0007](adr/0007-catalog-data-model.md));
   - deployed to a protected preview.
2. **Experiment 1, partial refresh** (ADR 0008):
   - only the edited part is recomputed;
   - the first-visit HTML is complete without JavaScript;
   - Runtime Cache usage is measured.

   If it fails, a new ADR replaces ADR 0008 with whole-page caching.
3. **Experiment 2, reference list** ([ADR 0009](adr/0009-compatible-references.md)):
   - bytes per reference;
   - PageSpeed and element count for 250 to 2,000 references;
   - query times for the first and last reference pages.

   The number of references is set from the results.
4. **The remaining CI jobs,** as their code appears:
   - Biome, TypeScript and Vitest;
   - Playwright and the 2 MB test;
   - Lighthouse on previews.

   The first pull request after setup checks that the Lighthouse result appears on it, before that check is made required (ADR 0004).

### Phase 3: the catalog

- The full generator, the four page templates and the reference pages.
- Payload's admin, its hooks and the DeepL translation job ([ADR 0006](adr/0006-content-management.md), [ADR 0011](adr/0011-languages-and-seo.md)).
- Translated addresses, `hreflang`, the showcase sitemap and `robots.txt` (ADR 0011).
- Algolia's index and the single search flow ([ADR 0010](adr/0010-search.md)), with search latency measured.
- The design, images and fonts ([ADR 0012](adr/0012-front-end-assets.md)).

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
- **The board** sometimes adds new issues by itself. Look up the item before adding it, and set its Status.
- **Research:** facts come from official pages only, with a subagent on Sonnet for broad reading. Decisive facts are re-checked on the page before an ADR cites them.
