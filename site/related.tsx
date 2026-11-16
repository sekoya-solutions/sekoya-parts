// "Other parts for the same appliances" on the product page (issue #161): the
// products that share the most compatible models with this one, precomputed
// by the generator and the related-products migration (catalog/related.ts).
// One remote cache entry per product and language, like the model page's
// list: tagged with the product's related rows and with each listed product's
// price and description, category and brand, which its card shows.
import config from "@payload-config";
import { type PostgresAdapter, sql } from "@payloadcms/db-postgres";
import { cacheTag } from "next/cache";
import { getPayload } from "payload";
import type { Locale } from "../cms/locales.ts";
import { getDictionary } from "./dictionary.ts";
import { priceAt } from "./merchandising.ts";
import { setPriceLifetime } from "./price-cache.ts";
import { computedAt, type ProductRoute, readProduct } from "./product.tsx";
import { ProductCard, type ShownPrice } from "./product-card.tsx";
import { brandTag, CATALOG_TAG, categoryTag, productTags } from "./tags.ts";

export async function RelatedProducts({
  id,
  locale,
}: {
  id: number;
  locale: Locale;
}) {
  "use cache: remote";
  cacheTag(productTags(id).related, CATALOG_TAG);

  const payload = await getPayload({ config });
  const db = (payload.db as unknown as PostgresAdapter).drizzle;
  const { rows } = await db.execute<{ related_id: number }>(sql`
    SELECT related_id FROM related_products
     WHERE product_id = ${id}
     ORDER BY rank
  `);
  const ids = rows.map((row) => row.related_id);
  if (ids.length === 0) return null;
  const { docs } = await payload.find({
    collection: "products",
    where: { id: { in: ids } },
    locale: "all",
    depth: 1,
    pagination: false,
  });
  // In rank order, which the IN list does not keep.
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const ranked = ids.flatMap((relatedId) => byId.get(relatedId) ?? []);

  const now = Date.now();
  setPriceLifetime(ranked, now);
  const products: { route: ProductRoute; price: ShownPrice }[] = [];
  for (const doc of ranked) {
    const read = readProduct(doc);
    const tags = productTags(doc.id);
    cacheTag(
      tags.price,
      tags.description,
      categoryTag(read.categoryId),
      brandTag(read.brandId),
    );
    products.push({ route: read.route, price: priceAt(doc, now) });
  }

  return (
    <section aria-labelledby="related-title" className="mt-10">
      <h2 id="related-title" className="mb-4 text-2xl font-bold">
        {getDictionary(locale).relatedProducts}
      </h2>
      <ul
        data-list="related"
        data-computed-at={computedAt()}
        className="product-list"
      >
        {products.map(({ route, price }, index) => (
          <ProductCard
            key={route.id}
            route={route}
            price={price}
            locale={locale}
            index={index}
            lazy
          />
        ))}
      </ul>
    </section>
  );
}
