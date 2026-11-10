# Sekoya Parts

A spare-parts e-commerce catalog built to show one thing: that a very large catalog can stay fast. It is a portfolio project, so it demonstrates the feasibility of the catalog only; most product texts are placeholders.

## Status

Bootstrap. There is no application code yet: the technical stack is being written up as Architecture Decision Records (ADRs), and nothing is implemented before the owner approves them.

## What it will demonstrate

- About 100,000 products, about 50,000 of them searchable, across four page templates: home, category listing, product page, and one page per appliance model.
- One product compatible with up to 1,000,000 appliance models. Its page shows the most popular of them as text, within Google's 2 MB crawl limit.
- Ten languages on one domain (`/fr/`, `/en/`, `/de/` and so on), with French as the source. About ten showcase products are translated automatically when added; the rest use placeholder text.
- A PageSpeed score of 95 or more, checked on every commit, and fine-grained cache invalidation: changing a price or a description refreshes only that part of a page.

## License

All rights reserved; see [LICENSE](LICENSE).
