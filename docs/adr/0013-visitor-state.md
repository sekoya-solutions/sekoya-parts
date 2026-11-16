# ADR 0013: Visitor state on cached pages

- Status: Accepted
- Date: 2026-11-15
- Deciders: Owner

## Context

Phase 4 ([#138](https://github.com/sekoya-solutions/sekoya-parts/issues/138)) turns the catalog into a demo shop, with a cart, customer accounts and a mock checkout. This Architecture Decision Record (ADR) chooses where a visitor's cart lives and how per-visitor content appears without slowing the catalog pages. The forces:

- **Owner requirements** ([AGENTS.md](../../AGENTS.md), section 1): mobile performance as high as possible (in Phase 4, at least 90 to merge, owner decision of 2026-11-15), fine-grained cache refresh, no third-party scripts, and free plans.
- **The catalog pages today** are built from cached parts shared by every visitor ([ADR 0008](0008-caching-and-partial-refresh.md)). None reads the request's cookies, so each page is served as static output once built.
- **Hosting.** Each request that renders on the server is a function invocation, counted against Hobby's monthly limits ([ADR 0002](0002-hosting-and-environments.md)).
- **No browser code** is needed today: the language switch is links and the search a form ([ADR 0012](0012-front-end-assets.md)).

### Criteria

1. The catalog pages keep their PageSpeed score and stay static output.
2. No visitor's data in a shared cache entry.
3. Hobby's and Neon's free limits.
4. Works before, or without, the page's JavaScript.
5. Simplicity.

## Options considered

Facts were checked on 2026-11-15, in the documentation shipped with the installed Next.js 16.4.6 (guides "Authentication with Cache Components" and "Keeping pages static"):

- A `"use cache"` or `"use cache: remote"` function cannot call `cookies()`: it throws.
- With Cache Components, reading `cookies()` outside a `<Suspense>` boundary fails the build. The component behind the boundary renders at request time, on every visit, while the rest of the page stays in the static shell. Next.js's own shop example reads the cart count from a cookie this way, in the layout.
- A form whose action is a Server Action works before the page's JavaScript has loaded.
- Browsers keep at least 4,096 bytes per cookie ([RFC 6265](https://www.rfc-editor.org/rfc/rfc6265#section-6.1)).

**Where the cart lives:**

1. **A cookie holding the lines** (product id and quantity):
   - no database write until an order is placed, nothing to purge, and it works for guests and survives sign-in;
   - one browser only, and its size is capped, so the number of lines is too: about 10 bytes a line, so 50 lines take about 500 bytes;
   - a visitor can edit it, but only to ids and quantities they could choose anyway, since prices and availability are read from the catalog.
2. **The database, keyed by an anonymous cookie:**
   - a signed-in customer's cart follows them across devices;
   - every addition writes to Neon, abandoned carts need purging, and carts made by bots take storage.
3. **The browser's local storage:** the server cannot read it, so the cart page and the forms could not work without JavaScript.

**The header's cart count:**

- **A. A server component behind `<Suspense>`,** reading the cookie, as in Next.js's example:
  - the count is in the HTML and works without JavaScript;
  - every view of every page then runs a function for that part, so the catalog pages stop being static output, with a server round trip on each view and Hobby's invocations spent.
- **B. A small browser component** reading the cart cookie once the page's JavaScript runs:
  - the pages stay static and shared, with no server work;
  - the count appears after the scripts run, in a reserved space so nothing shifts, and without JavaScript the cart link shows no number;
  - the cookie must be readable by scripts (not `HttpOnly`), which is acceptable since it holds no secret.
- **C. No count,** a plain cart link: the simplest, but less like a real shop.

## Decision

Chosen:

- **The cart in a cookie** (option 1): lines only, at most 50 lines and 99 of each product, checked on every read, with unknown or withdrawn products dropped.
- **The header's count from a small browser component** (option B). The header's account link is the same for everyone; the account pages send a visitor who is not signed in to the sign-in page.
- **Shop actions are forms,** so they work without JavaScript; JavaScript only spares the full page reload. The cart's forms post to a route of the site's server, `/api/cart` (amended by the owner on 2026-11-16, [#168](https://github.com/sekoya-solutions/sekoya-parts/issues/168)): a Server Action that sets a cookie makes Next.js re-render the current page on the server, so each addition would send the product page again. Without JavaScript the route redirects to the cart page; with it, it answers with a small JSON body and the page stays as it is.
- **The cart, checkout and account pages** read the request on each visit, outside any `<Suspense>` boundary ([#168](https://github.com/sekoya-solutions/sekoya-parts/issues/168)): content behind a boundary is streamed in by a script, so a visitor without JavaScript would never see it. They carry `noindex` and stay out of the sitemap, and `robots.txt` already disallows them.
- **No cookie value enters a shared cache entry.** A test checks that two visitors with different carts get the same HTML for a catalog page.
- **Browser components on catalog pages** hold visitor-only data: the cart count, then the recently viewed products of a later step. Each one is measured by Lighthouse on its preview.

Why:

- **The catalog pages stay as fast and as cheap as today:** nothing in them depends on the visitor, so they stay static output.
- **No database write until an order is placed,** so nothing grows with bots or abandoned carts.
- **Forms work without JavaScript,** as the search form already does.

What it costs:

- **Without JavaScript,** the header shows no count; the cart page still lists everything.
- **A cart stays in one browser** and does not follow a customer to another device.
- **The cart cookie is readable by scripts.** It holds product ids and quantities only, and the site runs no third-party script.
