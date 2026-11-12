// The product page's parts (docs/adr/0008-caching-and-partial-refresh.md).
// Each part is its own remote cache entry, tagged per part and with the
// catalog tag, and takes only the product id and the language. Nothing that
// caches wraps them: the page that renders them is not cached itself.
import config from "@payload-config";
import { type PostgresAdapter, sql } from "@payloadcms/db-postgres";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";
import { placeholderDescription } from "../catalog/text.ts";
import type { Locale } from "../cms/locales.ts";
import { productAddresses } from "./addresses.ts";
import { PRODUCT_PAGE_REFERENCES } from "./references.ts";
import {
  brandTag,
  CATALOG_TAG,
  categoryTag,
  productTags,
  referenceTag,
} from "./tags.ts";

/**
 * When a part was computed, rendered as a data-computed-at attribute. It shows
 * which parts a refresh re-ran (experiment 1, docs/experiments/) and stays for
 * the end-to-end test that checks a price edit changes nothing else.
 */
const computedAt = () => new Date().toISOString();

/** A product found by its reference: its id, and its name and address in each language. */
export type ProductRoute = {
  id: number;
  names: Record<Locale, string>;
  paths: Record<Locale, string>;
  computedAt: string;
};

// With locale "all", Payload returns each localized field as an object keyed
// by language.
type AllLocales = Record<string, string | null | undefined>;
const allLocales = (value: unknown): AllLocales =>
  value !== null && typeof value === "object" ? (value as AllLocales) : {};

/**
 * Reads a product by its reference, with no cache: the cached lookup below
 * and the build's list of pages built in advance both use it. Null when no
 * product has that reference.
 */
export async function readProductRoute(reference: string): Promise<{
  route: ProductRoute;
  brandId: number;
  categoryId: number;
} | null> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "products",
    where: { reference: { equals: reference } },
    locale: "all",
    depth: 1,
    limit: 1,
    pagination: false,
  });
  const product = docs[0];
  if (!product) return null;
  if (typeof product.brand !== "object" || typeof product.category !== "object")
    throw new Error(`Product ${reference}: brand or category not populated.`);
  const { names, paths } = productAddresses({
    reference: product.reference,
    showcaseNames: product.showcase ? allLocales(product.name) : null,
    categoryNames: allLocales(product.category.name),
    categorySlugs: allLocales(product.category.slug),
    brand: product.brand.name,
  });
  return {
    route: { id: product.id, names, paths, computedAt: computedAt() },
    brandId: product.brand.id,
    categoryId: product.category.id,
  };
}

/**
 * The product with this reference, or null, which the page answers with a
 * 404. One entry per reference, shared by the ten languages. It is refreshed
 * by the reference's tag (a new or renamed product), the description's tag,
 * which covers the product's name, reference, brand and category, and the
 * category's and brand's tags, since an ordinary product's name and address
 * are built from them. The page's heading reads its names.
 */
export async function getProductRoute(
  reference: string,
): Promise<ProductRoute | null> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(referenceTag(reference), CATALOG_TAG);

  const found = await readProductRoute(reference);
  if (!found) return null;
  cacheTag(
    productTags(found.route.id).description,
    categoryTag(found.categoryId),
    brandTag(found.brandId),
  );
  return found.route;
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
  cacheTag(productTags(id).price, CATALOG_TAG);

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
  return <p data-computed-at={computedAt()}>{price}</p>;
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
  cacheTag(productTags(id).description, CATALOG_TAG);

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
  return <p data-computed-at={computedAt()}>{text}</p>;
}

type ReferenceRow = { id: number; brand: string; reference: string };

// Model names are a brand and a reference, the same in every language
// (ADR 0009), so the list takes only the product id and the ten languages
// share one cache entry.
export async function ProductReferences({ id }: { id: number }) {
  "use cache: remote";
  cacheLife("max");
  cacheTag(productTags(id).references, CATALOG_TAG);

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
    <ul data-computed-at={computedAt()}>
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
