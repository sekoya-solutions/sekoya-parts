// GET /api/models?lang=<lang>&brand=<brand slug>&type=<appliance type>&q=<text>
// (issue #196): the models the home page's part finder lists in its model
// field (site/home-finder.tsx), as JSON.
// - With no q, the brand and type's most popular models, from a cached entry
//   per pair (site/finder-data.ts).
// - With q, the pair's models whose reference starts with it, from the model
//   search index (site/model-search.ts), exact matches first. Not cached:
//   each prefix is different, and storing them would fill the Runtime Cache
//   with entries rarely read again, as for the search page.
// Each model comes with its page's address in the page's language.
import config from "@payload-config";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { NextRequest } from "next/server";
import { getPayload } from "payload";
import {
  isApplianceType,
  isLocale,
  modelPath,
} from "../../../../site/addresses.ts";
import { getBrands } from "../../../../site/brands.tsx";
import { getPopularModels } from "../../../../site/finder-data.ts";
import {
  FINDER_QUERY,
  type FinderModels,
} from "../../../../site/finder-rules.ts";
import { findModels, MODEL_RESULTS } from "../../../../site/model-search.ts";
import { searchKey } from "../../../../site/search-key.ts";

const json = (body: FinderModels | { error: string }, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const lang = params.get(FINDER_QUERY.lang) ?? "";
  const slug = params.get(FINDER_QUERY.brand) ?? "";
  const type = params.get(FINDER_QUERY.type) ?? "";
  const query = (params.get(FINDER_QUERY.q) ?? "").trim();
  if (!isLocale(lang) || !isApplianceType(type))
    return json({ error: "invalid" }, 400);
  const brand = (await getBrands()).find((b) => b.slug === slug);
  if (!brand) return json({ error: "invalid" }, 400);
  const at = (reference: string) => ({
    reference,
    path: modelPath(lang, { brandSlug: brand.slug, reference }),
  });

  if (!query)
    return json({
      popular: true,
      models: (await getPopularModels(brand.id, type)).map(at),
    });
  // A query no reference can start with, such as one with an accent, finds
  // nothing without asking the database.
  const key = searchKey(query);
  if (!key) return json({ popular: false, models: [] });
  const payload = await getPayload({ config });
  const db = (payload.db as unknown as PostgresAdapter).drizzle;
  const matches = await findModels(db, key, MODEL_RESULTS, {
    brandId: brand.id,
    type,
  });
  return json({
    popular: false,
    models: matches.map((model) => at(model.reference)),
  });
}
