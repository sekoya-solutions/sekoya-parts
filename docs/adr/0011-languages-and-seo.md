# ADR 0011: Languages and search engine optimization

- Status: Accepted
- Date: 2026-11-11
- Deciders: Owner

## Context

This Architecture Decision Record (ADR) decides how the ten languages are served and how search engines see the site. The forces:

- **Owner decision** ([AGENTS.md](../../AGENTS.md), section 1): ten languages on one domain under path prefixes, `fr` being the source.
- **Crawl showcase.** Search engines crawl only a showcase of a few thousand pages ([ADR 0002](0002-hosting-and-environments.md)).
- **Caching.** Cached parts take only identifiers and the language as input ([ADR 0008](0008-caching-and-partial-refresh.md)).
- **Reference pages.** Numbered pages for a product's compatible references ([ADR 0009](0009-compatible-references.md)).
- **Search.** Every search spends Algolia's small monthly quota, and results pages stay out of search engines ([ADR 0010](0010-search.md)).
- **Translation.** Payload's job translates new showcase products ([ADR 0006](0006-content-management.md)) and needs a service.

### Criteria

1. Ten languages, and the bare domain.
2. Addresses.
3. Language tags.
4. Sitemaps.
5. Crawl control.
6. Translation service.
7. Interface text.

## Options considered

Facts were checked on 2026-11-11.

- **Routing.**
  - Next.js's own guide puts every page under `app/[lang]`, with dictionaries loaded on the server ([internationalization](https://nextjs.org/docs/app/guides/internationalization)). Its example redirects addresses without a language according to the browser's language.
  - next-intl 4.15.0 supports Cache Components through Next.js root parameters ([next-intl issue 1493](https://github.com/amannn/next-intl/issues/1493)). It adds a dependency, for helpers a server-rendered site barely needs.
- **Redirects and addresses.**
  - Google advises against automatically redirecting visitors between language versions. Localized words in addresses are fine ([multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites?hl=en)).
  - Translated path words read naturally for visitors and carry a light ranking signal. They need each page to be found by a stable key, since its words differ in each language. Categories already have a slug in each language ([ADR 0007](0007-catalog-data-model.md)).
  - The same words in every language would keep each page's ten versions at the same path, but read poorly outside one language.
- **Language tags.** Google reads `hreflang` from HTML, HTTP headers or sitemaps. Each version lists every version, itself included, and `x-default` names the fallback ([localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)). Next.js writes these links from `alternates.languages` ([generateMetadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)).
- **Sitemaps.** A sitemap holds at most 50,000 addresses or 50 MB uncompressed ([build a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)). Next.js splits large ones with `generateSitemaps` ([generateSitemaps](https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps)).
- **Crawl control.**
  - A `robots.txt` block stops crawling but not indexing, and a crawler that cannot fetch a page never sees its `noindex` ([block indexing](https://developers.google.com/search/docs/crawling-indexing/block-indexing)).
  - When rules conflict, the most specific rule wins ([robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt?hl=en)).
- **Translation service.**
  - **DeepL** offers a free key without a credit card ([DeepL developers](https://www.deepl.com/en/developers)). It covers French and the nine target languages ([DeepL API reference](https://developers.deepl.com/api-reference/openapi.yaml)), and it refuses requests once the quota is spent ([usage limits](https://developers.deepl.com/docs/resources/usage-limits)). Its free allowance could not be read: either a million characters once or 500,000 a month, and both cover the roughly 180,000 characters needed.
  - **Google Cloud Translation** includes 500,000 characters a month, but needs billing turned on ([Google pricing](https://cloud.google.com/translate/pricing)).
  - **The Claude API** costs a few cents for this volume, but has no lasting free allowance ([Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)).

## Decision

Chosen:

- **Routing** follows Next.js's own pattern, with no library: `app/[lang]` for the ten languages and dictionaries loaded on the server.
- **The bare domain `/`** is a small page listing the ten languages. It is the `x-default` for the home page. Nothing redirects by the browser's language, and addresses without a language return 404.
- **Addresses are translated:**
  - categories at `/<lang>/<category slug>`, for example `/fr/refrigerateur` and `/en/fridge`, and their later pages at `/<lang>/<category slug>/<n>`, 48 products each ([#81](https://github.com/sekoya-solutions/sekoya-parts/issues/81)). Product references hold a letter, so a number there is always a page;
  - products at `/<lang>/<category slug>/<words>-<reference>`, the words taken from the product's generated name in that language;
  - reference pages at the product's address followed by `/<n>`;
  - models at `/<lang>/<model word>/<brand>-<model reference>`, the section word translated, for example `/fr/appareil/...` and `/de/geraet/...`.
- **Each page is found by its stable key:** the product or model reference, or the category slug in a small table per language. An address whose words differ, after a renamed category for example, is permanently redirected to the correct one, so old links keep working.
- **Language tags** go in each page's head through `alternates.languages`, each version pointing to its own translated address, with `x-default` pointing to the French source. The sitemaps do not repeat them.
- **One sitemap** lists the showcase only, a few thousand addresses within the 50,000 limit. It is linked from `robots.txt`.
- **`robots.txt`** disallows everything, then allows the showcase by path. Search results pages and `/admin` stay blocked, so crawlers never spend Algolia's quota.
- **Translation:** DeepL's free API, called by Payload's translation job with a key kept as a Vercel secret.
- **Interface labels** live in one JSON dictionary per language in the repository, loaded on the server. A test checks that every key exists in all ten files.

Why:

- **Readable addresses.** Translated words suit an e-commerce site, as visitors and search engines read them in their own language. Finding pages by stable keys keeps the cache keys of ADR 0008 unchanged: identifiers and the language.
- **No guessed language:** no redirect by browser language, as Google advises.
- **Search pages stay uncrawled,** which protects the search quota. `noindex` alone would let crawlers fetch them.
- **DeepL** is free without a card, covers the ten languages and stops rather than charges at its limit.

What it costs, and where each cost is checked:

- **More routing logic.** The route resolves the stable key and checks the words before rendering. Each version's translated address comes from data the page already loads, and a test covers the redirects.
- **The section word for models** and the allow list in `robots.txt` exist in ten languages.
- **Blocked pages could still be indexed.** A disallowed page linked from elsewhere could appear without content in results, which Google allows. That is acceptable for search pages and the admin.
- **DeepL's free allowance** is 1,000,000 characters in total, once (owner, 2026-11-13), and one translation of the twelve showcase products costs about 45,600. A translation memory keeps every translation through catalog reloads, so only new or changed French text is sent ([#104](https://github.com/sekoya-solutions/sekoya-parts/issues/104)).
- **Sitemaps for the whole catalog** would only need `generateSitemaps` at 50,000 addresses each, if the crawl showcase is ever widened.

## Consequences

Positive:

- Every address reads in its own language, and old addresses redirect to the current ones.
- Search engines see a clean showcase, with correct language links.

Negative:

- Routing resolves keys and redirects, which adds code and tests.
- The `robots.txt` allow list must follow the showcase as it changes.

Follow-up:

- **Implementation, with the owner's account:** create the DeepL API key and store it as a secret in Vercel's Production environment, never on previews, and in GitHub Actions for the live check.
- **Front-end assets record:** the language chooser and the language switch on every page.
