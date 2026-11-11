# ADR 0003: Toolchain

- Status: Accepted
- Date: 2026-11-11
- Deciders: Owner

## Context

This Architecture Decision Record (ADR) chooses the tools the code is built with. The forces:

- **Framework and hosting.** [ADR 0001](0001-framework-and-rendering.md) chose Next.js 16 with Cache Components and left the exact version to this record. [ADR 0002](0002-hosting-and-environments.md) chose Vercel's Hobby plan, which builds and runs the code with its own Node versions.
- **One version everywhere.** The same Node version runs on the owner's machine, in continuous integration (CI) on GitHub Actions, and on Vercel, so a result seen in one place holds in the others.
- **Portable tools only.** Nothing is installed system-wide on the owner's Windows machine. Each tool runs from the git-ignored `.tools/` folder, in versions chosen for this repository, and every download is approved first with its file name, source and size ([AGENTS.md](../../AGENTS.md), section 2).
- **Payload, maybe.** The content management system (CMS) record may choose Payload, which has its own Node and Next.js requirements. This record keeps that option open.
- **Public repository.** Dependencies are installed from a lockfile, and supply-chain safety matters.

### Criteria

1. Node version: supported by Vercel, Next.js 16 and Payload, with its support status and end-of-life date.
2. Portable install from `.tools/`, how scripts and CI find each tool, and each download's file name, source and size.
3. Package manager: no global install, a lockfile Vercel detects, reproducible installs in CI.
4. The exact Next.js 16 and React versions, within Payload's range, and how patch and security releases are taken.
5. TypeScript version and strictness.
6. Lint and format: coverage of TypeScript and React, the Next.js rules, speed, and how many packages each option adds.

## Options considered

Versions are the latest stable releases on 2026-11-11, read from each project's release pages, the npm registry and Node's release index. Every link was checked that day. Numbers in parentheses refer to the criteria.

### Node (1)

| Line | Status on 2026-11-11 | End of life | Latest release |
| --- | --- | --- | --- |
| 22 | Maintenance since 2025-10-21 | 2027-04-30 | 22.23.4, 2026-10-20 |
| 24 | Maintenance since 2026-10-20 | 2028-04-30 | 24.22.2, 2026-10-27 |
| 26 | Active long-term support (LTS) since 2026-10-28 | 2029-04-30 | 26.13.0, 2026-10-28 |

Sources: Node's [release schedule](https://github.com/nodejs/Release/blob/main/schedule.json) and [release index](https://nodejs.org/dist/index.json).

