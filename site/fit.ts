// "Does it fit my appliance?" (issue #161): whether a product fits the models
// whose reference has a visitor's search key. One query: the product by its
// unique reference, the models by the search key index
// (migrations/20261114_120000_model_search.ts), and for each model one probe
// of the compatibility key (model, product), so a product with a million
// models answers as fast as one with a few. It takes the database as an
// argument, with no Payload config or Next.js import, so the database test
// runs the same query and checks its plan.
import { type PostgresAdapter, sql } from "@payloadcms/db-postgres";
import type { Locale } from "../cms/locales.ts";
import { isProductReference, modelPath } from "./addresses.ts";
import { MODEL_SEARCH_KEY, searchKey } from "./search-key.ts";

/**
 * The most models one answer lists. Model references are unique within a
 * brand, so a reference repeats at most once per brand.
 */
export const FIT_MODELS = 20;

/** The answer for one model with the visitor's reference. */
export type FitModel = {
  brand: string;
  brandSlug: string;
  reference: string;
  fits: boolean;
};

/**
 * A fit check's answer:
 * - "invalid": the input cannot name a product or a model, and no query ran;
 * - "no-product": no product has the reference;
 * - "checked": the models with the reference, none when no model has it.
 */
export type FitAnswer =
  | { status: "invalid" }
  | { status: "no-product" }
  | { status: "checked"; models: FitModel[] };

/** The longest product reference read; no generated one comes close. */
const MAX_PRODUCT_REFERENCE = 40;

/** The query: one row with no model when the product exists but no model matches. */
export function fitQuery(productReference: string, key: string) {
  const expression = sql.raw(MODEL_SEARCH_KEY);
  return sql`
    SELECT b.name AS brand, b.slug AS brand_slug, m.reference,
           EXISTS (
             SELECT 1 FROM compatibility c
              WHERE c.model_id = m.id AND c.product_id = p.id
           ) AS fits
      FROM products p
      LEFT JOIN appliance_models m ON ${expression} = ${key}
      LEFT JOIN brands b ON b.id = m.brand_id
     WHERE p.reference = ${productReference}
     ORDER BY b.name, m.id
     LIMIT ${FIT_MODELS}
  `;
}

type Database = PostgresAdapter["drizzle"];

/**
 * Checks a product against the models with a reference. An empty, overlong
 * or malformed input is answered "invalid" before any query.
 */
export async function checkFit(
  db: Database,
  productReference: string,
  modelReference: string,
): Promise<FitAnswer> {
  const key = searchKey(modelReference.trim());
  if (
    !key ||
    productReference.length > MAX_PRODUCT_REFERENCE ||
    !isProductReference(productReference)
  )
    return { status: "invalid" };
  const { rows } = await db.execute<{
    brand: string | null;
    brand_slug: string | null;
    reference: string | null;
    fits: boolean;
  }>(fitQuery(productReference, key));
  if (rows.length === 0) return { status: "no-product" };
  return {
    status: "checked",
    models: rows.flatMap((row) =>
      row.reference === null || row.brand === null || row.brand_slug === null
        ? []
        : [
            {
              brand: row.brand,
              brandSlug: row.brand_slug,
              reference: row.reference,
              fits: row.fits,
            },
          ],
    ),
  };
}

/** One model's answer as the browser component receives it, with its page's address. */
export type FitResult = {
  brand: string;
  reference: string;
  fits: boolean;
  path: string;
};

/** The JSON the fit route answers with. */
export type FitResponse =
  | { status: "invalid" | "no-product" }
  | { status: "checked"; models: FitResult[] };

/** An answer in the JSON form, with model addresses in one language. */
export function fitResponse(answer: FitAnswer, locale: Locale): FitResponse {
  if (answer.status !== "checked") return { status: answer.status };
  return {
    status: "checked",
    models: answer.models.map((model) => ({
      brand: model.brand,
      reference: model.reference,
      fits: model.fits,
      path: modelPath(locale, model),
    })),
  };
}
