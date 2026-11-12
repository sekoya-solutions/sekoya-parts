// The product page's parts (docs/adr/0008-caching-and-partial-refresh.md).
// Each part is its own remote cache entry, tagged per part and with the
// catalog tag, and takes only the product id and the language. Nothing that
// caches wraps them: the page that renders them is not cached itself.
import config from "@payload-config";
import { type PostgresAdapter, sql } from "@payloadcms/db-postgres";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";
import { placeholderDescription, productName } from "../catalog/text.ts";
import type { Locale } from "../cms/locales.ts";

/** References rendered as text on the product page (docs/adr/0009-compatible-references.md). */
export const PRODUCT_PAGE_REFERENCES = 500;

const CATALOG_TAG = "catalog";

/**
 * The product's heading data, or null when the product does not exist. The
 * page reads it first, so a missing product gets a 404 before any part
 * renders. A showcase product's name is edited like its description, so it
 * shares the description's tag.
 */
export async function getProductHeading(
  id: number,
  locale: Locale,
): Promise<{ name: string } | null> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(`product:${id}:description`, CATALOG_TAG);

  const payload = await getPayload({ config });
  const product = await payload.findByID({
    collection: "products",
    id,
    locale,
    depth: 1,
    disableErrors: true,
  });
  if (!product) return null;
  if (product.showcase && product.name) return { name: product.name };
  const brand = typeof product.brand === "object" ? product.brand.name : "";
  const category =
    typeof product.category === "object" ? product.category.name : "";
  return { name: productName(category, brand, product.reference) };
}

export async function ProductPrice({
  id,
  locale,
}: {
  id: number;
  locale: Locale;
}) {
  "use cache: remote";
  cacheLife("max");
  cacheTag(`product:${id}:price`, CATALOG_TAG);

  const payload = await getPayload({ config });
  const product = await payload.findByID({
    collection: "products",
    id,
    depth: 0,
    select: { priceCents: true },
    disableErrors: true,
  });
  if (!product) return null;
  const price = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(product.priceCents / 100);
  return <p>{price}</p>;
}

export async function ProductDescription({
  id,
  locale,
}: {
  id: number;
  locale: Locale;
}) {
  "use cache: remote";
  cacheLife("max");
  cacheTag(`product:${id}:description`, CATALOG_TAG);

  const payload = await getPayload({ config });
  const product = await payload.findByID({
    collection: "products",
    id,
    locale,
    depth: 0,
    select: { showcase: true, description: true },
    disableErrors: true,
  });
  if (!product) return null;
  // Only showcase products store a description; the others get placeholder
  // text generated from the product and the language (ADR 0007).
  const text =
    product.showcase && product.description
      ? product.description
      : placeholderDescription(id, locale);
  return <p>{text}</p>;
}

type ReferenceRow = { id: number; brand: string; reference: string };

// Model names are a brand and a reference, the same in every language
// (ADR 0009), so the list takes only the product id and the ten languages
// share one cache entry.
export async function ProductReferences({ id }: { id: number }) {
  "use cache: remote";
  cacheLife("max");
  cacheTag(`product:${id}:references`, CATALOG_TAG);

  const payload = await getPayload({ config });
  const { drizzle } = payload.db as unknown as PostgresAdapter;
  // A range of ranks on the compatibility key (product, rank), most popular
  // first, with no OFFSET (ADR 0007, ADR 0009).
  const { rows } = await drizzle.execute<ReferenceRow>(sql`
    SELECT m.id, b.name AS brand, m.reference
      FROM compatibility c
      JOIN appliance_models m ON m.id = c.model_id
      JOIN brands b ON b.id = m.brand_id
     WHERE c.product_id = ${id}
       AND c.rank BETWEEN 1 AND ${PRODUCT_PAGE_REFERENCES}
     ORDER BY c.rank
  `);
  // Plain links, so the list runs no code in the browser (ADR 0009). The
  // model pages come with the phase 3 templates.
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.id}>
          <a href={`/model/${row.id}`}>
            {row.brand} {row.reference}
          </a>
        </li>
      ))}
    </ul>
  );
}
