// The home page's showcase section (issue #111): the products marked as
// showcase in Payload, as category-page cards, below the categories. One
// remote entry shared by the ten languages, in the manner of
// docs/adr/0008-caching-and-partial-refresh.md; the home page, which is not
// cached, picks its language.
import config from "@payload-config";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";
import type { CategoryRow } from "./categories.tsx";
import { computedAt, readProduct } from "./product.tsx";
import { SHOWCASE_LIMIT, showcaseTags } from "./tags.ts";

/** The showcase products, in every language. */
export type ShowcaseRows = { rows: CategoryRow[]; computedAt: string };

/**
 * The showcase products, at most SHOWCASE_LIMIT, the first by reference,
 * read through the index on the showcase flag. Tagged by showcaseTags.
 */
export async function getShowcaseRows(): Promise<ShowcaseRows> {
  "use cache: remote";
  cacheLife("max");

  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "products",
    where: { showcase: { equals: true } },
    locale: "all",
    depth: 1,
    sort: "reference",
    limit: SHOWCASE_LIMIT,
  });
  const reads = docs.map((doc) => ({ doc, read: readProduct(doc) }));
  cacheTag(
    ...showcaseTags(
      reads.map(({ read }) => ({
        id: read.route.id,
        categoryId: read.categoryId,
        brandId: read.brandId,
      })),
    ),
  );
  return {
    rows: reads.map(({ doc, read }) => ({
      route: read.route,
      priceCents: doc.priceCents,
    })),
    computedAt: computedAt(),
  };
}
