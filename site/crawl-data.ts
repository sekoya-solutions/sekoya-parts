// The crawl showcase's addresses (issue #121), read from the site's shared
// cache entries, the same ones its pages render from
// (docs/adr/0008-caching-and-partial-refresh.md). Nothing here is cached
// itself, so robots.txt and the sitemap follow every refresh of those
// entries: a renamed category or brand, a product that gains or loses the
// showcase flag, or a new reference order.
import { getCategories } from "./categories.tsx";
import { crawlPaths, SHOWCASE_MODELS_PER_PRODUCT } from "./crawl.ts";
import { getReferenceRows } from "./models.tsx";
import { getShowcaseRows } from "./showcase.tsx";

export async function getCrawlPaths(): Promise<string[]> {
  const [categories, showcase] = await Promise.all([
    getCategories(),
    getShowcaseRows(),
  ]);
  const samples = await Promise.all(
    showcase.rows.map(({ route }) =>
      getReferenceRows(route.id, 1, SHOWCASE_MODELS_PER_PRODUCT),
    ),
  );
  return crawlPaths({
    categories,
    products: showcase.rows.map(({ route }) => route),
    models: samples.flatMap(({ rows }) => rows),
  });
}
