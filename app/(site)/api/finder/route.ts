// GET /api/finder?lang=<lang>&make=<slug>&appliance=<type>&q=<reference> (issue
// #155): where the part finder's reference field sends its form. A Route
// Handler, as for the header search (app/(site)/api/search/route.ts), so it
// answers with a real 307 before any page renders.
// 1. A reference whose search key equals exactly one model's within the
//    brand and appliance type goes straight to that model's page.
// 2. Anything else goes back to the finder's page, which lists the matches.
import config from "@payload-config";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { NextRequest } from "next/server";
import { getPayload } from "payload";
import {
  FINDER_PARAMS,
  finderPath,
  isLocale,
  modelPath,
} from "../../../../site/addresses.ts";
import { readChoice } from "../../../../site/finder.tsx";
import { findModels } from "../../../../site/model-search.ts";
import { queryOf, searchKey } from "../../../../site/search-key.ts";

/** A temporary redirect: the same choice may lead elsewhere after a catalog change. */
const redirectTo = (request: NextRequest, path: string) =>
  new Response(null, {
    status: 307,
    headers: {
      Location: new URL(path, request.nextUrl).toString(),
      "Cache-Control": "private, no-store",
    },
  });

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const lang = params.get("lang") ?? "";
  if (!isLocale(lang))
    return new Response("Unknown language.", { status: 404 });
  const choice = {
    brand: params.get(FINDER_PARAMS.brand) ?? undefined,
    type: params.get(FINDER_PARAMS.type) ?? undefined,
    q: queryOf(params.get("q") ?? undefined) || undefined,
  };
  const { brand, type } = await readChoice(choice);
  const key = choice.q ? searchKey(choice.q) : null;
  if (brand && type && key) {
    const payload = await getPayload({ config });
    const db = (payload.db as unknown as PostgresAdapter).drizzle;
    // Exact matches come first, so two rows tell one match from several.
    const [first, second] = await findModels(db, key, 2, {
      brandId: brand.id,
      type,
    });
    if (first?.exact && !second?.exact)
      return redirectTo(request, modelPath(lang, first));
  }
  return redirectTo(request, finderPath(lang, choice));
}
