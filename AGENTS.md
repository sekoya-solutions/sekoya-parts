# Agent Instructions — sekoya-parts

Standing rules for every AI agent working on this repository. Read this file and the [Architecture Decision Records (ADRs)](docs/adr/README.md) before working; ADRs are the source of truth for technical decisions.

## 1. Project context

- **Sekoya Parts:** a spare-parts e-commerce catalog, built as a portfolio project for the owner's Malt profile. It demonstrates the **feasibility** of a very large catalog, and only that.
- **Owner:** Tech Lead, 15+ years of experience, who reviews every technical choice and most of the code. Vibe-coded in the sense that the owner steers through chat and AI writes the code.
- **Owner decisions so far:**
  - **Catalog:** about 100,000 products. One product is compatible with up to 1,000,000 appliance models (500,000 or 200,000 if that proves a problem); the other products have few.
  - **Four page templates:** home, category listing, product page, and one page per appliance model.
  - **References on the product page:** only the most popular ones are rendered as text, keeping the page under Google's 2 MB crawl limit (enforced by a CI test) and at a PageSpeed score of 95 or more.
  - **Languages:** ten, on one domain under path prefixes: `fr` (the source), `en`, `de`, `es`, `it`, `nl`, `pt`, `pl`, `sv`, `da`.
  - **Content:** about ten showcase products get real descriptions, translated automatically when a product is added; the others use placeholder text (lorem ipsum) in every language.
  - **Search:** a hosted search engine like Algolia is mandatory. Algolia and the database stay on free tiers unless that severely blocks feasibility; capping search at about 50,000 products is acceptable.
  - **Scope:** catalog only, with prices in euros: no cart, checkout, accounts or payment.
  - **Images:** about 50 original or CC0 images, reused across products and resized at import.
  - **No third-party scripts:** no analytics, chat widget or cookie banner.
  - **Requirements:** PageSpeed 95 to 100, checked on every commit; fine-grained cache invalidation (a price or description change refreshes only that part of a page); full non-regression tests; automatic Vercel deployments for branches and `main`.
  - **Brand:** "Sekoya Parts", with an original design: nothing taken from other sites' names, branding or texts.
  - **Repository:** public from the start. Whether a freelance portfolio fits Vercel's non-commercial Hobby plan is the owner's call.
- **Stack:** decided one ADR at a time, listed in the [ADR index](docs/adr/README.md). Accepted so far: Next.js 16 with the App Router and Cache Components (ADR 0001); Vercel's Hobby plan, with search engines limited to a showcase and functions in Frankfurt (ADR 0002; Vercel itself is an owner decision); Node 26 with its bundled npm, TypeScript 7 and Biome (ADR 0003); Vitest, Playwright, Lighthouse CI on Vercel previews and markdownlint-cli2 in GitHub Actions (ADR 0004); PostgreSQL 18 on Neon's free plan in Frankfurt (ADR 0005); Payload 3 inside the Next.js app, with models and compatibility in the project's own tables (ADR 0006); a seeded generator loading the catalog with `COPY`, with names and placeholder text generated at render time (ADR 0007); one `"use cache: remote"` component per page part, tagged per part and refreshed with `revalidateTag(tag, { expire: 0 })`, to be confirmed by experiment 1 (ADR 0008); 500 compatible references as text on the product page and numbered reference pages for the rest, tuned by experiment 2 (ADR 0009); Algolia's free plan in EU West, queried only through the site's server route, with model search in PostgreSQL (ADR 0010). Nothing is implemented before its ADR is accepted.

## 2. Working with the owner

- **Early-collaboration pace (until the owner relaxes it):** one step at a time, low autonomy. Ask before acting when unsure about the order of steps, who should decide something, or whether a tool or action is acceptable.
- **Decisions for the owner:** explain each option in plain language (what a visitor sees, or what changes in the code), give pros and cons, and recommend one when it is clearly better, briefly saying why. Ask one or two questions per turn, never a long list.
- **ADRs first:** every significant technical choice is written as an ADR with the options considered, and only the owner marks it Accepted. Experiments and implementation come after.
- **No software installs without approval:** never install, upgrade or uninstall software on the owner's machine. Use portable tools only, in the git-ignored `.tools/` folder. This repository gets its own versions, chosen for its stack; never copy a tool from another project. Before any download, state the file name, source and size, and wait for approval.
- **Spell out acronyms** the first time they appear in a document or reply.

## 3. Quality rules