- **Next.js 16** needs Node 20.9 or later ([installation](https://nextjs.org/docs/app/getting-started/installation)).
- **Payload** requires `^22.23.4 || >=24.22.1` ([Payload installation](https://payloadcms.com/docs/getting-started/installation)). All three latest releases meet it, Node 26 through the open-ended second range.
- **Vercel** offers 22.x, 24.x and 26.x. Only the major version can be chosen, and Vercel applies minor and patch updates itself. The `engines.node` field of `package.json` overrides the project setting ([Node versions on Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)). Node 26 is the default for new projects ([Vercel changelog](https://vercel.com/changelog/node-js-26-lts-is-now-generally-available-on-vercel)).
- **Security releases.** The October 2026 releases fixed four high-severity issues on all three lines ([October advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)). New releases are announced for 2026-11-11 or shortly after ([November announcement](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases)).
- **Corepack,** the tool that pins Yarn or pnpm versions, is no longer distributed from Node 25 ([Corepack](https://nodejs.org/docs/latest-v24.x/api/corepack.html)).

### Portable install (2)

- **Node** comes as an official zip archive for Windows, with npm inside ([release index](https://nodejs.org/dist/index.json)). It unpacks into `.tools/node`.
- **Verifying the archive.** Node publishes a signed list of SHA-256 checksums and the keys that sign it ([verifying binaries](https://github.com/nodejs/node/blob/main/README.md#verifying-binaries)). The `gpgv` signature checker is already on the machine with Git for Windows.
- **Locally,** a committed helper script puts `.tools/node` first on the `PATH` of the current terminal only, so nothing changes system-wide.
- **In CI,** `actions/setup-node` reads the exact version from a `.node-version` file ([setup-node](https://github.com/actions/setup-node)).

### Package manager (3)

- **npm.** It ships with Node: Node 26.13.0 carries npm 11.20.0 ([release index](https://nodejs.org/dist/index.json)). On Vercel, the npm version follows the project's Node version ([package managers on Vercel](https://vercel.com/docs/package-managers)). `npm ci` installs exactly what the lockfile says ([npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci)). A minimum release age arrived in npm 11.10.0, and an opt-in allowlist for install scripts in 11.16.0 ([npm 11 changelog](https://github.com/npm/cli/blob/release/v11/CHANGELOG.md)). `ignore-scripts` stops dependencies' install scripts altogether ([npm configuration](https://docs.npmjs.com/cli/v11/using-npm/config)). Payload supports npm.
- **pnpm 12.18.0.**
  - Payload prefers it.
  - Its defaults are the strongest: dependency build scripts blocked unless allowed, a one-day minimum release age, and no git or tarball dependencies deeper in the tree ([pnpm supply-chain security](https://pnpm.io/supply-chain-security)). CI installs fail if the lockfile is out of date ([pnpm install](https://pnpm.io/cli/install)).
  - It is one more tool locally and in CI. On Windows, pnpm's documentation warns that Defender may block its standalone executable and suggests installing it with npm ([pnpm installation](https://pnpm.io/installation)).
  - Vercel infers the pnpm version from the lockfile format, unless Corepack is turned on with a setting Vercel calls experimental ([package managers on Vercel](https://vercel.com/docs/package-managers), [build configuration](https://vercel.com/docs/builds/configure-a-build)). The version Vercel runs can therefore differ from the local one.
- **Yarn 4.18.1.** It needs Corepack, which Node 26 no longer ships, so Corepack would have to be installed first ([Yarn installation](https://yarnpkg.com/getting-started/install)).
- **Bun 1.4.4.** A single executable that runs no lifecycle scripts except for packages it is told to trust ([Bun install](https://bun.com/docs/pm/cli/install)). Vercel can install with it ([package managers on Vercel](https://vercel.com/docs/package-managers)). Payload does not list it, though.

### Next.js and React (4)

- **Versions.** Next.js 16.4.6 is the latest release, and React 19.3.1 meets its React requirement (`^18.2.0 || ^19.0.0`) ([npm registry](https://registry.npmjs.org/next/16.4.6), [Next.js releases](https://github.com/vercel/next.js/releases)). Payload supports Next.js 16.2.6 and later ([Payload installation](https://payloadcms.com/docs/getting-started/installation)).
- **Recent security fixes** ([Next.js advisories](https://github.com/vercel/next.js/security/advisories)):
  - 2026-10-14: two critical remote code execution flaws, fixed in 16.4.1. One is in `use cache` functions ([advisory](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr)), the other in image optimization with SVG files ([advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw)).
  - 2026-11-03: seven moderate advisories, all fixed in 16.4.5. Five of them concern `use cache` and Cache Components.
  - Most recent advisories concern the caching that ADR 0001 relies on, so security releases must be taken quickly.
- **Support.** Next.js 16 receives fixes as the active line until Next.js 17 ships ([support policy](https://nextjs.org/support-policy)).

### TypeScript (5)

- **TypeScript 7.0.2** is the latest release. It is a native port, about ten times faster according to its announcement. It turns on `strict` by default, and it has no compiler application programming interface (API) until 7.1 ([TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), [releases](https://github.com/microsoft/TypeScript/releases)). TypeScript 6.0 keeps the API.
- **Next.js** checks types with the project's own `tsc` and documents TypeScript 7 ([TypeScript in Next.js](https://nextjs.org/docs/app/api-reference/config/typescript)). Its minimum is TypeScript 5.1 ([installation](https://nextjs.org/docs/app/getting-started/installation)).

### Lint and format (6)

- **ESLint 10.14.0 with Prettier 3.9.10.**
  - Next.js 16 removed `next lint`. Projects run the ESLint command with `eslint-config-next`, which includes Core Web Vitals and TypeScript rule sets. Some of its bundled plugins do not yet declare ESLint 10 support ([ESLint in Next.js](https://nextjs.org/docs/app/api-reference/config/eslint)).
  - Rules that use type information go through typescript-eslint, which needs the compiler API that TypeScript 7.0 lacks.
  - Formatting needs a second tool, Prettier ([Prettier blog](https://prettier.io/blog/)). In all, this means several plugins and their dependencies.
- **Biome 2.6.6.**
  - One tool lints and formats TypeScript, TSX, JSX, JSON and CSS in a single pass ([language support](https://biomejs.dev/internals/language-support/), [getting started](https://biomejs.dev/guides/getting-started/)).
  - Its `next` and `react` rule groups turn on by themselves when those packages are installed ([domains](https://biomejs.dev/linter/domains/)), and `create-next-app` offers it ([create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app)).
  - The npm package has no dependencies and no install scripts; it pulls one binary for the platform ([npm registry](https://registry.npmjs.org/@biomejs/biome/2.6.6)).
  - It documents support for TypeScript 5.9.

### Summary

| Choice | Options | Main difference |
| --- | --- | --- |
| Node | 22, 24, 26 | Only 26 is in active support; it lasts until 2029-04-30 and is Vercel's default |
| Package manager | npm, pnpm, Yarn, Bun | npm alone ships with Node and runs the same version on Vercel |
| TypeScript | 6.0, 7.0 | 7.0 is native and strict by default, without a compiler API until 7.1 |
| Lint and format | ESLint with Prettier, Biome | Biome is one package without dependencies; ESLint has more Next.js rules |

## Decision

Chosen:

- **Node 26.**
  - The exact release is pinned in `.node-version`, which the local tools and CI both read: 26.13.0 today, replaced by the security release announced for 2026-11-11.
  - `package.json` sets `engines.node` to `26.x`, so Vercel runs the same major version with its own latest patch.
- **npm, the copy that ships with Node.** A committed `.npmrc`:
  - turns on `ignore-scripts`, so no dependency runs code at install;
  - sets a minimum release age of three days, so a compromised release has time to be caught before it is installed;
  - saves exact versions.
  - CI installs with `npm ci`.
- **Next.js 16.4.6 and React 19.3.1,** at exact versions, with the lockfile committed.
- **Security releases of Next.js and Node** are taken as soon as they pass CI. For an npm package such as Next.js, this overrides the release-age minimum for that one package.
- **TypeScript 7.0.2,** with `strict` and `noUncheckedIndexedAccess`.
- **Biome 2.6.6** for lint and format.

Why:

- **Node 26** is the only line in active support, and the one Vercel picks by default. It meets Next.js 16 and Payload's range.
- **npm** adds no tool to download. Everywhere, it is the npm that ships with Node 26 (npm 11 on Vercel), without Vercel's experimental Corepack setting. Its install-script and release-age settings bring it close to pnpm's defaults, but only because `.npmrc` turns them on.
- **Next.js 16.4.6** is the latest release and includes the fixes for every advisory published from September to November 2026.
- **TypeScript 7** checks types faster, and Biome does not need the compiler API that 7.0 lacks.
- **Biome** is one package with no dependencies, so there is less to keep up to date and less supply-chain exposure.

What it costs, and where each cost is checked:

- **Vercel's patch.** Vercel's Node patch can differ from the one pinned locally and in CI, since only the major version can be chosen there.
- **Blocked install scripts.** A dependency that needs its install script fails visibly with `ignore-scripts`. That script is then reviewed and run on purpose, and the reason is written down.
- **Release age.** The three-day minimum also delays fixes, so security releases override it, as decided above.
- **pnpm.** Payload prefers pnpm. The CMS record checks Payload with npm on Node 26.
- **Biome's rules.** Biome has fewer Next.js rules than `eslint-config-next` and no type-aware lint rules. The PageSpeed check in CI guards the performance those rules aim at. If a needed rule is missing, ESLint is the fallback.
- **Checks at setup:**
  - that Biome reads the code TypeScript 7 accepts;
  - that the editor supports TypeScript 7.

  TypeScript 6.0 is the fallback.

### Downloads for the owner's approval

| File | Source | Size | Purpose |
| --- | --- | --- | --- |
| `node-v26.13.0-win-x64.zip`, or the 26.x security release that replaces it | [nodejs.org/dist/v26.13.0](https://nodejs.org/dist/v26.13.0/) | 41,157,375 bytes | Node and npm |
| `SHASUMS256.txt.asc` | Same folder | 4,053 bytes | Signed SHA-256 checksums |
| `pubring.kbx` | [nodejs/release-keys](https://github.com/nodejs/release-keys/blob/main/gpg/pubring.kbx) | 95,960 bytes | Keys of Node's release team |
| The packages in the lockfile (Next.js, React, TypeScript, Biome and their dependencies) | [npm public registry](https://docs.npmjs.com/about-the-public-npm-registry) | Known at the first install | Installed into `node_modules`, git-ignored |

- **Today's checksum.** The SHA-256 of `node-v26.13.0-win-x64.zip` is `dcc60d59a0746999f99064a01c020445d54d84228c691cdbf25b49ac3b59150a`.
- **If a security release replaces it,** its file name, size and checksum are given again before it is downloaded.

## Consequences

Positive:

- One package manager, which ships with Node.
- The same Node major everywhere, and the same exact release locally and in CI.
- No dependency runs code at install.
- Lint and format are one package.

Negative:

- Vercel's Node patch may differ from the pinned one.
- A package that needs an install script takes a manual, documented step.
- Biome covers fewer Next.js-specific rules than ESLint.
- TypeScript 7 has no compiler API until 7.1.

Follow-up:

- **Implementation, after each download is approved:**
  - the archive is verified, then unpacked into `.tools/node`;
  - `.node-version`, `.npmrc`, `engines.node` and the `PATH` helper script are written;
  - `node_modules` and the Next.js build folder are added to `.gitignore`.
- **Testing and CI record:**
  - `setup-node` reading `.node-version`, then `npm ci`;
  - `biome check` and a TypeScript check;
  - Markdown lint.
- **CMS record:** Payload with npm on Node 26.
- **Security alerts:** turn on GitHub's Dependabot security alerts for the repository, a setting change for the owner to approve. Node's security releases are followed on its [vulnerability blog](https://nodejs.org/en/blog/vulnerability).