- **Robustness over apparent success:** a change must be correct by its logic, not because it worked once. This bar is the same for small requests.
  - **Root cause first:** trace the real mechanism, reading framework or library documentation and source when behavior depends on it.
  - **No reliance on timing or luck:** depend on real signals and invariants, never on fixed delays, ordering that merely happens to hold, or retries that hide a failure.
  - **Unhappy paths:** work out what happens when something is slow, fails, is missing or is interrupted, on a slow phone or network as well as a fast desktop. A change must not make any of these worse.
  - **Prove it:** add a regression test that fails without the change and passes with it. When something cannot be tested automatically, say so and say what was checked instead.
  - **No half-measures shipped as fixes:** if the only solution is a workaround or heuristic, tell the owner before implementing it, with its limits and the robust alternative.
  - **Claim only what is guaranteed** in comments, documentation, pull request text and ticked checkboxes.
- **Small, reviewable changes:** weigh optional cleanup or tooling against its measurable benefit, and ask before doing work whose benefit is unclear.
- **Cost-efficient execution:** no repeated CI polling or redundant reads. Give self-contained, mechanical or read-heavy subtasks to a subagent on an economical model (Sonnet or Haiku) when quality holds, and say so in the reply (model and task). Keep design decisions, ADRs, hard debugging and final review on the main model.
- **Public repository:** never commit secrets, keys, tokens or personal data. Environment files stay git-ignored (only `.env.example` may be committed).
- **No machine-specific absolute paths in committed files:** use paths relative to the repository, `%USERPROFILE%` or `~`.

## 4. Documentation

- **Docs as code:** all documentation is Markdown in this repository, the single source of truth. Layout: `docs/adr/` (one ADR per significant choice, indexed in [docs/adr/README.md](docs/adr/README.md)), `docs/specs/` (feature specs, created when needed), `docs/chat-history/` (local log, see section 6).
- **ADR index integrity:** exactly one index row per ADR, with title, link and status matching the ADR file.
- **ADRs stay simple (owner rule):** an ADR records the facts that decide and the decision. When the owner asks for more detail, answer in the conversation instead of growing the ADR.
- Standard Markdown only (relative links, no tool-specific syntax), diagrams as Mermaid code blocks, so documents render on GitHub and in Obsidian.
- **Markdown checks:** until the markdownlint-cli2 workflow chosen in ADR 0004 exists, read every new or changed Markdown file and issue or pull request body to check its headings, lists, tables and checkboxes.

## 5. Git and GitHub

- Repository `sekoya-solutions/sekoya-parts` (public). Branch protection on `main`: a pull request is required, for admins too; only squash merges are allowed, and merged branches are deleted. Required CI checks are added once CI exists.
- **Every change follows:** GitHub issue with acceptance criteria → branch from up-to-date `main` (`feat/<n>-slug`, `fix/<n>-slug`, `chore/<n>-slug`, `docs/<n>-slug`) → pull request from [the template](.github/pull_request_template.md), with `Closes #<n>` → the owner's explicit go → `gh pr merge --squash`. Never commit to `main` directly, and never merge without that go.
- **Labels:** every issue gets one `type:` label and at least one `area:` label. Do not use the GitHub default labels `bug`, `documentation` and `enhancement`, which overlap with `type:` labels; `accessibility` and the triage labels (`duplicate`, `invalid`, `question`, `wontfix`) can be added.
- **Board:** add every issue to the [Sekoya Parts board](https://github.com/users/sekoya-solutions/projects/3) and keep its Status in step: In Progress when work starts, Done only after the pull request is merged.
- **Acceptance criteria and test plans:** tick each item as soon as it is verified (acceptance criteria against the merged result), and never close an issue before its pull request is merged.
- **Issue and pull request bodies:** write them to a file without a byte-order mark and pass it with `--body-file`. After every edit, fetch the saved body and check its line, heading and checkbox counts. Before merging, check that `closingIssuesReferences` lists the issue.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`). Keep AI tool attribution as the tool emits it (for example Claude Code's `Co-Authored-By` trailer).

## 6. Chat history

- This repository opts in to the claude-chat-history hooks: its log is in [docs/chat-history/](docs/chat-history/README.md). When the session-start context says the hooks are active, write each turn's summary file as it describes, and never append entries by hand. In a tool without Claude Code hooks, append entries by hand as that README describes.
- **A session logs into the project it was opened in (owner rule):** work on another project belongs in a session opened in that project, so its turns land in that project's log.

## 7. Maintaining this file

- When the owner gives a general rule or a project-wide decision, add or update it here in the same turn, in the right section.
- Keep this file concise and deduplicated: edit an existing rule rather than adding a contradicting one.
